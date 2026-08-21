import { NextResponse } from 'next/server';
import { sql, checkPin, setSession, clearSession, log } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// List of names for the sign-in screen. No PINs are ever sent to the browser.
export async function GET() {
  try {
    const users = await sql`SELECT id, name, role FROM users WHERE is_active ORDER BY id`;
    return NextResponse.json({ users });
  } catch (e) {
    return NextResponse.json({ error: dbHint(e) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { userId, pin, logout } = await req.json();
    if (logout) {
      await clearSession();
      return NextResponse.json({ ok: true });
    }
    const rows = await sql`SELECT * FROM users WHERE id = ${userId} AND is_active`;
    const user = rows[0];
    if (!user || !checkPin(pin, user.pin_hash)) {
      return NextResponse.json({ error: 'Wrong PIN. Try again.' }, { status: 401 });
    }
    await setSession(user);
    await log(user.name, 'Signed in');
    return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
  } catch (e) {
    return NextResponse.json({ error: dbHint(e) }, { status: 500 });
  }
}

function dbHint(e) {
  const m = String(e?.message || e);
  if (m.includes('does not exist')) return 'Tables missing — run db/schema.sql in the Neon SQL Editor.';
  if (m.includes('DATABASE_URL') || m.includes('fetch')) return 'Cannot reach the database — check DATABASE_URL in Vercel.';
  return m;
}
