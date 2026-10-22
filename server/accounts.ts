import type { Database } from './db.ts';
import { hashPassword } from './auth.ts';
import { validDisplayName, validPassword, validUsername } from '../src/account/shared.ts';

/** Make an account (the admin page and the command line both use this). */
export async function addUser(db: Database, username: string, displayName: string, password: string, role: 'learner' | 'admin', now = Date.now()) {
  if (!validUsername(username)) throw new Error('A username needs 3–32 letters, digits, dots, dashes or underscores.');
  if (!validDisplayName(displayName)) throw new Error('A name needs 1–40 characters.');
  if (!validPassword(password)) throw new Error('A password needs 4–128 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new Error(`${username} is taken.`);
  return Number(db.prepare('INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(username, displayName.trim(), await hashPassword(password), role, now).lastInsertRowid);
}
/** The first admin, from ADMIN_USERNAME and ADMIN_PASSWORD, when there is no admin yet. */
export async function ensureAdmin(db: Database, username: string | undefined, password: string | undefined, log: (line: string) => void) {
  const admins = (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n;
  if (admins) return;
  if (!username || !password) { log('No admin yet: set ADMIN_USERNAME and ADMIN_PASSWORD, or run node server/cli.ts add-user <name> --admin.'); return; }
  await addUser(db, username, 'Admin', password, 'admin');
  log(`Made the admin account ${username}.`);
}
