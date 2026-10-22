import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { openDatabase } from './db.ts';
import { addUser } from './accounts.ts';
import { endAllSessions, hashPassword } from './auth.ts';
import { validPassword } from '../src/account/shared.ts';

/** Accounts from the command line, for the first admin or when the admin page is out of reach:
 *   node server/cli.ts add-user <username> [--name "Display name"] [--admin]
 *   node server/cli.ts set-password <username>
 *   node server/cli.ts list-users
 * The password is read from PASSWORD, or asked for twice without being shown. DATA_DIR chooses the database as for the server. */
const [command, username, ...rest] = process.argv.slice(2);
const db = openDatabase(path.resolve(process.cwd(), process.env.DATA_DIR ?? 'data', 'python-blocks.sqlite'));
const option = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
/** Read one line from the terminal without showing it. */
function hidden(prompt: string) {
  const { stdin, stdout } = process;
  stdout.write(prompt);
  stdin.setRawMode(true); stdin.setEncoding('utf8'); stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let typed = '';
    const finish = (done: () => void) => { stdin.off('data', read); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); done(); };
    const read = (chunk: string) => {
      if (chunk.startsWith('\u001b')) return; // arrow keys and the like
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') return finish(() => resolve(typed));
        if (char === '\u0003') return finish(() => reject(new Error('Cancelled.')));
        if (char === '\u007f' || char === '\b') typed = Array.from(typed).slice(0, -1).join('');
        else if (char >= ' ') typed += char;
      }
    };
    stdin.on('data', read);
  });
}
/** The password from PASSWORD, from a pipe, or typed twice at the terminal without being shown. */
async function password() {
  if (process.env.PASSWORD) return process.env.PASSWORD;
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    try { for await (const line of rl) return line; return ''; } finally { rl.close(); }
  }
  const first = await hidden('Password (not shown as you type): ');
  if (first !== await hidden('Type it again: ')) throw new Error('The two passwords are not the same. Nothing was changed.');
  return first;
}
try {
  if (command === 'add-user' && username) {
    await addUser(db, username, option('--name') ?? username, await password(), rest.includes('--admin') ? 'admin' : 'learner');
    console.log(`Added ${username}.`);
  } else if (command === 'set-password' && username) {
    const row = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number } | undefined;
    if (!row) throw new Error(`There is no ${username}.`);
    const next = await password(); if (!validPassword(next)) throw new Error('A password needs 4–128 characters.');
    db.prepare('UPDATE users SET password_hash = ?, disabled = 0 WHERE id = ?').run(await hashPassword(next), row.id); endAllSessions(db, row.id);
    console.log(`Set the password for ${username}.`);
  } else if (command === 'list-users') {
    for (const row of db.prepare('SELECT username, display_name, role, disabled FROM users ORDER BY username').all() as { username: string; display_name: string; role: string; disabled: number }[])
      console.log(`${row.username}\t${row.display_name}\t${row.role}${row.disabled ? '\t(turned off)' : ''}`);
  } else {
    console.log('Use: add-user <username> [--name "Display name"] [--admin] | set-password <username> | list-users');
    process.exitCode = 1;
  }
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
