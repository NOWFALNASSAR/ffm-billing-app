'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ---------------------------------- utils -------------------------------- */
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const dshow = (d) => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};
const MODES = ['cash', 'credit'];
const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
const CATS = ['Transport', 'Salary', 'Rent', 'Electricity', 'Loading', 'Packing', 'Maintenance', 'Petty cash', 'Other'];

const IN_TYPES = { sale: 1, customer_collection: 1, cash_in: 1, loan_in: 1, investment: 1, purchase_return: 1 };
const LABEL = {
  sale: 'Sale', purchase: 'Purchase', supplier_payment: 'Supplier payment',
  customer_collection: 'Customer collection', expense: 'Expense', cash_in: 'Cash in', cash_out: 'Cash out',
  bank_deposit: 'Bank deposit', bank_withdraw: 'Bank withdrawal', wastage: 'Wastage',
  purchase_return: 'Purchase return',
  opening_purchase: 'Opening purchase', investment: 'Investment', renovation: 'Renovation',
  loan_in: 'Loan received', loan_repay: 'Loan repaid',
};

// Cash moved between drawer and bank — internal, never a gain or a loss.
const bankMove = (t) => t.type === 'bank_deposit' ? Number(t.amount)
  : t.type === 'bank_withdraw' ? -Number(t.amount) : 0;

// Cash drawer effect. Deposits leave the drawer, withdrawals come back to it.
function cashEffect(t) {
  const a = Number(t.amount);
  if (t.is_setup || t.type === 'wastage') return 0;
  if (t.type === 'bank_deposit') return -a;
  if (t.type === 'bank_withdraw') return a;
  if (t.mode !== 'cash') return 0;
  return IN_TYPES[t.type] ? a : -a;
}

const post = async (action, payload) => {
  const r = await fetch('/api/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
};

/* One screen failing must never take the whole app down. */
class Guard extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div className="card">
          <span className="lbl">This screen could not load</span>
          <p className="empty" style={{ padding: '10px 0' }}>
            The rest of the app is fine — tap another tab to carry on.
          </p>
          <p className="k" style={{ fontFamily: 'var(--mono)', fontSize: 12, wordBreak: 'break-word' }}>
            {String(this.state.err?.message || this.state.err)}
          </p>
          <button className="btn ghost" style={{ marginTop: 12 }}
            onClick={() => this.setState({ err: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ==================================== app ================================= */
export default function Page() {
  const [data, setData] = useState(null);
  const [signedOut, setSignedOut] = useState(false);
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState(null);
  const [date, setDate] = useState(today());
  const [toast, setToast] = useState('');

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const refresh = useCallback(async () => {
    const r = await fetch('/api/data');
    if (r.status === 401) { setSignedOut(true); setData(null); return; }
    const j = await r.json();
    if (j.error) { say(j.error); return; }
    setSignedOut(false);
    setData(j);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (action, payload, msg, keepOpen) => {
    try { await post(action, payload); await refresh(); if (msg) say(msg); if (!keepOpen) setSheet(null); }
    catch (e) { say(e.message); }
  };

  if (signedOut) return <Login onIn={refresh} />;
  if (!data) return <div className="wrap" style={{ paddingTop: 60 }}><p className="empty">Loading…</p></div>;

  const me = data.me;
  const parties = data.parties || [];
  const entries = data.entries || [];
  const closings = data.closings || [];
  const settings = data.settings || { shop_name: 'Fresh Control', gp_rate: 12, cash_alert: 1000, start_date: '2026-08-17' };
  const items = data.items || [];
  const orders = data.orders || [];
  const bills = data.bills || [];
  const stock = data.stock || [];
  const users = data.users || [];
  const live = entries.filter((t) => !t.is_setup);
  const dayTx = live.filter((t) => t.date === date);
  const closing = closings.find((c) => c.date === date);
  const dayLocked = closing?.status === 'CLOSED';

  const s = (type) => dayTx.filter((t) => t.type === type).reduce((a, b) => a + Number(b.amount), 0);
  const sales = s('sale'), purch = s('purchase'), exp = s('expense'), waste = s('wastage');
  const purchRet = s('purchase_return');
  const gpRate = Number(settings.gp_rate);
  const gp = sales * (gpRate / 100);

  // Opening is the running balance of every entry before today — never the counted
  // notes. Counting only flags a difference; it must not erase a payment.
  const before = live.filter((t) => t.date < date);
  const openingCash = before.reduce((a, t) => a + cashEffect(t), 0);
  const openingBank = before.reduce((a, t) => a + bankMove(t), 0);
  // One pot: the drawer and the bank are the same money.
  const openingTotal = openingCash + openingBank;
  const bankUpTo = (d) => live.filter((t) => t.date <= d).reduce((a, t) => a + bankMove(t), 0);
  // Moving cash to the bank is not money leaving the business, so it does not count here.
  const potEffect = (t) => (t.type === 'bank_deposit' || t.type === 'bank_withdraw') ? 0 : cashEffect(t);
  const cashIn = dayTx.reduce((a, t) => a + Math.max(0, cashEffect(t)), 0);
  const cashOut = dayTx.reduce((a, t) => a + Math.max(0, -cashEffect(t)), 0);
  const expectedCash = openingCash + cashIn - cashOut;          // notes that should be in the drawer
  const moneyIn = dayTx.reduce((a, t) => a + Math.max(0, potEffect(t)), 0);
  const moneyOut = dayTx.reduce((a, t) => a + Math.max(0, -potEffect(t)), 0);
  const expectedTotal = openingTotal + moneyIn - moneyOut;      // cash + bank together
  const bankTotal = bankUpTo(date);

  const bankedToday = dayTx.reduce((a, t) => a + bankMove(t), 0);

  const c = {
    data, me, parties, entries, live, closings, settings, items, orders, bills, stock, users,
    date, dayTx, closing, dayLocked, sales, purch, purchRet, exp, waste, gp, gpRate,
    openingCash, openingBank, openingTotal, cashIn, cashOut, expectedCash,
    moneyIn, moneyOut, expectedTotal, bankedToday, bankTotal,
    run, say, setSheet, refresh, setDate,
  };

  return (
    <>
      <header className="bar">
        <div style={{ flex: 1 }}>
          <div className="brand">{settings.shop_name}</div>
          <div className="sub">{me.role.toLowerCase()} · {me.name} · v10.1</div>
        </div>
        {me.role === 'BILLING'
          ? <div className="pill" style={{ padding: '9px 12px' }}>{dshow(date)} · today only</div>
          : <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)}
              style={{ width: 152, padding: '9px 10px', fontSize: 13 }} />}
      </header>

      <div className="wrap">
        <Guard key={tab}>
          {tab === 'home' && <Home {...c} />}
          {tab === 'entry' && <Entry {...c} />}
          {tab === 'close' && <DayClose key={date + (closing?.status || '')} {...c} />}
          {tab === 'books' && <Books {...c} />}
          {tab === 'reports' && <Reports {...c} />}
        </Guard>
      </div>

      <nav className="nav">
        {[['home', '▤', 'Today'], ['entry', '＋', 'Entry'], ['close', '🔒', 'Day end'],
          ['books', '📚', 'Books'], ['reports', '📑', 'Reports']].map(([id, ic, lb]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <i>{ic}</i>{lb}
          </button>
        ))}
      </nav>

      {sheet && <Guard key={'sheet-' + sheet}><Sheets c={c} sheet={sheet} close={() => setSheet(null)} /></Guard>}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function Sheets({ c, sheet, close }) {
  if (sheet === 'party') return <PartyForm c={c} close={close} />;
  if (sheet === 'item') return <ItemForm c={c} close={close} />;
  if (sheet === 'bulk') return <BulkForm c={c} close={close} />;
  if (sheet === 'bill') return <BillForm c={c} close={close} />;
  if (sheet === 'setup') return <SetupForm c={c} close={close} />;
  if (sheet === 'order') return <OrderForm c={c} close={close} />;
  if (sheet === 'stock') return <StockForm c={c} close={close} />;
  if (String(sheet).startsWith('list:')) return <DayList c={c} type={String(sheet).slice(5)} close={close} />;
  return <TxnForm c={c} type={sheet} close={close} />;
}

/* --------------------------------- login --------------------------------- */
function Login({ onIn }) {
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/login').then((r) => r.json()).then((j) => {
      if (j.error) setErr(j.error);
      else { setUsers(j.users); setSel(String(j.users[0]?.id || '')); }
    }).catch(() => setErr('Cannot reach the server.'));
  }, []);

  const go = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(sel), pin }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error);
      else onIn();
    } catch { setErr('Cannot reach the server.'); }
    setBusy(false);
  };

  return (
    <div className="wrap" style={{ paddingTop: 70, maxWidth: 400 }}>
      <div className="brand" style={{ fontSize: 26 }}>Fresh <span>Control</span></div>
      <div className="sub" style={{ marginTop: 8 }}>Cash · bank · day closing</div>
      <div className="card" style={{ marginTop: 26 }}>
        <div className="f">
          <label className="lbl">Who is working?</label>
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
          </select>
        </div>
        <div className="f">
          <label className="lbl">PIN</label>
          <input type="password" inputMode="numeric" value={pin} placeholder="4 digits"
            onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        </div>
        {err && <div className="warn">{err}</div>}
        <button className="btn" style={{ marginTop: 8 }} disabled={busy || !sel} onClick={go}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------- today -------------------------------- */
function Home(c) {
  const Row = ({ label, value, type, colour }) => (
    <button className="rowb" style={{ width: '100%', textAlign: 'left' }} onClick={() => c.setSheet('list:' + type)}>
      <span className="k">{label} ›</span>
      <span className="v" style={colour ? { color: colour } : undefined}>{money(value)}</span>
    </button>
  );

  return (
    <>
      <div className="card">
        <span className="lbl">Money in hand · {dshow(c.date)}</span>
        <div className="big" style={{ color: 'var(--mango)' }}>{money(c.expectedTotal)}</div>
        <div className="k" style={{ marginTop: 4 }}>drawer {money(c.expectedCash)} · bank {money(c.bankTotal)}</div>
        <div className="rowb" style={{ marginTop: 10 }}><span className="k">Opening — cash + bank</span>
          <span className="v">{money(c.openingTotal)}</span></div>
        <Row label="Cash in" value={c.cashIn} type="cash_in_all" colour="var(--leaf)" />
        <Row label="Cash out" value={c.cashOut} type="cash_out_all" colour="var(--beet)" />
        <div className="rowb"><span className="k">Of which sent to bank</span><span className="v">{money(c.bankedToday)}</span></div>
        <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Cash in drawer now</b>
          <b className="v" style={{ fontSize: 19 }}>{money(c.expectedCash)}</b></div>
        <div className="rowb"><span className="k">In bank so far</span><span className="v">{money(c.bankTotal)}</span></div>
      </div>

      <div className="card">
        <span className="lbl">The day's business</span>
        <Row label="Sales — all modes" value={c.sales} type="sale" />
        <Row label="Purchases" value={c.purch} type="purchase" />
        <Row label="Purchase returns" value={c.purchRet} type="purchase_return" />
        <Row label="Expenses" value={c.exp} type="expense" />
        <Row label="Wastage" value={c.waste} type="wastage" />
        <div className="rowb"><span className="k">GP at {c.gpRate}% of sales</span>
          <span className="v" style={{ color: 'var(--leaf)' }}>{money(c.gp)}</span></div>
        <div className="rowb"><span className="k">GP after expenses and wastage</span>
          <span className="v" style={{ color: c.gp - c.exp - c.waste >= 0 ? 'var(--leaf)' : 'var(--beet)' }}>
            {money(c.gp - c.exp - c.waste)}</span></div>
      </div>

      <div className="card">
        <span className="lbl">Entries today · {c.dayTx.length}</span>
        {c.dayTx.length === 0
          ? <p className="empty">Nothing recorded yet. Tap Entry below to start.</p>
          : c.dayTx.slice(0, 10).map((t) => <TxRow key={t.id} t={t} c={c} />)}
      </div>
    </>
  );
}

function TxRow({ t, c }) {
  const party = c.parties.find((p) => p.id === t.party_id);
  const net = cashEffect(t);
  const where = net ? 'cash' : 'no cash';
  return (
    <div className="item">
      <div>
        <b style={{ fontSize: 14 }}>{LABEL[t.type]}</b>
        <small>{party ? party.name : t.category || '—'} · {t.mode === 'none' ? where : t.mode}
          {t.ref_no ? ' · ' + t.ref_no : ''} · by {t.created_by}</small>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="v" style={{ color: net > 0 ? 'var(--leaf)' : net < 0 ? 'var(--beet)' : 'var(--muted)' }}>
          {net > 0 ? '+' : net < 0 ? '−' : ''}{money(t.amount)}</span>
        {!c.dayLocked && c.me.role !== 'BILLING' && (
          <button className="pill" onClick={() => c.run('deleteEntry', { id: t.id }, 'Entry deleted')}>del</button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ drill-down list --------------------------- */
function DayList({ c, type, close }) {
  const filters = {
    cash_in_all: (t) => cashEffect(t) > 0,
    cash_out_all: (t) => cashEffect(t) < 0,
  };
  const titles = {
    cash_in_all: 'Cash in', cash_out_all: 'Cash out',
  };
  const f = filters[type] || ((t) => t.type === type);
  const rows = c.dayTx.filter(f);
  const total = rows.reduce((a, t) => a + Number(t.amount), 0);

  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div><div className="brand" style={{ fontSize: 18 }}>{titles[type] || LABEL[type] + 's'}</div>
            <div className="sub">{dshow(c.date)} · {rows.length} entries</div></div>
          <button className="pill" onClick={close}>Close</button>
        </div>
        <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Total</b>
          <b className="v" style={{ fontSize: 19 }}>{money(total)}</b></div>
        {rows.length === 0 ? <p className="empty">Nothing here for this day.</p>
          : rows.map((t) => <TxRow key={t.id} t={t} c={c} />)}
      </div>
    </div>
  );
}

/* ---------------------------------- entry -------------------------------- */
function Entry(c) {
  const daily = [
    ['sale', 'Sale', 'Cash, UPI or card'],
    ['purchase', 'Purchase', 'Goods bought'],
    ['purchase_return', 'Purchase return', 'Goods sent back'],
    ['customer_collection', 'Collection', 'Credit customer paid'],
    ['supplier_payment', 'Supplier payment', 'Mostly cash'],
    ['expense', 'Expense', 'Always cash'],
    ['wastage', 'Wastage', 'Spoiled or thrown'],
    ['bank_deposit', 'Bank deposit', 'Cash to bank'],
    ['bank_withdraw', 'Bank withdrawal', 'Bank to cash'],
    ['cash_in', 'Cash in', 'Any other cash received'],
    ['cash_out', 'Cash out', 'Any other cash paid'],
  ];
  const more = [
    ['party', 'Add supplier / customer', 'New name in the book'],
    ['item', 'Add item', 'For shortage orders'],
    ['order', 'Pass an order', 'Short items to a supplier'],
    ['bill', 'Upload a bill', 'Photo of a purchase bill'],
    ['stock', 'Stock value', 'Physical count value'],
    ['bulk', 'Bulk upload', 'Many entries from CSV'],
    ['setup', 'Opening & investment', 'Before the start date'],
  ];
  return (
    <>
      {c.dayLocked && <div className="warn">{dshow(c.date)} is closed. Reopen it from Day end before adding entries.</div>}
      <div className="grid2" style={{ marginTop: 12 }}>
        {daily.map(([id, t, s]) => (
          <button key={id} className="tile" onClick={() => c.setSheet(id)}><b>{t}</b><em>{s}</em></button>
        ))}
      </div>
      <span className="lbl" style={{ marginTop: 22, display: 'block' }}>Other</span>
      <div className="grid2">
        {more.map(([id, t, s]) => (
          <button key={id} className="tile" onClick={() => c.setSheet(id)}><b>{t}</b><em>{s}</em></button>
        ))}
      </div>
    </>
  );
}

function outstanding(c, partyId) {
  const p = c.parties.find((x) => x.id === partyId);
  if (!p) return 0;
  let bal = Number(p.opening || 0);
  c.entries.filter((t) => t.party_id === partyId).forEach((t) => {
    const a = Number(t.amount);
    if ((t.type === 'purchase' || t.type === 'opening_purchase') && t.mode === 'credit') bal += a;
    if (t.type === 'purchase_return' && t.mode === 'credit') bal -= a;
    if (t.type === 'supplier_payment') bal -= a;
    if (t.type === 'sale' && t.mode === 'credit') bal += a;
    if (t.type === 'customer_collection') bal -= a;
  });
  return bal;
}

/* Searchable party picker — the supplier list gets long. */
function PartyPicker({ c, kind, value, onChange }) {
  const [q, setQ] = useState('');
  const list = c.parties.filter((p) => p.kind === kind);
  const shown = q.trim()
    ? list.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6)
    : [];
  const chosen = list.find((p) => p.id === Number(value));

  return (
    <div className="f">
      <label className="lbl">{kind}</label>
      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={chosen ? `${chosen.name} — type to change` : `Search ${kind} name`} />
      {shown.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {shown.map((p) => (
            <button key={p.id} className="item" style={{ width: '100%', textAlign: 'left' }}
              onClick={() => { onChange(p.id); setQ(''); }}>
              <b style={{ fontSize: 14 }}>{p.name}</b>
              <span className="v" style={{ fontSize: 13 }}>{money(outstanding(c, p.id))}</span>
            </button>
          ))}
        </div>
      )}
      {!q && (
        <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ marginTop: 6 }}>
          <option value="">— choose —</option>
          {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
    </div>
  );
}

function TxnForm({ c, type, close }) {
  const needsParty = ['sale', 'purchase', 'purchase_return', 'supplier_payment', 'customer_collection'].includes(type);
  const kind = ['purchase', 'purchase_return', 'supplier_payment'].includes(type) ? 'supplier' : 'customer';
  const fixedMode = { expense: 'cash', wastage: 'none', bank_deposit: 'cash', bank_withdraw: 'cash',
    cash_in: 'cash', cash_out: 'cash' }[type];
  const defaultParty = kind === 'customer'
    ? c.parties.find((p) => p.kind === 'customer' && p.name.toLowerCase().startsWith('walk'))?.id || ''
    : '';

  const [partyId, setPartyId] = useState(defaultParty);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState(fixedMode || (type === 'sale' ? 'cash' : type === 'supplier_payment' ? 'cash' : 'credit'));
  const [category, setCategory] = useState(CATS[0]);
  const [ref, setRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const [lastAmt, setLastAmt] = useState(0);

  const amt = parseFloat(amount) || 0;
  const out = partyId ? outstanding(c, Number(partyId)) : 0;
  const ok = amt > 0 && (!needsParty || partyId);

  const save = async () => {
    setBusy(true);
    await c.run('entry', {
      type, date: c.date, partyId: needsParty ? Number(partyId) : null, amount: amt, mode,
      category: type === 'expense' ? category : type === 'wastage' ? (remarks || 'wastage') : null,
      ref, remarks,
    }, null, true);
    setBusy(false);
    setSaved((n) => n + 1); setLastAmt(amt);
    setAmount(''); setRef(''); setRemarks('');
  };

  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div><div className="brand" style={{ fontSize: 18 }}>{LABEL[type]}</div>
            <div className="sub">{dshow(c.date)}</div></div>
          <button className="pill" onClick={close}>Close</button>
        </div>

        {needsParty && <PartyPicker c={c} kind={kind} value={partyId} onChange={setPartyId} />}
        {needsParty && partyId !== '' && (
          <p className="k" style={{ marginTop: -6, marginBottom: 12 }}>
            Outstanding now <span className="v">{money(out)}</span>
            {['supplier_payment', 'customer_collection'].includes(type) && amt > 0 &&
              <> → after this <span className="v">{money(out - amt)}</span></>}
          </p>
        )}

        {type === 'expense' && (
          <div className="f"><label className="lbl">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATS.map((x) => <option key={x}>{x}</option>)}
            </select></div>
        )}

        <div className="f">
          <label className="lbl">Amount{type === 'wastage' ? ' — value thrown' : ''}</label>
          <input inputMode="decimal" autoFocus value={amount} placeholder="0"
            onChange={(e) => setAmount(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 26, padding: '16px 14px' }} />
        </div>

        {!fixedMode && (
          <div className="f"><label className="lbl">Payment mode</label>
            <div className="tabs" style={{ padding: 0 }}>
              {MODES.map((m) => (
                <button key={m} type="button" className={'tab' + (mode === m ? ' on' : '')}
                  onClick={() => setMode(m)}>{m}</button>
              ))}
            </div></div>
        )}
        {fixedMode === 'cash' && type !== 'bank_deposit' && type !== 'bank_withdraw' &&
          <p className="k" style={{ marginTop: -6, marginBottom: 12 }}>Cash only.</p>}

        <div className="grid2">
          <div className="f"><label className="lbl">Reference</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bill / voucher" /></div>
          <div className="f"><label className="lbl">{type === 'wastage' ? 'What was wasted' : 'Remarks'}</label>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)}
              placeholder={type === 'wastage' ? 'e.g. tomato 4 kg' : 'Optional'} /></div>
        </div>

        <button className="btn" disabled={!ok || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save and enter next'}
        </button>
        {saved > 0 && <p className="k" style={{ textAlign: 'center', marginTop: 12 }}>
          {saved} saved · last {money(lastAmt)}</p>}
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={close}>
          {saved > 0 ? 'Done' : 'Cancel'}</button>
      </div>
    </div>
  );
}

/* ------------------------------ setup entries ----------------------------- */
function SetupForm({ c, close }) {
  const start = c.settings.start_date || '2026-08-17';
  const [type, setType] = useState('opening_purchase');
  const [date, setD] = useState(() => {
    const d = new Date(start + 'T00:00:00');
    if (isNaN(d.getTime())) return '2026-08-16';
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saved, setSaved] = useState(0);

  const kinds = [
    ['opening_purchase', 'Opening purchase'],
    ['investment', 'Initial investment'],
    ['renovation', 'Renovation expense'],
    ['loan_in', 'Loan received'],
    ['loan_repay', 'Loan repaid'],
  ];
  const needsParty = ['opening_purchase', 'loan_in', 'loan_repay'].includes(type);
  const kind = type === 'opening_purchase' ? 'supplier' : 'customer';

  const save = async () => {
    await c.run('setupEntry', {
      type, date, partyId: needsParty ? Number(partyId) || null : null,
      amount: parseFloat(amount) || 0, mode: type === 'opening_purchase' ? 'credit' : 'cash', remarks,
    }, null, true);
    setSaved((n) => n + 1); setAmount(''); setRemarks('');
  };

  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div className="brand" style={{ fontSize: 18 }}>Opening &amp; investment</div>
            <div className="sub">everything before {dshow(start)}</div></div>
          <button className="pill" onClick={close}>Close</button>
        </div>

        <div className="warn" style={{ marginTop: 0 }}>
          These sit outside the daily cash book. They tell you what has gone into the shop —
          they do not touch today's drawer.
        </div>

        <div className="f" style={{ marginTop: 14 }}><label className="lbl">What is this?</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>

        <div className="f"><label className="lbl">Date — must be before {start}</label>
          <input type="date" value={date} max={start} onChange={(e) => setD(e.target.value)} /></div>

        {needsParty && <PartyPicker c={c} kind={kind} value={partyId} onChange={setPartyId} />}
        {needsParty && kind === 'customer' &&
          <p className="k" style={{ marginTop: -6, marginBottom: 12 }}>
            Add the lender under Books → Customers first if the name is not listed.</p>}

        <div className="f"><label className="lbl">Amount</label>
          <input inputMode="decimal" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 26, padding: '16px 14px' }} /></div>

        <div className="f"><label className="lbl">Remarks</label>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. tiles and shelving" /></div>

        <button className="btn" disabled={!(parseFloat(amount) > 0)} onClick={save}>Save and add another</button>
        {saved > 0 && <p className="k" style={{ textAlign: 'center', marginTop: 12 }}>{saved} saved</p>}
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={close}>Done</button>
      </div>
    </div>
  );
}

/* --------------------------------- pickers -------------------------------- */
function PartyForm({ c, close }) {
  const [kind, setKind] = useState('supplier');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [opening, setOpening] = useState('');
  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div className="brand" style={{ fontSize: 18, marginBottom: 16 }}>New name</div>
        <div className="f"><label className="lbl">Type</label>
          <div className="tabs" style={{ padding: 0 }}>
            {['supplier', 'customer'].map((k) => (
              <button key={k} type="button" className={'tab' + (kind === k ? ' on' : '')}
                onClick={() => setKind(k)}>{k}</button>))}
          </div></div>
        <div className="f"><label className="lbl">Name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABC Vegetables" /></div>
        <div className="grid2">
          <div className="f"><label className="lbl">Phone</label>
            <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="f"><label className="lbl">Opening balance</label>
            <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" /></div>
        </div>
        <button className="btn" disabled={!name.trim()}
          onClick={() => c.run('party', { kind, name, phone, opening }, name.trim() + ' added')}>
          Add {kind}</button>
      </div>
    </div>
  );
}

function ItemForm({ c, close }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('kg');
  const [supplierId, setSupplierId] = useState('');
  const [saved, setSaved] = useState(0);
  const save = async () => {
    await c.run('item', { name, unit, supplierId: Number(supplierId) || null }, null, true);
    setSaved((n) => n + 1); setName('');
  };
  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div className="brand" style={{ fontSize: 18, marginBottom: 14 }}>Add item</div>
        <p className="k" style={{ marginBottom: 14 }}>
          Just the names you stock — no quantities. This is what the shortage order list is built from.
        </p>
        <div className="f"><label className="lbl">Item name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tomato" /></div>
        <div className="f"><label className="lbl">Unit</label>
          <div className="tabs" style={{ padding: 0 }}>
            {['kg', 'box', 'bag', 'piece', 'bunch'].map((u) => (
              <button key={u} type="button" className={'tab' + (unit === u ? ' on' : '')}
                onClick={() => setUnit(u)}>{u}</button>))}
          </div></div>
        <PartyPicker c={c} kind="supplier" value={supplierId} onChange={setSupplierId} />
        <button className="btn" disabled={!name.trim()} onClick={save}>Save and add another</button>
        {saved > 0 && <p className="k" style={{ textAlign: 'center', marginTop: 12 }}>{saved} items added</p>}
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={close}>Done</button>
      </div>
    </div>
  );
}

/* -------------------------------- ordering -------------------------------- */
function OrderForm({ c, close }) {
  const [supplierId, setSupplierId] = useState('');
  const [qty, setQty] = useState({});
  const [remarks, setRemarks] = useState('');

  const supplier = c.parties.find((p) => p.id === Number(supplierId));
  const mine = c.items.filter((i) => !supplierId || !i.supplier_id || i.supplier_id === Number(supplierId));
  const rows = Object.entries(qty).filter(([, v]) => parseFloat(v) > 0)
    .map(([itemId, v]) => ({ itemId: Number(itemId), qty: parseFloat(v) }));

  const textList = rows.map((r) => {
    const it = c.items.find((i) => i.id === r.itemId);
    return `${it.name} — ${r.qty} ${it.unit}`;
  }).join('\n');

  const share = async () => {
    const msg = `${c.settings.shop_name} order ${dshow(c.date)}\n\n${textList}${remarks ? '\n\n' + remarks : ''}`;
    try {
      if (navigator.share) await navigator.share({ text: msg });
      else { await navigator.clipboard.writeText(msg); c.say('Order copied — paste into WhatsApp'); }
    } catch { /* user cancelled */ }
  };

  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div className="brand" style={{ fontSize: 18 }}>Pass an order</div>
            <div className="sub">short items → supplier</div></div>
          <button className="pill" onClick={close}>Close</button>
        </div>

        <PartyPicker c={c} kind="supplier" value={supplierId} onChange={setSupplierId} />

        {c.items.length === 0
          ? <p className="empty">No items yet. Add them from Entry → Add item.</p>
          : (
            <div className="card" style={{ marginTop: 0 }}>
              <span className="lbl">Quantity short</span>
              {mine.map((i) => (
                <div className="den" key={i.id} style={{ gridTemplateColumns: '1fr 90px 44px' }}>
                  <b style={{ fontFamily: 'var(--body)', fontSize: 14 }}>{i.name}</b>
                  <input inputMode="decimal" value={qty[i.id] || ''} placeholder="0"
                    onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} style={{ padding: '10px 12px' }} />
                  <span className="amt">{i.unit}</span>
                </div>
              ))}
            </div>
          )}

        <div className="f" style={{ marginTop: 14 }}><label className="lbl">Note to supplier</label>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" /></div>

        <button className="btn" disabled={!supplierId || rows.length === 0}
          onClick={() => c.run('order', { date: c.date, supplierId: Number(supplierId), rows, remarks },
            `Order passed to ${supplier?.name || 'supplier'}`)}>
          Save order — {rows.length} items
        </button>
        <button className="btn ghost" style={{ marginTop: 10 }} disabled={rows.length === 0} onClick={share}>
          Send on WhatsApp
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- bills ---------------------------------- */
function BillForm({ c, close }) {
  const [img, setImg] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  // Shrink the photo in the browser — a raw phone photo is far too big to store.
  const pick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        const max = 1100;
        const scale = Math.min(1, max / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * scale);
        cv.height = Math.round(im.height * scale);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        setImg(cv.toDataURL('image/jpeg', 0.55));
      };
      im.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true);
    await c.run('bill', { date: c.date, supplierId: Number(supplierId) || null, amount: parseFloat(amount) || null, ref, image: img }, 'Bill saved');
    setBusy(false);
  };

  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div className="brand" style={{ fontSize: 18, marginBottom: 14 }}>Upload a bill</div>
        <div className="f"><label className="lbl">Photo of the bill</label>
          <input type="file" accept="image/*" capture="environment" onChange={pick} style={{ padding: 10 }} /></div>
        {img && <img src={img} alt="bill" style={{ width: '100%', borderRadius: 12, marginBottom: 14 }} />}
        <PartyPicker c={c} kind="supplier" value={supplierId} onChange={setSupplierId} />
        <div className="grid2">
          <div className="f"><label className="lbl">Amount</label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div>
          <div className="f"><label className="lbl">Bill number</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        </div>
        <button className="btn" disabled={!img || busy} onClick={save}>{busy ? 'Saving…' : 'Save bill'}</button>
        <p className="empty" style={{ fontSize: 12 }}>
          Photos are shrunk before saving. Keep the paper bills as well — this is for quick reference, not a legal record.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ stock value ------------------------------- */
function StockForm({ c, close }) {
  const [value, setValue] = useState('');
  const [remarks, setRemarks] = useState('');
  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div className="brand" style={{ fontSize: 18, marginBottom: 14 }}>Stock value</div>
        <p className="k" style={{ marginBottom: 14 }}>
          Walk the shop, value what is on the racks at your cost, and enter one figure. Weekly is enough.
        </p>
        <div className="f"><label className="lbl">Value on {dshow(c.date)}</label>
          <input inputMode="decimal" autoFocus value={value} placeholder="0"
            onChange={(e) => setValue(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 26, padding: '16px 14px' }} /></div>
        <div className="f"><label className="lbl">Remarks</label>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" /></div>
        <button className="btn" disabled={!(parseFloat(value) >= 0)}
          onClick={() => c.run('stock', { date: c.date, value: parseFloat(value), remarks }, 'Stock value saved')}>
          Save</button>
      </div>
    </div>
  );
}

/* ------------------------------ bulk upload ------------------------------- */
function BulkForm({ c, close }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return { rows: [], problems: [] };
    const head = lines[0].toLowerCase();
    const body = head.includes('date') && head.includes('amount') ? lines.slice(1) : lines;
    const rows = [], problems = [];
    body.forEach((line, i) => {
      const cell = line.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      const [date, type, partyName, amount, mode, category, ref] = cell;
      const n = i + 2;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return problems.push(`Line ${n}: date must look like 2026-08-18`);
      if (!LABEL[type]) return problems.push(`Line ${n}: type "${type}" is not valid`);
      if (!(parseFloat(amount) > 0)) return problems.push(`Line ${n}: amount is missing`);
      if (!MODES.includes((mode || '').toLowerCase())) return problems.push(`Line ${n}: mode must be one of ${MODES.join(', ')}`);
      let partyId = null;
      if (partyName) {
        const p = c.parties.find((x) => x.name.toLowerCase() === partyName.toLowerCase());
        if (!p) return problems.push(`Line ${n}: "${partyName}" is not in your lists`);
        partyId = p.id;
      }
      rows.push({ date, type, partyId, amount: parseFloat(amount), mode: mode.toLowerCase(), category: category || null, ref: ref || null });
    });
    return { rows, problems };
  }, [text, c.parties]);

  const total = parsed.rows.reduce((a, r) => a + r.amount, 0);

  const readFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result));
    r.readAsText(f);
  };

  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div className="brand" style={{ fontSize: 18 }}>Bulk upload</div>
            <div className="sub">past days from a CSV</div></div>
          <button className="pill" onClick={close}>Close</button>
        </div>
        <div className="warn" style={{ marginTop: 0 }}>
          Columns in this order:<br />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>date, type, party, amount, mode, category, reference</span><br />
          Example: <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>2026-08-14, sale, Walk-in customer, 42000, cash, ,</span>
        </div>
        <div className="f" style={{ marginTop: 14 }}><label className="lbl">Choose a CSV file</label>
          <input type="file" accept=".csv,text/csv" onChange={readFile} style={{ padding: 10 }} /></div>
        <div className="f"><label className="lbl">Or paste the rows</label>
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 13 }} /></div>
        {parsed.problems.length > 0 && (
          <div className="warn"><b>Fix these first</b>
            {parsed.problems.slice(0, 8).map((p, i) => <div key={i}>{p}</div>)}
            {parsed.problems.length > 8 && <div>…and {parsed.problems.length - 8} more</div>}</div>
        )}
        {parsed.rows.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="rowb"><span className="k">Rows ready</span><span className="v">{parsed.rows.length}</span></div>
            <div className="rowb"><span className="k">Total value</span><span className="v">{money(total)}</span></div>
          </div>
        )}
        <button className="btn" style={{ marginTop: 14 }}
          disabled={busy || !parsed.rows.length || parsed.problems.length > 0}
          onClick={async () => { setBusy(true); await c.run('bulk', { rows: parsed.rows }, `${parsed.rows.length} entries uploaded`); setBusy(false); }}>
          {busy ? 'Uploading…' : `Upload ${parsed.rows.length || ''} entries`}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------- books --------------------------------- */
function Books(c) {
  const [view, setView] = useState('supplier');
  const [open, setOpen] = useState(null);

  if (open) {
    const p = c.parties.find((x) => x.id === open);
    const rows = c.entries.filter((t) => t.party_id === open);
    return (
      <>
        <button className="pill" style={{ marginTop: 14 }} onClick={() => setOpen(null)}>← Back</button>
        <div className="card">
          <span className="lbl">{p.kind} ledger</span>
          <div className="brand" style={{ fontSize: 20 }}>{p.name}</div>
          <div className="rowb" style={{ marginTop: 12 }}><span className="k">Opening</span><span className="v">{money(p.opening)}</span></div>
          <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Balance</b>
            <b className="v" style={{ fontSize: 19 }}>{money(outstanding(c, open))}</b></div>
        </div>
        <div className="card">
          <span className="lbl">Transactions</span>
          {rows.length === 0 ? <p className="empty">No entries yet.</p> : rows.map((t) => (
            <div className="item" key={t.id}>
              <div><b style={{ fontSize: 14 }}>{LABEL[t.type]}</b>
                <small>{dshow(t.date)} · {t.mode}{t.ref_no ? ' · ' + t.ref_no : ''}</small></div>
              <span className="v">{money(t.amount)}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  const list = c.parties.filter((p) => p.kind === view);
  const total = list.reduce((a, p) => a + outstanding(c, p.id), 0);

  return (
    <>
      <div className="tabs">
        {[['supplier', 'Payable'], ['customer', 'Receivable'], ['orders', 'Orders'], ['items', 'Items'], ['bills', 'Bills']].map(([k, l]) => (
          <button key={k} className={'tab' + (view === k ? ' on' : '')} onClick={() => setView(k)}>{l}</button>))}
      </div>

      {(view === 'supplier' || view === 'customer') && (
        <>
          <div className="card">
            <span className="lbl">Total {view === 'supplier' ? 'payable' : 'receivable'}</span>
            <div className="big">{money(total)}</div>
          </div>
          <div className="card">
            {list.length === 0 ? <p className="empty">Nothing here yet.</p> : list.map((p) => (
              <button key={p.id} className="item" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(p.id)}>
                <div><b style={{ fontSize: 15 }}>{p.name}</b><small>{p.phone || 'no phone'}</small></div>
                <span className="v">{money(outstanding(c, p.id))}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {view === 'orders' && <Orders c={c} />}

      {view === 'items' && (
        <div className="card">
          <span className="lbl">Items · {c.items.length}</span>
          {c.items.length === 0 ? <p className="empty">No items yet. Entry → Add item.</p> : c.items.map((i) => {
            const sup = c.parties.find((p) => p.id === i.supplier_id);
            return (
              <div className="item" key={i.id}>
                <div><b style={{ fontSize: 14 }}>{i.name}</b><small>{i.unit}{sup ? ' · ' + sup.name : ''}</small></div>
                {c.me.role !== 'BILLING' &&
                  <button className="pill" onClick={() => c.run('removeItem', { id: i.id }, 'Item removed')}>remove</button>}
              </div>
            );
          })}
        </div>
      )}

      {view === 'bills' && (
        <div className="card">
          <span className="lbl">Bills · {c.bills.length}</span>
          {c.bills.length === 0 ? <p className="empty">No bills uploaded. Entry → Upload a bill.</p> : c.bills.map((b) => {
            const sup = c.parties.find((p) => p.id === b.supplier_id);
            return (
              <div className="item" key={b.id}>
                <div><b style={{ fontSize: 14 }}>{sup?.name || 'Bill'}</b>
                  <small>{dshow(b.date)}{b.ref_no ? ' · ' + b.ref_no : ''} · by {b.uploaded_by}</small></div>
                <span className="v">{b.amount ? money(b.amount) : '—'}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Orders({ c }) {
  const open = c.orders;
  const bySupplier = {};
  open.forEach((o) => { (bySupplier[o.supplier_id] = bySupplier[o.supplier_id] || []).push(o); });

  const receive = (o) => {
    const it = c.items.find((i) => i.id === o.item_id);
    const q = window.prompt(`How much received? (ordered ${o.qty_ordered} ${it?.unit || ''}, already ${o.qty_received})`);
    if (q && parseFloat(q) > 0) c.run('receiveOrder', { id: o.id, qty: parseFloat(q) }, 'Receipt recorded');
  };

  if (open.length === 0) return <div className="card"><p className="empty">No pending orders. Entry → Pass an order.</p></div>;

  return (
    <>
      {Object.entries(bySupplier).map(([sid, rows]) => {
        const sup = c.parties.find((p) => p.id === Number(sid));
        return (
          <div className="card" key={sid}>
            <span className="lbl">{sup?.name || 'Supplier'} · {rows.length} pending</span>
            {rows.map((o) => {
              const it = c.items.find((i) => i.id === o.item_id);
              const pending = Number(o.qty_ordered) - Number(o.qty_received);
              return (
                <div className="item" key={o.id}>
                  <div><b style={{ fontSize: 14 }}>{it?.name || 'Item'}</b>
                    <small>{dshow(o.date)} · ordered {Number(o.qty_ordered)} {it?.unit} · received {Number(o.qty_received)}</small></div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="v" style={{ color: 'var(--mango)' }}>{pending} {it?.unit}</span>
                    <button className="pill" onClick={() => receive(o)}>receive</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

/* -------------------------------- day close ------------------------------- */
function DayClose(c) {
  const [qty, setQty] = useState(() => {
    const q = {}; DENOMS.forEach((d) => (q[d] = Number(c.closing?.denoms?.[d]) || 0)); return q;
  });
  const [deposit, setDeposit] = useState('');
  const dep = parseFloat(deposit) || 0;
  const notes = DENOMS.reduce((a, d) => a + d * (qty[d] || 0), 0);
  const bankAfter = c.bankTotal + dep;
  const accounted = notes + bankAfter;
  const diff = accounted - c.expectedTotal;
  const alert = Number(c.settings.cash_alert);

  const reopen = () => {
    const reason = window.prompt('Reason for reopening this day?');
    if (reason) c.run('reopen', { date: c.date, reason }, 'Day reopened');
  };

  return (
    <>
      <div className="card">
        <span className="lbl">Opening · {dshow(c.date)}</span>
        <div className="rowb"><span className="k">Cash in drawer</span><span className="v">{money(c.openingCash)}</span></div>
        <div className="rowb"><span className="k">In bank</span><span className="v">{money(c.openingBank)}</span></div>
        <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Total opening</b>
          <b className="v" style={{ fontSize: 19 }}>{money(c.openingTotal)}</b></div>
      </div>

      <div className="card">
        <span className="lbl">Today's movement</span>
        <div className="rowb"><span className="k">Money in</span><span className="v">+{money(c.moneyIn)}</span></div>
        <div className="rowb"><span className="k">Money out</span><span className="v">−{money(c.moneyOut)}</span></div>
        <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Expected — cash + bank</b>
          <b className="v" style={{ fontSize: 19 }}>{money(c.expectedTotal)}</b></div>
        <p className="k" style={{ marginTop: 6 }}>Of which the drawer alone should hold {money(c.expectedCash)}.</p>
      </div>

      <div className="card">
        <span className="lbl">Count the drawer</span>
        {DENOMS.map((d) => (
          <div className="den" key={d}>
            <b>₹{d}</b>
            <input inputMode="numeric" value={qty[d] || ''} placeholder="0" disabled={c.dayLocked}
              onChange={(e) => setQty({ ...qty, [d]: parseInt(e.target.value) || 0 })} style={{ padding: '10px 12px' }} />
            <span className="amt">{money(d * (qty[d] || 0))}</span>
          </div>
        ))}

        <div className="den" style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <b style={{ color: 'var(--mango)' }}>Bank</b>
          <input inputMode="decimal" value={deposit} placeholder="0" disabled={c.dayLocked}
            onChange={(e) => setDeposit(e.target.value)} style={{ padding: '10px 12px' }} />
          <span className="amt">{money(dep)}</span>
        </div>
        <p className="k" style={{ marginTop: 2, marginBottom: 12 }}>Amount sent to the bank today.</p>

        <div className="rowb"><span className="k">Notes counted</span><span className="v">{money(notes)}</span></div>
        <div className="rowb"><span className="k">In bank after today</span><span className="v">{money(bankAfter)}</span></div>
        <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Total accounted</b>
          <b className="v" style={{ fontSize: 19 }}>{money(accounted)}</b></div>
        <div className="rowb"><span className="k">Expected — cash + bank</span><span className="v">{money(c.expectedTotal)}</span></div>
        <div className="rowb"><span className="k">Difference</span>
          <span className="diff" style={{ color: diff === 0 ? 'var(--leaf)' : 'var(--beet)' }}>
            {diff > 0 ? '+' : ''}{money(diff)}</span></div>
        {Math.abs(diff) >= alert && !c.dayLocked &&
          <div className="warn">Difference is over {money(alert)}. Recount before closing.</div>}
        <p className="empty" style={{ fontSize: 12, padding: '6px 0 0' }}>
          Tomorrow opens with {money(c.expectedTotal)} — every entry carried forward, drawer
          {' ' + money(c.expectedCash)} and bank {money(bankAfter)}. If the drawer runs short the bank
          covers it. A counted difference is recorded here but does not change the balance —
          correct it with a Cash in or Cash out entry.
        </p>
      </div>

      {c.dayLocked ? (
        <>
          <div className="warn">Closed by {c.closing.closed_by}. This date is locked.</div>
          {c.me.role !== 'BILLING' && <button className="btn ghost" style={{ marginTop: 12 }} onClick={reopen}>Reopen day</button>}
        </>
      ) : (
        <button className="btn" style={{ marginTop: 14 }} disabled={notes === 0 && dep === 0}
          onClick={() => c.run('close', {
            date: c.date, opening: c.openingCash, expected: c.expectedCash,
            actual: notes, denoms: qty, deposit: dep,
          }, 'Day closed')}>
          Close {dshow(c.date)}
        </button>
      )}

    </>
  );
}

/* --------------------------------- reports -------------------------------- */
function Reports(c) {
  const [range, setRange] = useState('month');
  const from = useMemo(() => {
    const d = new Date(c.date + 'T00:00:00');
    if (range === 'day') return c.date;
    if (isNaN(d.getTime())) return today();
    if (range === 'week') { d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); }
    d.setDate(1); return d.toISOString().slice(0, 10);
  }, [range, c.date]);

  const rows = c.live.filter((t) => t.date >= from && t.date <= c.date);
  const s = (type) => rows.filter((t) => t.type === type).reduce((a, b) => a + Number(b.amount), 0);
  const sales = s('sale'), purch = s('purchase'), exp = s('expense'), waste = s('wastage');
  const purchRet = s('purchase_return');
  const banked = s('bank_deposit');
  const returns = purchRet;
  const gp = sales * (c.gpRate / 100);
  const payable = c.parties.filter((p) => p.kind === 'supplier').reduce((a, p) => a + outstanding(c, p.id), 0);
  const receivable = c.parties.filter((p) => p.kind === 'customer').reduce((a, p) => a + outstanding(c, p.id), 0);

  const byDay = {};
  rows.forEach((t) => {
    byDay[t.date] = byDay[t.date] || { sale: 0, cash: 0 };
    if (t.type === 'sale') byDay[t.date].sale += Number(t.amount);
    byDay[t.date].cash += cashEffect(t);
  });
  const days = Object.keys(byDay).sort().reverse();
  const peak = Math.max(1, ...Object.values(byDay).map((x) => x.sale));

  const expByCat = {};
  rows.filter((t) => t.type === 'expense').forEach((t) => {
    expByCat[t.category || 'Other'] = (expByCat[t.category || 'Other'] || 0) + Number(t.amount);
  });

  return (
    <>
      <div className="tabs">
        {[['day', 'This day'], ['week', 'Last 7 days'], ['month', 'This month']].map(([k, l]) => (
          <button key={k} className={'tab' + (range === k ? ' on' : '')} onClick={() => setRange(k)}>{l}</button>))}
      </div>

      <div className="card">
        <span className="lbl">{dshow(from)} → {dshow(c.date)}</span>
        <div className="big" style={{ color: 'var(--mango)' }}>{money(sales)}</div>
        <div className="k" style={{ marginTop: 4 }}>total sales</div>
        <div className="rowb" style={{ marginTop: 12 }}><span className="k">GP at {c.gpRate}%</span><span className="v">{money(gp)}</span></div>
        <div className="rowb"><span className="k">Expenses</span><span className="v">{money(exp)}</span></div>
        <div className="rowb"><span className="k">Wastage</span><span className="v">{money(waste)}</span></div>
        <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Left after expenses and wastage</b>
          <b className="v" style={{ color: gp - exp - waste >= 0 ? 'var(--leaf)' : 'var(--beet)' }}>{money(gp - exp - waste)}</b></div>
        <div className="rowb"><span className="k">Purchases</span><span className="v">{money(purch)}</span></div>
        <div className="rowb"><span className="k">Purchase returns</span><span className="v">{money(returns)}</span></div>
        <div className="rowb"><span className="k">Cash in drawer</span><span className="v">{money(c.expectedCash)}</span></div>
        <div className="rowb"><span className="k">In bank</span><span className="v">{money(c.bankTotal)}</span></div>
        <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Money in hand — cash + bank</b>
          <b className="v" style={{ color: 'var(--leaf)' }}>{money(c.expectedCash + c.bankTotal)}</b></div>
        <div className="rowb"><span className="k">Sent to bank in this period</span><span className="v">{money(banked)}</span></div>
        <div className="rowb"><span className="k">Supplier payable</span><span className="v">{money(payable)}</span></div>
        <div className="rowb"><span className="k">Customer receivable</span><span className="v">{money(receivable)}</span></div>
      </div>

      {Object.keys(expByCat).length > 0 && (
        <div className="card">
          <span className="lbl">Where the expenses went</span>
          {Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div className="rowb" key={k}><span className="k">{k}</span>
              <span className="v">{money(v)} · {exp ? ((v / exp) * 100).toFixed(0) : 0}%</span></div>
          ))}
        </div>
      )}

      <div className="card">
        <span className="lbl">Day by day — sales / cash movement</span>
        {days.length === 0 ? <p className="empty">No entries in this period.</p> : days.map((d) => (
          <div key={d} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="k">{dshow(d)}</span>
              <span className="v">{money(byDay[d].sale)}
                <span style={{ color: byDay[d].cash >= 0 ? 'var(--leaf)' : 'var(--beet)' }}> / {money(byDay[d].cash)}</span></span>
            </div>
            <div style={{ height: 6, background: 'var(--raise)', borderRadius: 4, marginTop: 7 }}>
              <div style={{ height: 6, width: (byDay[d].sale / peak) * 100 + '%', background: 'var(--mango)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>

      <Investment c={c} />

      <div className="card">
        <span className="lbl">Activity log</span>
        {(c.data.audit || []).map((a) => (
          <div className="item" key={a.id}>
            <div><b style={{ fontSize: 13 }}>{a.what}</b>
              <small>{a.who} · {new Date(a.created_at).toLocaleString('en-IN')}</small></div>
          </div>
        ))}
      </div>

      <SettingsCard c={c} />
    </>
  );
}

/* ------------------------- what has gone into the shop -------------------- */
function Investment({ c }) {
  const setup = (c.entries || []).filter((t) => t.is_setup);
  const t = (type) => setup.filter((x) => x.type === type).reduce((a, b) => a + Number(b.amount), 0);
  const openingPurchase = t('opening_purchase');
  const invested = t('investment');
  const renovation = t('renovation');
  const loans = t('loan_in') - t('loan_repay');
  const totalIntoShop = openingPurchase + renovation;
  const stockList = c.stock || [];
  const stockValue = stockList[0] ? Number(stockList[0].value) : 0;
  const savings = c.expectedTotal || 0;

  if (setup.length === 0 && !stockValue) {
    return (
      <div className="card">
        <span className="lbl">Investment &amp; stock</span>
        <p className="empty">Nothing entered yet. Entry → Opening &amp; investment for what you spent before
          {' ' + dshow(c.settings.start_date)}, and Entry → Stock value after a physical count.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <span className="lbl">Investment &amp; stock</span>
      <div className="rowb"><span className="k">Own investment</span><span className="v">{money(invested)}</span></div>
      <div className="rowb"><span className="k">Loans outstanding</span><span className="v">{money(loans)}</span></div>
      <div className="rowb"><span className="k">Opening purchases</span><span className="v">{money(openingPurchase)}</span></div>
      <div className="rowb"><span className="k">Renovation</span><span className="v">{money(renovation)}</span></div>
      <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Spent on the shop</b>
        <b className="v">{money(totalIntoShop)}</b></div>
      <div className="rowb"><span className="k">Stock value{stockList[0] ? ' · ' + dshow(stockList[0].date) : ''}</span>
        <span className="v">{money(stockValue)}</span></div>
      <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Cash + bank in hand</b>
        <b className="v" style={{ color: 'var(--leaf)' }}>{money(savings)}</b></div>
      <p className="empty" style={{ fontSize: 12, padding: '10px 0 0' }}>
        Money put in {money(invested + loans)} · what you hold today: stock {money(stockValue)} plus
        cash and bank {money(savings)}.
      </p>
    </div>
  );
}

/* -------------------------------- settings -------------------------------- */
function Staff({ c }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('BILLING');
  const [pin, setPin] = useState('');
  const users = c.users || [];

  const rename = (u) => {
    const n = window.prompt(`New name for ${u.name}`, u.name);
    if (n && n.trim() !== u.name) c.run('renameUser', { userId: u.id, name: n }, 'Name changed');
  };
  const reset = (u) => {
    const p = window.prompt(`New PIN for ${u.name} (4 to 6 digits)`);
    if (p) c.run('resetPin', { userId: u.id, pin: p }, 'PIN reset');
  };
  const remove = (u) => {
    if (window.confirm(`Remove access for ${u.name}? Their past entries stay in the records.`))
      c.run('removeUser', { userId: u.id }, 'Access removed');
  };

  return (
    <div style={{ marginTop: 26, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
      <span className="lbl">Staff who can sign in</span>
      {users.map((u) => (
        <div className="item" key={u.id}>
          <div><b style={{ fontSize: 14 }}>{u.name}</b><small>{u.role.toLowerCase()}</small></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="pill" onClick={() => rename(u)}>rename</button>
            <button className="pill" onClick={() => reset(u)}>reset PIN</button>
            {u.id !== c.me.id && <button className="pill" onClick={() => remove(u)}>remove</button>}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 18 }}>
        <span className="lbl">Add someone</span>
        <div className="f"><input value={name} placeholder="Name" onChange={(e) => setName(e.target.value)} /></div>
        <div className="f"><div className="tabs" style={{ padding: 0 }}>
          {['BILLING', 'MANAGER', 'ADMIN'].map((r) => (
            <button key={r} className={'tab' + (role === r ? ' on' : '')} onClick={() => setRole(r)}>{r.toLowerCase()}</button>))}
        </div></div>
        <div className="f"><input inputMode="numeric" value={pin} placeholder="PIN — 4 to 6 digits"
          onChange={(e) => setPin(e.target.value)} /></div>
        <button className="btn ghost" disabled={!name.trim() || !pin}
          onClick={() => { c.run('addUser', { name: name.trim(), role, pin }, name.trim() + ' can now sign in'); setName(''); setPin(''); }}>
          Add staff</button>
        <p className="empty" style={{ fontSize: 12, padding: '10px 0 0' }}>
          <b>Billing</b> enters today's sales, purchases, expenses and closes the day. Cannot back-date, delete,
          reopen, bulk upload, or see settings.<br />
          <b>Manager</b> can back-date, delete entries, reopen days, bulk upload, enter opening figures and stock value.<br />
          <b>Admin</b> everything, plus staff.
        </p>
      </div>
    </div>
  );
}

function SettingsCard({ c }) {
  const [form, setForm] = useState({
    shop_name: c.settings.shop_name, gp_rate: c.settings.gp_rate, cash_alert: c.settings.cash_alert,
  });
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');

  const logout = async () => {
    await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logout: true }) });
    window.location.reload();
  };

  return (
    <div className="card">
      <span className="lbl">Settings</span>
      {c.me.role !== 'BILLING' && (
        <>
          <div className="f"><label className="lbl">Shop name</label>
            <input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
          <div className="grid2">
            <div className="f"><label className="lbl">GP % of sales</label>
              <input inputMode="decimal" value={form.gp_rate} onChange={(e) => setForm({ ...form, gp_rate: e.target.value })} /></div>
            <div className="f"><label className="lbl">Cash difference alert ₹</label>
              <input inputMode="numeric" value={form.cash_alert} onChange={(e) => setForm({ ...form, cash_alert: e.target.value })} /></div>
          </div>
          <button className="btn ghost" onClick={() => c.run('settings', form, 'Settings saved')}>Save settings</button>
          <p className="empty" style={{ fontSize: 12, padding: '8px 0 0' }}>
            GP is {c.gpRate}% of sales — a working figure for judging expenses, not accounting gross profit.
            Business start date: {c.settings.start_date}.
          </p>
        </>
      )}

      <div style={{ marginTop: 22 }}>
        <span className="lbl">Change my PIN</span>
        <div className="grid2">
          <div className="f"><input type="password" inputMode="numeric" placeholder="Current PIN"
            value={oldPin} onChange={(e) => setOldPin(e.target.value)} /></div>
          <div className="f"><input type="password" inputMode="numeric" placeholder="New PIN"
            value={newPin} onChange={(e) => setNewPin(e.target.value)} /></div>
        </div>
        <button className="btn ghost" disabled={!oldPin || !newPin}
          onClick={() => { c.run('changePin', { oldPin, newPin }, 'PIN changed'); setOldPin(''); setNewPin(''); }}>
          Change PIN</button>
      </div>

      {c.me.role === 'ADMIN' && <Staff c={c} />}

      <button className="btn ghost" style={{ marginTop: 22 }} onClick={logout}>Sign out</button>
    </div>
  );
}
