/** What the app and its server agree on: the browser keys that follow a learner to every device
 * (stored per account), and the limits on names, passwords and saved work. */

/** The project in the editor, its title, the lesson position and the project kept beside a lesson,
 * the level, the Blocks or Stage view, Academy progress, and which saved program the editor holds. */
export const SYNCED_KEYS = [
  'python-blocks.project.v1', 'python-blocks.title.v1', 'python-blocks.guide.v1', 'python-blocks.guide.kept.v1',
  'python-blocks-level', 'python-blocks.view.v1', 'python-blocks.academy.v1', 'python-blocks.cloud.v1',
] as const;
export type SyncedKey = typeof SYNCED_KEYS[number];
export const isSyncedKey = (key: string): key is SyncedKey => (SYNCED_KEYS as readonly string[]).includes(key);

export const LIMITS = {
  /** One saved program, as JSON: a scene may hold 12 MB of pictures and sounds. */
  project: 16 * 1024 * 1024,
  /** All of a learner's synced keys together. */
  data: 40 * 1024 * 1024,
  projects: 200,
  title: 80,
  displayName: 40,
  password: { min: 4, max: 128 },
} as const;
/** Usernames: 3–32 letters, digits, dots, dashes or underscores (the admin gives them out). */
export const validUsername = (name: unknown): name is string => typeof name === 'string' && /^[A-Za-z0-9._-]{3,32}$/.test(name);
export const validPassword = (password: unknown): password is string => typeof password === 'string' && password.length >= LIMITS.password.min && password.length <= LIMITS.password.max;
export const validDisplayName = (name: unknown): name is string => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= LIMITS.displayName;

export interface AccountUser { id: number; username: string; displayName: string; role: 'learner' | 'admin' }
export interface CoinEntry { amount: number; kind: 'award' | 'admin'; award: string | null; title: string; note: string | null; createdAt: number }
export interface ProjectSummary { id: string; title: string; size: number; createdAt: number; updatedAt: number }
