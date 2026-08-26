import { NextResponse } from 'next/server';
import { sql, getUser } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  try {
    const [parties, entries, closings, audit, settings, users, items, orders, bills, stock, pricing, docs, customers] = await Promise.all([
      sql`SELECT id, kind, name, phone, opening FROM parties WHERE is_active ORDER BY name`,
      sql`SELECT id, type, biz_date::text AS date, party_id, amount, mode, category, ref_no, remarks,
                 created_by, is_setup
            FROM entries ORDER BY biz_date DESC, id DESC LIMIT 800`,
      sql`SELECT biz_date::text AS date, opening, expected, actual, bank_balance, denoms, status, closed_by FROM closings`,
      sql`SELECT id, who, what, created_at FROM audit ORDER BY id DESC LIMIT 30`,
      sql`SELECT * FROM settings WHERE id = 1`,
      sql`SELECT id, name, role FROM users WHERE is_active ORDER BY id`,
      sql`SELECT id, name, unit, supplier_id, category, sale_rate, cost_rate FROM items WHERE is_active ORDER BY name`,
      sql`SELECT o.id, o.biz_date::text AS date, o.supplier_id, o.item_id, o.qty_ordered, o.qty_received,
                 o.status, o.remarks
            FROM orders o WHERE o.status IN ('OPEN','PARTIAL') ORDER BY o.biz_date DESC, o.id DESC LIMIT 200`,
      sql`SELECT id, biz_date::text AS date, supplier_id, amount, ref_no, uploaded_by
            FROM bills ORDER BY biz_date DESC, id DESC LIMIT 60`,
      sql`SELECT biz_date::text AS date, value, remarks FROM stock_counts ORDER BY biz_date DESC LIMIT 12`,
      // per-item pricing history for the margin report
      sql`SELECT l.item_id, d.kind,
                 AVG(l.rate)::numeric(12,2) AS avg_rate,
                 MIN(l.rate)::numeric(12,2) AS min_rate,
                 MAX(l.rate)::numeric(12,2) AS max_rate,
                 SUM(l.qty)::numeric(14,3)  AS qty,
                 SUM(l.amount)::numeric(14,2) AS amount,
                 MAX(d.biz_date)::text AS last_date
            FROM doc_lines l JOIN docs d ON d.id = l.doc_id
           WHERE d.biz_date > CURRENT_DATE - 90
           GROUP BY l.item_id, d.kind`,
      sql`SELECT d.id, d.kind, d.biz_date::text AS date, d.cust_name, d.phone, d.total, d.created_by
            FROM docs d ORDER BY d.id DESC LIMIT 60`,
      // one row per shopper, built from their bills
      sql`SELECT phone,
                 MAX(cust_name) AS name,
                 COUNT(*)::int AS visits,
                 SUM(total)::numeric(14,2) AS spent,
                 AVG(total)::numeric(14,2) AS avg_bill,
                 MAX(biz_date)::text AS last_visit,
                 MIN(biz_date)::text AS first_visit
            FROM docs
           WHERE kind = 'sale' AND phone IS NOT NULL AND phone <> ''
           GROUP BY phone ORDER BY MAX(biz_date) DESC LIMIT 300`,
    ]);
    return NextResponse.json({
      me, parties, entries, closings, audit, settings: settings[0], users, items, orders, bills, stock,
      pricing, docs, customers,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
