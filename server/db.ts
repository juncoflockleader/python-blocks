import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/** One SQLite file holds everything: accounts, sessions, saved programs, each learner's synced
 * browser state, and the coin ledger. Each entry in MIGRATIONS upgrades the file by one version. */
const MIGRATIONS = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     display_name TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'admin')),
     disabled INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     last_login_at INTEGER
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE projects (
     id TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     data TEXT NOT NULL,
     size INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX projects_user ON projects(user_id, updated_at);
   CREATE TABLE user_data (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     key TEXT NOT NULL,
     value TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, key)
   );
   -- The coin ledger: a balance is the sum of a learner's entries. An award (a lesson finished) is
   -- earned once; later, a purchase is a negative entry and its refund a positive one.
   CREATE TABLE coins (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     amount INTEGER NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('award', 'admin')),
     award TEXT,
     note TEXT,
     created_at INTEGER NOT NULL,
     UNIQUE (user_id, award)
   );
   CREATE INDEX coins_user ON coins(user_id, created_at);`,
];

export function openDatabase(file: string) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try { db.exec(MIGRATIONS[v]); db.exec(`PRAGMA user_version = ${v + 1}`); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return db;
}
export type Database = DatabaseSync;

/** Run `work` in one transaction. */
export function transaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
