import { NextResponse } from 'next/server';
import { sql, getUser } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  try {
    const [parties, entries, closings, audit, settings] = await Promise.all([
      sql`SELECT id, kind, name, phone, opening FROM parties WHERE is_active ORDER BY name`,
      sql`SELECT id, type, biz_date::text AS date, party_id, amount, mode, category, ref_no, remarks, created_by
            FROM entries ORDER BY biz_date DESC, id DESC LIMIT 600`,
      sql`SELECT biz_date::text AS date, opening, expected, actual, denoms, status, closed_by FROM closings`,
      sql`SELECT id, who, what, created_at FROM audit ORDER BY id DESC LIMIT 30`,
      sql`SELECT * FROM settings WHERE id = 1`,
    ]);
    return NextResponse.json({ me, parties, entries, closings, audit, settings: settings[0] });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
