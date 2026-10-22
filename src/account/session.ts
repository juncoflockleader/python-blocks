import { applyState, type StartState } from './sync';
import type { AccountUser } from './shared';

/** Who is using the app. The Python Blocks server serves the editor only to signed-in learners, and
 * puts their account and saved work in the page (a JSON script, #pb-account), so the editor starts
 * with their work at once. Without the server (development, the browser tests) there is no such
 * script: the app runs on its own ("local"), with work kept in this browser only. */
export type Account = { mode: 'local' } | { mode: 'signed-in'; user: AccountUser; coins: number; start: StartState };
let current: Account = { mode: 'local' };
export const account = () => current;

/** Read the account the server put in the page, and bring the learner's work into the browser. */
export function startAccount(): Account {
  const node = document.getElementById('pb-account');
  if (!node) return current;
  node.remove();
  const boot = JSON.parse(node.textContent ?? 'null') as { user: AccountUser; coins: number; values: Record<string, string> } | null;
  if (!boot?.user) return current;
  return (current = { mode: 'signed-in', user: boot.user, coins: boot.coins, start: applyState(boot.user, boot.values) });
}
