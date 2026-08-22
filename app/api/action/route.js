import { NextResponse } from 'next/server';
import { sql, getUser, log, hashPin, checkPin } from '../../../lib/db';

export const dynamic = 'force-dynamic';

const money = (n) => '₹' + Math.round(Number(n)).toLocaleString('en-IN');

export async function POST(req) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { action, payload = {} } = await req.json();

  try {
    switch (action) {
      case 'entry': {
        const { type, date, partyId, amount, mode, category, ref, remarks } = payload;
        const amt = Number(amount);
        if (!(amt > 0)) return bad('Amount must be more than zero.');
        await sql`
          INSERT INTO entries (type, biz_date, party_id, amount, mode, category, ref_no, remarks, created_by)
          VALUES (${type}, ${date}, ${partyId || null}, ${amt}, ${mode},
                  ${category || null}, ${ref || null}, ${remarks || null}, ${me.name})`;
        await log(me.name, `${type} ${money(amt)} on ${date}`);
        return ok();
      }

      case 'deleteEntry': {
        if (me.role === 'CASHIER') return bad('Cashiers cannot delete entries.');
        const rows = await sql`SELECT * FROM entries WHERE id = ${payload.id}`;
        if (!rows[0]) return bad('Entry not found.');
        const closed = await sql`SELECT status FROM closings WHERE biz_date = ${rows[0].biz_date}`;
        if (closed[0]?.status === 'CLOSED') return bad('That day is closed. Reopen it first.');
        await sql`DELETE FROM entries WHERE id = ${payload.id}`;
        await log(me.name, `Deleted ${rows[0].type} ${money(rows[0].amount)}`);
        return ok();
      }

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

      case 'close': {
        const { date, opening, expected, actual, denoms } = payload;
        await sql`
          INSERT INTO closings (biz_date, opening, expected, actual, denoms, status, closed_by)
          VALUES (${date}, ${Number(opening)}, ${Number(expected)}, ${Number(actual)},
                  ${JSON.stringify(denoms || {})}, 'CLOSED', ${me.name})
          ON CONFLICT (biz_date) DO UPDATE SET
            opening = EXCLUDED.opening, expected = EXCLUDED.expected, actual = EXCLUDED.actual,
            denoms = EXCLUDED.denoms, status = 'CLOSED', closed_by = EXCLUDED.closed_by, closed_at = now()`;
        await log(me.name, `Closed ${date}: counted ${money(actual)}, difference ${money(actual - expected)}`);
        return ok();
      }

      case 'reopen': {
        if (me.role === 'CASHIER') return bad('Only a manager or owner can reopen a day.');
        if (!payload.reason) return bad('A reason is needed to reopen a day.');
        await sql`UPDATE closings SET status = 'REOPENED' WHERE biz_date = ${payload.date}`;
        await log(me.name, `Reopened ${payload.date} — ${payload.reason}`);
        return ok();
      }

      case 'settings': {
        if (me.role === 'CASHIER') return bad('Cashiers cannot change settings.');
        await sql`
          UPDATE settings SET shop_name = ${payload.shop_name}, gp_method = ${payload.gp_method},
            gp_rate = ${Number(payload.gp_rate)}, cash_alert = ${Number(payload.cash_alert)} WHERE id = 1`;
        return ok();
      }

      case 'changePin': {
        const rows = await sql`SELECT * FROM users WHERE id = ${me.id}`;
        if (!checkPin(payload.oldPin, rows[0].pin_hash)) return bad('Current PIN is wrong.');
        if (!/^\d{4,6}$/.test(String(payload.newPin))) return bad('New PIN must be 4 to 6 digits.');
        await sql`UPDATE users SET pin_hash = ${hashPin(payload.newPin)} WHERE id = ${me.id}`;
        await log(me.name, 'Changed own PIN');
        return ok();
      }

      case 'addUser': {
        if (me.role !== 'OWNER') return bad('Only the owner can add staff.');
        if (!/^\d{4,6}$/.test(String(payload.pin))) return bad('PIN must be 4 to 6 digits.');
        await sql`INSERT INTO users (name, role, pin_hash)
                  VALUES (${payload.name}, ${payload.role}, ${hashPin(payload.pin)})`;
        await log(me.name, `Added user ${payload.name} (${payload.role})`);
        return ok();
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

const ok = () => NextResponse.json({ ok: true });
const bad = (msg) => NextResponse.json({ error: msg }, { status: 400 });
