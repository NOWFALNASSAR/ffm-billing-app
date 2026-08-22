'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

/* ---------------------------------- utils -------------------------------- */
const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const dshow = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const MODES = ['cash', 'upi', 'card', 'bank', 'credit'];
const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
const CATS = ['Transport', 'Salary', 'Rent', 'Electricity', 'Loading', 'Packing', 'Maintenance', 'Petty cash', 'Other'];
const CASH_IN = { sale: 1, customer_collection: 1, cash_in: 1 };
const CASH_OUT = { purchase: 1, supplier_payment: 1, expense: 1, cash_out: 1 };
const LABEL = {
  sale: 'Sale', purchase: 'Purchase', supplier_payment: 'Supplier payment',
  customer_collection: 'Customer collection', expense: 'Expense', cash_in: 'Cash in', cash_out: 'Cash out',
};
const cashEffect = (t) =>
  t.mode !== 'cash' ? 0 : CASH_IN[t.type] ? Number(t.amount) : CASH_OUT[t.type] ? -Number(t.amount) : 0;

const post = async (action, payload) => {
  const r = await fetch('/api/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
};

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

  const run = async (action, payload, msg) => {
    try { await post(action, payload); await refresh(); if (msg) say(msg); setSheet(null); }
    catch (e) { say(e.message); }
  };

  if (signedOut) return <Login onIn={refresh} />;
  if (!data) return <div className="wrap" style={{ paddingTop: 60 }}><p className="empty">Loading…</p></div>;

  const { me, parties, entries, closings, settings } = data;
  const dayTx = entries.filter((t) => t.date === date);
  const closing = closings.find((c) => c.date === date);
  const dayLocked = closing?.status === 'CLOSED';

  const s = (type) => dayTx.filter((t) => t.type === type).reduce((a, b) => a + Number(b.amount), 0);
  const sales = s('sale'), purch = s('purchase'), exp = s('expense');
  const opGP = sales - purch;
  const gpPct = sales ? (opGP / sales) * 100 : 0;
  const rate = Number(settings.gp_rate);
  const targetSales = settings.gp_method === 'markup' ? purch * (1 + rate / 100) : purch / (1 - rate / 100);

  const prev = closings.filter((c) => c.date < date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const openingCash = prev ? Number(prev.actual) : 0;
  const expectedCash = openingCash + dayTx.reduce((a, t) => a + cashEffect(t), 0);

  const c = { data, me, parties, entries, closings, settings, date, dayTx, closing, dayLocked,
    sales, purch, exp, opGP, gpPct, targetSales, openingCash, expectedCash, run, say, setSheet, refresh };

  return (
    <>
      <header className="bar">
        <div style={{ flex: 1 }}>
          <div className="brand">{settings.shop_name.split(' ')[0]} <span>{settings.shop_name.split(' ').slice(1).join(' ')}</span></div>
          <div className="sub">{me.role.toLowerCase()} · {me.name}</div>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ width: 158, padding: '9px 10px', fontSize: 13 }} />
      </header>

      <div className="wrap">
        {tab === 'home' && <Home {...c} />}
        {tab === 'entry' && <Entry {...c} />}
        {tab === 'close' && <DayClose key={date + (closing?.status || '')} {...c} />}
        {tab === 'parties' && <Parties {...c} />}
        {tab === 'reports' && <Reports {...c} />}
      </div>

      <nav className="nav">
        {[['home', '▤', 'Today'], ['entry', '＋', 'Entry'], ['close', '🔒', 'Day end'],
          ['parties', '👥', 'Parties'], ['reports', '📑', 'Reports']].map(([id, ic, lb]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <i>{ic}</i>{lb}
          </button>
        ))}
      </nav>

      {sheet && (sheet === 'party'
        ? <PartyForm c={c} close={() => setSheet(null)} />
        : <TxnForm c={c} type={sheet} close={() => setSheet(null)} />)}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
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
      <div className="sub" style={{ marginTop: 8 }}>Sales · cash · day closing</div>
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
  const cashOnly = (type) =>
    c.dayTx.filter((t) => t.type === type && t.mode === 'cash').reduce((a, b) => a + Number(b.amount), 0);
  return (
    <>
      <div className="card">
        <span className="lbl">Sales · {dshow(c.date)}</span>
        <div className="big" style={{ color: 'var(--mango)' }}>{money(c.sales)}</div>
        <div className="rowb" style={{ marginTop: 10 }}><span className="k">Purchase</span><span className="v">{money(c.purch)}</span></div>
        <div className="rowb"><span className="k">Operational GP</span>
          <span className="v" style={{ color: c.opGP >= 0 ? 'var(--leaf)' : 'var(--beet)' }}>{money(c.opGP)}</span></div>
        <div className="rowb"><span className="k">GP %</span><span className="v">{c.gpPct.toFixed(2)}%</span></div>
        <div className="rowb"><span className="k">Sales needed at {Number(c.settings.gp_rate)}% {c.settings.gp_method}</span>
          <span className="v">{money(c.targetSales)}</span></div>
        <div className="rowb"><span className="k">Expenses</span><span className="v">{money(c.exp)}</span></div>
      </div>

      <div className="card">
        <span className="lbl">Cash position</span>
        <div className="rowb"><span className="k">Opening cash</span><span className="v">{money(c.openingCash)}</span></div>
        <div className="rowb"><span className="k">Cash sales</span><span className="v">+{money(cashOnly('sale'))}</span></div>
        <div className="rowb"><span className="k">Collections</span><span className="v">+{money(cashOnly('customer_collection'))}</span></div>
        <div className="rowb"><span className="k">Supplier payments</span><span className="v">−{money(cashOnly('supplier_payment'))}</span></div>
        <div className="rowb"><span className="k">Cash purchases</span><span className="v">−{money(cashOnly('purchase'))}</span></div>
        <div className="rowb"><span className="k">Cash expenses</span><span className="v">−{money(cashOnly('expense'))}</span></div>
        <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Expected in drawer</b>
          <b className="v" style={{ fontSize: 19 }}>{money(c.expectedCash)}</b></div>
      </div>

      <div className="card">
        <span className="lbl">Entries today · {c.dayTx.length}</span>
        {c.dayTx.length === 0
          ? <p className="empty">Nothing recorded yet. Tap Entry below to add the first sale or purchase.</p>
          : c.dayTx.slice(0, 10).map((t) => <TxRow key={t.id} t={t} c={c} />)}
      </div>
    </>
  );
}

function TxRow({ t, c }) {
  const party = c.parties.find((p) => p.id === t.party_id);
  const inflow = CASH_IN[t.type];
  return (
    <div className="item">
      <div>
        <b style={{ fontSize: 14 }}>{LABEL[t.type]}</b>
        <small>{party ? party.name : t.category || '—'} · {t.mode}{t.ref_no ? ' · ' + t.ref_no : ''} · by {t.created_by}</small>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="v" style={{ color: inflow ? 'var(--leaf)' : 'var(--beet)' }}>
          {inflow ? '+' : '−'}{money(t.amount)}</span>
        {!c.dayLocked && c.me.role !== 'CASHIER' && (
          <button className="pill" onClick={() => c.run('deleteEntry', { id: t.id }, 'Entry deleted')}>del</button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- entry -------------------------------- */
function Entry(c) {
  const tiles = [
    ['sale', 'Sale', 'Money coming in'],
    ['purchase', 'Purchase', 'Goods bought'],
    ['customer_collection', 'Collection', 'Credit customer paid'],
    ['supplier_payment', 'Supplier payment', 'You paid a supplier'],
    ['expense', 'Expense', 'Transport, salary, rent…'],
    ['cash_in', 'Cash in', 'Owner deposit'],
    ['cash_out', 'Cash out', 'Bank drop, withdrawal'],
    ['party', 'Add supplier / customer', 'New name in the book'],
  ];
  return (
    <>
      {c.dayLocked && <div className="warn">{dshow(c.date)} is closed. Reopen it from Day end before adding entries.</div>}
      <div className="grid2" style={{ marginTop: 12 }}>
        {tiles.map(([id, t, s]) => (
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
    if (t.type === 'purchase' && t.mode === 'credit') bal += a;
    if (t.type === 'supplier_payment') bal -= a;
    if (t.type === 'sale' && t.mode === 'credit') bal += a;
    if (t.type === 'customer_collection') bal -= a;
  });
  return bal;
}

function TxnForm({ c, type, close }) {
  const needsParty = ['sale', 'purchase', 'supplier_payment', 'customer_collection'].includes(type);
  const kind = ['purchase', 'supplier_payment'].includes(type) ? 'supplier' : 'customer';
  const list = c.parties.filter((p) => p.kind === kind);
  const forcedCash = ['cash_in', 'cash_out'].includes(type);

  const [partyId, setPartyId] = useState(list[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState(forcedCash || type === 'sale' ? 'cash' : 'credit');
  const [category, setCategory] = useState(CATS[0]);
  const [ref, setRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const amt = parseFloat(amount) || 0;
  const out = useMemo(() => outstanding(c, Number(partyId)), [c, partyId]);
  const ok = amt > 0 && (!needsParty || partyId);

  const save = async () => {
    setBusy(true);
    await c.run('entry',
      { type, date: c.date, partyId: needsParty ? Number(partyId) : null, amount: amt, mode, category: type === 'expense' ? category : null, ref, remarks },
      LABEL[type] + ' saved');
    setBusy(false);
  };

  return (
    <div className="sheet" onClick={close}>
      <div className="sheetin" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div><div className="brand" style={{ fontSize: 18 }}>{LABEL[type]}</div>
            <div className="sub">{dshow(c.date)}</div></div>
          <button className="pill" onClick={close}>Close</button>
        </div>

        {needsParty && (
          <div className="f">
            <label className="lbl">{kind}</label>
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              {list.length === 0 && <option value="">Add a {kind} first</option>}
              {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {partyId !== '' && (
              <p className="k" style={{ marginTop: 8 }}>
                Outstanding now <span className="v">{money(out)}</span>
                {['supplier_payment', 'customer_collection'].includes(type) && amt > 0 &&
                  <> → after this <span className="v">{money(out - amt)}</span></>}
              </p>
            )}
          </div>
        )}

        {type === 'expense' && (
          <div className="f"><label className="lbl">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATS.map((x) => <option key={x}>{x}</option>)}
            </select></div>
        )}

        <div className="f">
          <label className="lbl">Amount</label>
          <input inputMode="decimal" autoFocus value={amount} placeholder="0"
            onChange={(e) => setAmount(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 26, padding: '16px 14px' }} />
        </div>

        {!forcedCash && (
          <div className="f"><label className="lbl">Payment mode</label>
            <div className="tabs" style={{ padding: 0 }}>
              {MODES.map((m) => (
                <button key={m} type="button" className={'tab' + (mode === m ? ' on' : '')} onClick={() => setMode(m)}>{m}</button>
              ))}
            </div></div>
        )}

        <div className="grid2">
          <div className="f"><label className="lbl">Reference no</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bill / voucher" /></div>
          <div className="f"><label className="lbl">Remarks</label>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" /></div>
        </div>

        <button className="btn" disabled={!ok || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save ' + LABEL[type].toLowerCase()}
        </button>
      </div>
    </div>
  );
}

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
              <button key={k} type="button" className={'tab' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{k}</button>))}
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
          Add {kind}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- parties -------------------------------- */
function Parties(c) {
  const [kind, setKind] = useState('supplier');
  const [open, setOpen] = useState(null);
  const list = c.parties.filter((p) => p.kind === kind);
  const total = list.reduce((a, p) => a + outstanding(c, p.id), 0);

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
              <div><b style={{ fontSize: 14 }}>{LABEL[t.type]}</b><small>{dshow(t.date)} · {t.mode}{t.ref_no ? ' · ' + t.ref_no : ''}</small></div>
              <span className="v">{money(t.amount)}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="tabs">
        {['supplier', 'customer'].map((k) => (
          <button key={k} className={'tab' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
            {k === 'supplier' ? 'Suppliers — payable' : 'Customers — receivable'}</button>))}
      </div>
      <div className="card">
        <span className="lbl">Total {kind === 'supplier' ? 'payable' : 'receivable'}</span>
        <div className="big">{money(total)}</div>
      </div>
      <div className="card">
        {list.length === 0 ? <p className="empty">No {kind}s yet. Add one from Entry → Add supplier / customer.</p> :
          list.map((p) => (
            <button key={p.id} className="item" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(p.id)}>
              <div><b style={{ fontSize: 15 }}>{p.name}</b><small>{p.phone || 'no phone'}</small></div>
              <span className="v">{money(outstanding(c, p.id))}</span>
            </button>
          ))}
      </div>
    </>
  );
}

/* -------------------------------- day close ------------------------------- */
function DayClose(c) {
  const [qty, setQty] = useState(() => {
    const q = {};
    DENOMS.forEach((d) => (q[d] = Number(c.closing?.denoms?.[d]) || 0));
    return q;
  });
  const counted = DENOMS.reduce((a, d) => a + d * (qty[d] || 0), 0);
  const diff = counted - c.expectedCash;
  const alert = Number(c.settings.cash_alert);

  const reopen = () => {
    const reason = window.prompt('Reason for reopening this day?');
    if (reason) c.run('reopen', { date: c.date, reason }, 'Day reopened');
  };

  return (
    <>
      <div className="card">
        <span className="lbl">Day end · {dshow(c.date)}</span>
        <div className="rowb"><span className="k">Opening cash</span><span className="v">{money(c.openingCash)}</span></div>
        <div className="rowb"><span className="k">Cash movement today</span><span className="v">{money(c.expectedCash - c.openingCash)}</span></div>
        <div className="rowb"><b className="k" style={{ color: 'var(--chalk)' }}>Expected cash</b>
          <b className="v" style={{ fontSize: 19 }}>{money(c.expectedCash)}</b></div>
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
        <div className="rowb" style={{ marginTop: 8 }}><b className="k" style={{ color: 'var(--chalk)' }}>Counted</b>
          <b className="v" style={{ fontSize: 19 }}>{money(counted)}</b></div>
        <div className="rowb"><span className="k">Difference</span>
          <span className="diff" style={{ color: diff === 0 ? 'var(--leaf)' : 'var(--beet)' }}>
            {diff > 0 ? '+' : ''}{money(diff)}</span></div>
        {Math.abs(diff) >= alert && !c.dayLocked &&
          <div className="warn">Difference is over {money(alert)}. Recount before closing.</div>}
      </div>

      {c.dayLocked ? (
        <>
          <div className="warn">Closed by {c.closing.closed_by}. Entries for this date are locked.</div>
          {c.me.role !== 'CASHIER' && <button className="btn ghost" style={{ marginTop: 12 }} onClick={reopen}>Reopen day</button>}
        </>
      ) : (
        <button className="btn" style={{ marginTop: 14 }} disabled={counted === 0}
          onClick={() => c.run('close', { date: c.date, opening: c.openingCash, expected: c.expectedCash, actual: counted, denoms: qty }, 'Day closed')}>
          Close {dshow(c.date)}
        </button>
      )}
      <p className="empty" style={{ fontSize: 12 }}>Today's counted cash becomes tomorrow's opening cash automatically.</p>
    </>
  );
}

/* --------------------------------- reports -------------------------------- */
function Reports(c) {
  const [range, setRange] = useState('month');
  const from = useMemo(() => {
    const d = new Date(c.date + 'T00:00:00');
    if (range === 'day') return c.date;
    if (range === 'week') { d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); }
    d.setDate(1); return d.toISOString().slice(0, 10);
  }, [range, c.date]);

  const rows = c.entries.filter((t) => t.date >= from && t.date <= c.date);
  const s = (type) => rows.filter((t) => t.type === type).reduce((a, b) => a + Number(b.amount), 0);
  const sales = s('sale'), purch = s('purchase'), exp = s('expense');
  const gp = sales - purch, pct = sales ? (gp / sales) * 100 : 0;
  const payable = c.parties.filter((p) => p.kind === 'supplier').reduce((a, p) => a + outstanding(c, p.id), 0);
  const receivable = c.parties.filter((p) => p.kind === 'customer').reduce((a, p) => a + outstanding(c, p.id), 0);

  const byDay = {};
  rows.forEach((t) => {
    byDay[t.date] = byDay[t.date] || { sale: 0, purchase: 0 };
    if (t.type === 'sale') byDay[t.date].sale += Number(t.amount);
    if (t.type === 'purchase') byDay[t.date].purchase += Number(t.amount);
  });
  const days = Object.keys(byDay).sort().reverse();
  const peak = Math.max(1, ...Object.values(byDay).map((x) => x.sale));

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
        <div className="rowb" style={{ marginTop: 12 }}><span className="k">Purchase</span><span className="v">{money(purch)}</span></div>
        <div className="rowb"><span className="k">Operational GP</span><span className="v">{money(gp)} · {pct.toFixed(2)}%</span></div>
        <div className="rowb"><span className="k">Expenses</span><span className="v">{money(exp)}</span></div>
        <div className="rowb"><span className="k">GP after expenses</span>
          <span className="v" style={{ color: gp - exp >= 0 ? 'var(--leaf)' : 'var(--beet)' }}>{money(gp - exp)}</span></div>
        <div className="rowb"><span className="k">Supplier payable</span><span className="v">{money(payable)}</span></div>
        <div className="rowb"><span className="k">Customer receivable</span><span className="v">{money(receivable)}</span></div>
      </div>

      <div className="card">
        <span className="lbl">Day by day</span>
        {days.length === 0 ? <p className="empty">No entries in this period.</p> : days.map((d) => (
          <div key={d} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="k">{dshow(d)}</span>
              <span className="v">{money(byDay[d].sale)} <span style={{ color: 'var(--muted)' }}>/ {money(byDay[d].purchase)}</span></span>
            </div>
            <div style={{ height: 6, background: 'var(--raise)', borderRadius: 4, marginTop: 7 }}>
              <div style={{ height: 6, width: (byDay[d].sale / peak) * 100 + '%', background: 'var(--mango)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <span className="lbl">Activity log</span>
        {c.data.audit.length === 0 ? <p className="empty">Nothing logged yet.</p> :
          c.data.audit.map((a) => (
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

function SettingsCard({ c }) {
  const [form, setForm] = useState({
    shop_name: c.settings.shop_name, gp_method: c.settings.gp_method,
    gp_rate: c.settings.gp_rate, cash_alert: c.settings.cash_alert,
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
      <div className="f"><label className="lbl">Shop name</label>
        <input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
      <div className="f"><label className="lbl">GP method</label>
        <div className="tabs" style={{ padding: 0 }}>
          {[['markup', 'Markup on purchase'], ['margin', 'Margin on sales']].map(([k, l]) => (
            <button key={k} className={'tab' + (form.gp_method === k ? ' on' : '')}
              onClick={() => setForm({ ...form, gp_method: k })}>{l}</button>))}
        </div></div>
      <div className="grid2">
        <div className="f"><label className="lbl">GP rate %</label>
          <input inputMode="decimal" value={form.gp_rate} onChange={(e) => setForm({ ...form, gp_rate: e.target.value })} /></div>
        <div className="f"><label className="lbl">Cash difference alert ₹</label>
          <input inputMode="numeric" value={form.cash_alert} onChange={(e) => setForm({ ...form, cash_alert: e.target.value })} /></div>
      </div>
      <button className="btn ghost" onClick={() => c.run('settings', form, 'Settings saved')}>Save settings</button>

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
          Change PIN
        </button>
      </div>

      <button className="btn ghost" style={{ marginTop: 22 }} onClick={logout}>Sign out</button>
      <p className="empty" style={{ fontSize: 12, padding: '10px 0 0' }}>
        GP here is operational: sales minus purchase for the period. It is not accounting gross profit until
        opening and closing stock value are included.
      </p>
    </div>
  );
}
