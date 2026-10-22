import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Database } from './db.ts';
import type { AccountUser } from '../src/account/shared.ts';

/** Passwords are stored as scrypt hashes with their own salt; sessions as a random token in an
 * HttpOnly cookie, of which the database keeps only a SHA-256 hash. */
const KEY_LENGTH = 32, COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) =>
  scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, COST, (error, key) => error ? reject(error) : resolve(key)));

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64')}$${(await derive(password, salt)).toString('base64')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [scheme, , , , salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64'), actual = await derive(password, Buffer.from(salt, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
/** A hash to compare against when a username does not exist, so a missing name takes as long as a wrong password. */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString('hex')));

export const SESSION_COOKIE = 'pb_session';
export const SESSION_DAYS = 30;
const DAY = 24 * 3600 * 1000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: Database, userId: number, now: number) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(hashToken(token), userId, now, now + SESSION_DAYS * DAY);
  return token;
}
interface UserRow { id: number; username: string; display_name: string; role: 'learner' | 'admin'; expires_at: number }
/** The signed-in user for a session token, or null. A session in use is extended, at most once a day. */
export function sessionUser(db: Database, token: string | undefined, now: number): { user: AccountUser; extended: boolean } | null {
  if (!token || token.length > 100) return null;
  const hash = hashToken(token);
  const row = db.prepare(`SELECT users.id, users.username, users.display_name, users.role, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.disabled = 0`).get(hash, now) as UserRow | undefined;
  if (!row) return null;
  const extended = row.expires_at - now < (SESSION_DAYS - 1) * DAY;
  if (extended) db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(now + SESSION_DAYS * DAY, hash);
  return { user: { id: row.id, username: row.username, displayName: row.display_name, role: row.role }, extended };
}
export function endSession(db: Database, token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}
export function endAllSessions(db: Database, userId: number) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); }
export function pruneSessions(db: Database, now: number) { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now); }

/** Wrong passwords slow down: ten misses for a name, or thirty from one address, wait fifteen minutes. */
export class Throttle {
  private misses = new Map<string, { count: number; first: number }>();
  private readonly window: number;
  constructor(window = 15 * 60 * 1000) { this.window = window; }
  private hits(key: string, now: number) { const entry = this.misses.get(key); return entry && now - entry.first < this.window ? entry.count : 0; }
  blocked(username: string, address: string, now: number) { return this.hits(`u:${username.toLowerCase()}`, now) >= 10 || this.hits(`a:${address}`, now) >= 30; }
  miss(username: string, address: string, now: number) {
    for (const key of [`u:${username.toLowerCase()}`, `a:${address}`]) {
      const entry = this.misses.get(key);
      if (!entry || now - entry.first >= this.window) this.misses.set(key, { count: 1, first: now }); else entry.count++;
    }
    if (this.misses.size > 10_000) this.misses.clear();
  }
  clear(username: string) { this.misses.delete(`u:${username.toLowerCase()}`); }
}
