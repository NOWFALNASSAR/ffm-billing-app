import { neon } from '@neondatabase/serverless';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';

export const sql = neon(process.env.DATABASE_URL);

const SECRET = process.env.SESSION_SECRET || 'change-me-in-vercel-env';

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return salt + ':' + key;
}

export function checkPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, key] = stored.split(':');
  const test = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(test, 'hex'));
}

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex');
}

export async function setSession(user) {
  const value = `${user.id}.${user.name}.${user.role}`;
  const jar = await cookies();
  jar.set('fc_session', `${value}.${sign(value)}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete('fc_session');
}

export async function getUser() {
  const jar = await cookies();
  const raw = jar.get('fc_session')?.value;
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const [id, name, role, mac] = parts;
  const value = `${id}.${name}.${role}`;
  if (sign(value) !== mac) return null;
  return { id: Number(id), name, role };
}

export async function log(who, what) {
  await sql`INSERT INTO audit (who, what) VALUES (${who}, ${what})`;
}
