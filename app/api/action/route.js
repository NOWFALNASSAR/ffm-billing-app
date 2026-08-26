import { NextResponse } from 'next/server';
import { sql, getUser, log, hashPin, checkPin } from '../../../lib/db';

export const dynamic = 'force-dynamic';

const money = (n) => '₹' + Math.round(Number(n)).toLocaleString('en-IN');
const ok = () => NextResponse.json({ ok: true });
const bad = (msg) => NextResponse.json({ error: msg }, { status: 400 });

// Indian date on the server, whatever timezone the machine runs in.
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const SETUP_TYPES = ['opening_purchase', 'investment', 'renovation', 'loan_in', 'loan_repay'];

function dateAllowed(me, date) {
  const t = istToday();
  if (date > t) return 'You cannot enter a future date.';
  if (me.role === 'BILLING' && date !== t) return 'Billing staff can only enter today. Ask a manager for older dates.';
  return null;
}

async function insertEntry(me, r, isSetup = false) {
  await sql`
    INSERT INTO entries (type, biz_date, party_id, amount, mode, category, ref_no, remarks, created_by, is_setup)
    VALUES (${r.type}, ${r.date}, ${r.partyId || null}, ${Number(r.amount)}, ${r.mode || 'cash'},
            ${r.category || null}, ${r.ref || null}, ${r.remarks || null}, ${me.name}, ${isSetup})`;
}

export async function POST(req) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { action, payload = {} } = await req.json();

  try {
    switch (action) {
      /* ---------------------------- daily money ---------------------------- */
      case 'entry': {
        const { type, date, amount } = payload;
        const amt = Number(amount);
        if (!(amt > 0)) return bad('Amount must be more than zero.');
        if (SETUP_TYPES.includes(type)) return bad('Use the Setup screen for opening entries.');
        const err = dateAllowed(me, date);
        if (err) return bad(err);
        const mode = type === 'expense' ? 'cash'
          : type === 'wastage' ? 'none'
          : (type === 'bank_deposit' || type === 'bank_withdraw') ? 'cash'
          : payload.mode;
        await insertEntry(me, { ...payload, mode });
        await log(me.name, `${type} ${money(amt)} on ${date}`);
        return ok();
      }

      case 'deleteEntry': {
        if (me.role === 'BILLING') return bad('Billing staff cannot delete entries.');
        const rows = await sql`SELECT * FROM entries WHERE id = ${payload.id}`;
        if (!rows[0]) return bad('Entry not found.');
        const closed = await sql`SELECT status FROM closings WHERE biz_date = ${rows[0].biz_date}`;
        if (closed[0]?.status === 'CLOSED') return bad('That day is closed. Reopen it first.');
        await sql`DELETE FROM entries WHERE id = ${payload.id}`;
        await log(me.name, `Deleted ${rows[0].type} ${money(rows[0].amount)}`);
        return ok();
      }

      /* --------------------------- item-wise bill -------------------------- */
      case 'bill_doc': {
        const kind = payload.kind === 'purchase' ? 'purchase' : 'sale';
        const lines = Array.isArray(payload.lines) ? payload.lines : [];
        if (!lines.length) return bad('Add at least one item.');
        const err = dateAllowed(me, payload.date);
        if (err) return bad(err);

        const total = lines.reduce((a, l) => a + Number(l.qty) * Number(l.rate), 0);
        if (!(total > 0)) return bad('The bill comes to zero.');

        const mode = payload.mode === 'credit' ? 'credit' : 'cash';
        const rows = await sql`
          INSERT INTO entries (type, biz_date, party_id, amount, mode, ref_no, remarks, created_by, is_setup)
          VALUES (${kind}, ${payload.date}, ${payload.partyId || null}, ${total}, ${mode},
                  ${payload.ref || null}, ${payload.custName ? 'Bill: ' + payload.custName : 'Item bill'},
                  ${me.name}, false)
          RETURNING id`;
        const entryId = rows[0].id;

        const doc = await sql`
          INSERT INTO docs (kind, biz_date, party_id, cust_name, phone, total, entry_id, created_by)
          VALUES (${kind}, ${payload.date}, ${payload.partyId || null}, ${payload.custName || null},
                  ${payload.phone || null}, ${total}, ${entryId}, ${me.name})
          RETURNING id`;
        const docId = doc[0].id;

        for (const l of lines) {
          const amt = Number(l.qty) * Number(l.rate);
          await sql`
            INSERT INTO doc_lines (doc_id, item_id, qty, rate, amount)
            VALUES (${docId}, ${l.itemId}, ${Number(l.qty)}, ${Number(l.rate)}, ${amt})`;
          // remember the rate last used, so the next bill opens with it
          if (kind === 'sale') await sql`UPDATE items SET sale_rate = ${Number(l.rate)} WHERE id = ${l.itemId}`;
          else await sql`UPDATE items SET cost_rate = ${Number(l.rate)} WHERE id = ${l.itemId}`;
        }

        await log(me.name, `${kind === 'sale' ? 'Sale' : 'Purchase'} bill ${money(total)} · ${lines.length} items`);
        return NextResponse.json({ ok: true, docId, total });
      }

      /* ------------------------- balance adjustment ------------------------ */
      case 'adjust': {
        if (me.role !== 'ADMIN') return bad('Only an admin can adjust a balance.');
        const reason = String(payload.reason || '').trim();
        if (reason.length < 3) return bad('A reason is needed for every adjustment.');
        const gap = Number(payload.gap);
        if (!gap) return bad('The corrected amount is the same as the current one.');
        const isReserve = payload.target === 'reserve';
        const type = isReserve
          ? (gap > 0 ? 'bank_deposit' : 'bank_withdraw')
          : (gap > 0 ? 'cash_in' : 'cash_out');
        await insertEntry(me, {
          type, date: payload.date, amount: Math.abs(gap), mode: 'cash',
          category: isReserve ? (payload.name || 'Unnamed') : 'Adjustment',
          remarks: 'Adjustment: ' + reason,
        });
        await log(me.name, `Adjusted ${isReserve ? 'reserve' : 'cash'} by ${money(gap)} — ${reason}`);
        return ok();
      }

      /* --------------------------- setup / opening ------------------------- */
      case 'setupEntry': {
        if (me.role === 'BILLING') return bad('Only a manager or admin can enter opening figures.');
        const { type, date, amount } = payload;
        if (!SETUP_TYPES.includes(type)) return bad('Not a setup entry type.');
        if (!(Number(amount) > 0)) return bad('Amount must be more than zero.');
        const s = await sql`SELECT start_date::text AS d FROM settings WHERE id = 1`;
        if (date >= s[0].d) return bad(`Opening entries must be dated before ${s[0].d}.`);
        await insertEntry(me, { ...payload, mode: payload.mode || 'cash' }, true);
        await log(me.name, `Setup: ${type} ${money(amount)} on ${date}`);
        return ok();
      }

      case 'startDate': {
        if (me.role !== 'ADMIN') return bad('Only an admin can change the start date.');
        await sql`UPDATE settings SET start_date = ${payload.date} WHERE id = 1`;
        await log(me.name, `Start date set to ${payload.date}`);
        return ok();
      }

      /* ------------------------------- parties ----------------------------- */
      case 'party': {
        const name = String(payload.name || '').trim();
        if (!name) return bad('Name is needed.');
        await sql`
          INSERT INTO parties (kind, name, phone, opening)
          VALUES (${payload.kind}, ${name}, ${payload.phone || null}, ${Number(payload.opening) || 0})
          ON CONFLICT (kind, name) DO NOTHING`;
        await log(me.name, `Added ${payload.kind} ${name}`);
        return ok();
      }

      /* -------------------------------- items ------------------------------ */
      case 'item': {
        const name = String(payload.name || '').trim();
        if (!name) return bad('Item name is needed.');
        await sql`
          INSERT INTO items (name, unit, supplier_id, category, sale_rate, cost_rate)
          VALUES (${name}, ${payload.unit || 'kg'}, ${payload.supplierId || null},
                  ${payload.category || 'vegetables'}, ${Number(payload.saleRate) || 0},
                  ${Number(payload.costRate) || 0})
          ON CONFLICT (name) DO UPDATE SET unit = EXCLUDED.unit, supplier_id = EXCLUDED.supplier_id,
            category = EXCLUDED.category, sale_rate = EXCLUDED.sale_rate, cost_rate = EXCLUDED.cost_rate`;
        return ok();
      }

      case 'removeItem': {
        if (me.role === 'BILLING') return bad('Billing staff cannot remove items.');
        await sql`UPDATE items SET is_active = false WHERE id = ${payload.id}`;
        return ok();
      }

      /* ------------------------- shortage and orders ----------------------- */
      case 'order': {
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        if (!rows.length) return bad('Nothing to order.');
        let n = 0;
        for (const r of rows) {
          if (!(Number(r.qty) > 0)) continue;
          await sql`
            INSERT INTO orders (biz_date, supplier_id, item_id, qty_ordered, remarks, created_by)
            VALUES (${payload.date}, ${payload.supplierId}, ${r.itemId}, ${Number(r.qty)},
                    ${payload.remarks || null}, ${me.name})`;
          n++;
        }
        await log(me.name, `Passed an order of ${n} items`);
        return ok();
      }

      case 'receiveOrder': {
        const rows = await sql`SELECT * FROM orders WHERE id = ${payload.id}`;
        if (!rows[0]) return bad('Order not found.');
        const got = Number(rows[0].qty_received) + Number(payload.qty || 0);
        const status = got <= 0 ? 'OPEN' : got + 0.0001 >= Number(rows[0].qty_ordered) ? 'CLOSED' : 'PARTIAL';
        await sql`UPDATE orders SET qty_received = ${got}, status = ${status} WHERE id = ${payload.id}`;
        return ok();
      }

      case 'cancelOrder': {
        if (me.role === 'BILLING') return bad('Billing staff cannot cancel orders.');
        await sql`UPDATE orders SET status = 'CANCELLED' WHERE id = ${payload.id}`;
        return ok();
      }

      /* --------------------------------- bills ----------------------------- */
      case 'bill': {
        const img = String(payload.image || '');
        if (!img.startsWith('data:image')) return bad('Bill photo is missing.');
        if (img.length > 900000) return bad('Photo is too large. Take a plainer, closer photo.');
        await sql`
          INSERT INTO bills (biz_date, supplier_id, amount, ref_no, image, uploaded_by)
          VALUES (${payload.date}, ${payload.supplierId || null}, ${payload.amount || null},
                  ${payload.ref || null}, ${img}, ${me.name})`;
        await log(me.name, `Uploaded a bill for ${payload.date}`);
        return ok();
      }

      case 'deleteBill': {
        if (me.role === 'BILLING') return bad('Billing staff cannot delete bills.');
        await sql`DELETE FROM bills WHERE id = ${payload.id}`;
        return ok();
      }

      /* --------------------------- stock value ----------------------------- */
      case 'stock': {
        if (me.role === 'BILLING') return bad('Only a manager or admin can enter stock value.');
        if (!(Number(payload.value) >= 0)) return bad('Enter the counted stock value.');
        await sql`
          INSERT INTO stock_counts (biz_date, value, remarks, counted_by)
          VALUES (${payload.date}, ${Number(payload.value)}, ${payload.remarks || null}, ${me.name})
          ON CONFLICT (biz_date) DO UPDATE SET value = EXCLUDED.value,
            remarks = EXCLUDED.remarks, counted_by = EXCLUDED.counted_by`;
        await log(me.name, `Stock value ${money(payload.value)} on ${payload.date}`);
        return ok();
      }

      /* ------------------------------ day closing -------------------------- */
      case 'close': {
        const { date, opening, expected, actual, denoms, deposit, adjust, bank } = payload;
        const dep = Number(deposit) || 0;
        if (dep > 0) {
          await insertEntry(me, { type: 'bank_deposit', date, amount: dep, mode: 'cash', remarks: 'Day end deposit' });
        }
        // An excess or shortage found while counting is written into the books,
        // so tomorrow's opening carries the real figure.
        const adj = Number(adjust) || 0;
        if (adj !== 0) {
          await insertEntry(me, {
            type: adj > 0 ? 'cash_in' : 'cash_out', date, amount: Math.abs(adj), mode: 'cash',
            category: 'Day end difference',
            remarks: adj > 0 ? 'Day end excess' : 'Day end shortage',
          });
        }
        await sql`
          INSERT INTO closings (biz_date, opening, expected, actual, bank_balance, denoms, status, closed_by)
          VALUES (${date}, ${Number(opening)}, ${Number(expected)}, ${Number(actual)},
                  ${Number(bank) || 0}, ${JSON.stringify(denoms || {})}, 'CLOSED', ${me.name})
          ON CONFLICT (biz_date) DO UPDATE SET
            opening = EXCLUDED.opening, expected = EXCLUDED.expected, actual = EXCLUDED.actual,
            bank_balance = EXCLUDED.bank_balance, denoms = EXCLUDED.denoms,
            status = 'CLOSED', closed_by = EXCLUDED.closed_by, closed_at = now()`;
        await log(me.name, `Closed ${date}: cash ${money(actual)}, banked ${money(dep)}` +
          (adj ? `, ${adj > 0 ? 'excess' : 'shortage'} ${money(Math.abs(adj))}` : ''));
        return ok();
      }

      case 'reopen': {
        if (me.role === 'BILLING') return bad('Only a manager or admin can reopen a day.');
        if (!payload.reason) return bad('A reason is needed to reopen a day.');
        await sql`UPDATE closings SET status = 'REOPENED' WHERE biz_date = ${payload.date}`;
        await log(me.name, `Reopened ${payload.date} — ${payload.reason}`);
        return ok();
      }

      /* ------------------------------- settings ---------------------------- */
      case 'settings': {
        if (me.role === 'BILLING') return bad('Billing staff cannot change settings.');
        await sql`
          UPDATE settings SET shop_name = ${payload.shop_name}, gp_rate = ${Number(payload.gp_rate)},
            cash_alert = ${Number(payload.cash_alert)},
            upi_id = ${payload.upi_id || ''}, upi_name = ${payload.upi_name || ''} WHERE id = 1`;
        return ok();
      }

      /* --------------------------------- staff ----------------------------- */
      case 'changePin': {
        const rows = await sql`SELECT * FROM users WHERE id = ${me.id}`;
        if (!checkPin(payload.oldPin, rows[0].pin_hash)) return bad('Current PIN is wrong.');
        if (!/^\d{4,6}$/.test(String(payload.newPin))) return bad('New PIN must be 4 to 6 digits.');
        await sql`UPDATE users SET pin_hash = ${hashPin(payload.newPin)} WHERE id = ${me.id}`;
        await log(me.name, 'Changed own PIN');
        return ok();
      }

      case 'addUser': {
        if (me.role !== 'ADMIN') return bad('Only an admin can add staff.');
        if (!/^\d{4,6}$/.test(String(payload.pin))) return bad('PIN must be 4 to 6 digits.');
        await sql`INSERT INTO users (name, role, pin_hash)
                  VALUES (${payload.name}, ${payload.role}, ${hashPin(payload.pin)})`;
        await log(me.name, `Added user ${payload.name} (${payload.role})`);
        return ok();
      }

      case 'renameUser': {
        if (me.role !== 'ADMIN') return bad('Only an admin can rename staff.');
        const newName = String(payload.name || '').trim();
        if (newName.length < 2) return bad('Name is too short.');
        const rows = await sql`SELECT name FROM users WHERE id = ${payload.userId}`;
        if (!rows[0]) return bad('Staff member not found.');
        await sql`UPDATE users SET name = ${newName} WHERE id = ${payload.userId}`;
        await log(me.name, `Renamed ${rows[0].name} to ${newName}`);
        return ok();
      }

      case 'resetPin': {
        if (me.role !== 'ADMIN') return bad('Only an admin can reset a PIN.');
        if (!/^\d{4,6}$/.test(String(payload.pin))) return bad('PIN must be 4 to 6 digits.');
        const rows = await sql`SELECT name FROM users WHERE id = ${payload.userId}`;
        if (!rows[0]) return bad('Staff member not found.');
        await sql`UPDATE users SET pin_hash = ${hashPin(payload.pin)} WHERE id = ${payload.userId}`;
        await log(me.name, `Reset PIN for ${rows[0].name}`);
        return ok();
      }

      case 'removeUser': {
        if (me.role !== 'ADMIN') return bad('Only an admin can remove staff.');
        if (Number(payload.userId) === me.id) return bad('You cannot remove yourself.');
        const rows = await sql`SELECT name FROM users WHERE id = ${payload.userId}`;
        await sql`UPDATE users SET is_active = false WHERE id = ${payload.userId}`;
        await log(me.name, `Removed access for ${rows[0]?.name || payload.userId}`);
        return ok();
      }

      /* ------------------------------ bulk upload -------------------------- */
      case 'bulk': {
        if (me.role === 'BILLING') return bad('Only a manager or admin can bulk upload.');
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        if (!rows.length) return bad('Nothing to upload.');
        if (rows.length > 500) return bad('Upload 500 rows at a time or fewer.');
        let done = 0;
        for (const r of rows) {
          if (!(Number(r.amount) > 0)) continue;
          await insertEntry(me, { ...r, remarks: r.remarks || 'bulk upload' });
          done++;
        }
        await log(me.name, `Bulk uploaded ${done} entries`);
        return NextResponse.json({ ok: true, count: done });
      }

      default:
        return bad('Unknown action.');
    }
  } catch (e) {
    const m = String(e?.message || e);
    if (m.includes('is closed')) return bad('That day is closed. Reopen it before entering.');
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
