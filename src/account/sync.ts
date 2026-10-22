import { ApiError, api } from './api';
import { SYNCED_KEYS, type AccountUser } from './shared';

/** A learner's work follows them: the browser keys in SYNCED_KEYS (the project in the editor, lesson
 * positions, Academy progress, the level…) are copied to their account as they change and put in
 * the browser when the page opens (the server sends them in the page), and the project they are editing is saved as a program in My projects.
 * The app itself keeps using the browser's storage; this layer watches it, so nothing else changes.
 * The browser remembers whose work it holds and which changes have not reached the server yet. */
const META_KEY = 'python-blocks.account.v1';
const PROJECT_KEY = 'python-blocks.project.v1', TITLE_KEY = 'python-blocks.title.v1', CLOUD_KEY = 'python-blocks.cloud.v1';
type Values = Record<string, string | null>;
interface Meta { owner: string; pending: string[] }

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage full or off */ } };
const local = (): Values => Object.fromEntries(SYNCED_KEYS.map(key => [key, read(key)]));
const readMeta = (): Meta | null => { try { const meta = JSON.parse(read(META_KEY) ?? 'null') as Meta | null; return meta && typeof meta.owner === 'string' && Array.isArray(meta.pending) ? meta : null; } catch { return null; } };
const writeMeta = (meta: Meta | null) => write(META_KEY, meta && JSON.stringify(meta));

/** What the editor starts from: the account's values as last sent, and a program from before accounts to keep. */
export interface StartState { baseline: Values; stray: { project: string; title: string | null } | null }
/** Bring a learner's work into the browser as the page opens, before the editor reads it (synchronous:
 * the server puts the work in the page). Anything this browser has not sent yet stays and is sent first. */
export function applyState(user: AccountUser, values: Record<string, string>): StartState {
  const meta = readMeta(), here = local(), server: Values = Object.fromEntries(SYNCED_KEYS.map(key => [key, values[key] ?? null]));
  let stray: StartState['stray'] = null, pending: string[] = [];
  if (meta?.owner === user.username) {
    // The same learner: changes the server has not seen stay here (and differ from the baseline, so they go up first).
    pending = meta.pending.filter(key => (SYNCED_KEYS as readonly string[]).includes(key));
    for (const key of SYNCED_KEYS) if (!pending.includes(key)) write(key, server[key]);
  } else if (!meta && !Object.keys(values).length && Object.values(here).some(value => value !== null)) {
    // A browser used before accounts, and a learner with nothing saved yet: the work here becomes theirs.
    pending = SYNCED_KEYS.filter(key => here[key] !== null);
  } else {
    // Someone else's work, or work from before accounts when this learner has their own: a program from
    // before accounts is kept in My projects, then the learner's own work replaces what is here.
    if (!meta && here[PROJECT_KEY] && worthSaving(here[PROJECT_KEY]!)) stray = { project: here[PROJECT_KEY]!, title: here[TITLE_KEY] };
    for (const key of SYNCED_KEYS) write(key, server[key]);
  }
  writeMeta({ owner: user.username, pending });
  return { baseline: server, stray };
}
async function keepStray(stray: NonNullable<StartState['stray']>) {
  try { await api('POST', '/api/projects', { title: `${(stray.title || 'My project').slice(0, 60)} (from this browser)`, data: JSON.parse(stray.project) }); }
  catch { /* the stray program is not essential */ }
}
/** A program with no blocks and no sprites is not worth a place in My projects. */
function worthSaving(project: string) {
  try {
    const p = JSON.parse(project) as { workspace?: { blocks?: { blocks?: unknown[] }; pythonScene?: { sprites?: unknown[] } } };
    return !!(p.workspace?.blocks?.blocks?.length || p.workspace?.pythonScene?.sprites?.length);
  } catch { return false; }
}

export interface SyncHost {
  /** A lesson or Academy unit is open: its work is lesson state (synced), not a program of its own. */
  lessonActive(): boolean;
  status(text: string): void;
  /** Signing out: the editor stops saving, so nothing is written back as the page closes. */
  stopSaving(): void;
}
export interface Sync {
  /** The program the editor holds now, if it is saved in My projects. */
  identity(): string | null;
  /** The editor holds another project now: `id` when it is a saved program, null for a new one. */
  replaced(id: string | null): void;
  /** Send what has changed now (before opening another program, or signing out). */
  flush(): Promise<void>;
  /** Save project: save the project in the editor to My projects now; rejects when it cannot. */
  save(): Promise<void>;
  /** Sign out: send what is left, then clear this learner's work from the browser. */
  signOut(): Promise<void>;
}
export function startSync(host: SyncHost, start: StartState): Sync {
  let baseline = { ...start.baseline }, busy: Promise<void> | null = null, stopped = false;
  if (start.stray) void keepStray(start.stray);
  const program = { saved: read(PROJECT_KEY), title: read(TITLE_KEY), replacedAt: 0 };
  const identity = () => { try { return (JSON.parse(read(CLOUD_KEY) ?? 'null') as { id?: string } | null)?.id ?? null; } catch { return null; } };
  const setIdentity = (id: string | null) => write(CLOUD_KEY, id && JSON.stringify({ id }));
  const markPending = (keys: string[], add: boolean) => {
    const meta = readMeta(); if (!meta) return;
    meta.pending = add ? [...new Set([...meta.pending, ...keys])] : meta.pending.filter(key => !keys.includes(key) || local()[key] !== baseline[key]);
    writeMeta(meta);
  };
  async function pushKeys(leaving: boolean) {
    const now = local(), changed = SYNCED_KEYS.filter(key => now[key] !== baseline[key]);
    if (!changed.length) return;
    markPending(changed, true);
    const values = Object.fromEntries(changed.map(key => [key, now[key]]));
    const size = JSON.stringify(values).length;
    await api('PUT', '/api/data', { values }, { keepalive: leaving && size < 60_000 });
    for (const key of changed) baseline[key] = now[key];
    markPending(changed, false);
    if (changed.includes(PROJECT_KEY)) host.status('Saved to your account');
  }
  /** Save the project in the editor as its program; `now` is Save project, which saves even an
   * unchanged or empty project, and one opened a moment ago. */
  async function saveProgram(leaving: boolean, now = false): Promise<void> {
    if (host.lessonActive()) return;
    const data = read(PROJECT_KEY), title = read(TITLE_KEY) || 'My project';
    if (!data || (!now && data === program.saved && title === program.title)) return;
    // A project just opened settles for a moment (titles, scene checks) before edits count.
    if (!now && Date.now() - program.replacedAt < 2000) { program.saved = data; program.title = title; return; }
    const id = identity(), keepalive = leaving && data.length < 60_000;
    try {
      if (id) await api('PUT', `/api/projects/${id}`, data === program.saved ? { title } : { title, data: JSON.parse(data) }, { keepalive });
      else {
        if (!now && !worthSaving(data)) return;
        setIdentity((await api<{ id: string }>('POST', '/api/projects', { title, data: JSON.parse(data) })).id);
      }
    } catch (error) {
      // Deleted on another device: save it as a new program (next time, or now for Save project).
      if (error instanceof ApiError && error.status === 404) { setIdentity(null); return now ? saveProgram(leaving, now) : undefined; }
      throw error;
    }
    program.saved = data; program.title = title;
    host.status('Saved to My projects');
  }
  async function tick(leaving = false) {
    if (stopped) return;
    if (busy) return busy;
    busy = (async () => {
      try { await pushKeys(leaving); await saveProgram(leaving); }
      catch (error) { if (!(error instanceof ApiError) || error.status !== 401) host.status('Not saved to your account yet. Trying again…'); }
      finally { busy = null; }
    })();
    return busy;
  }
  const timer = setInterval(() => void tick(), 1500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void tick(true); });
  window.addEventListener('pagehide', () => void tick(true));
  return {
    identity,
    replaced(id) { setIdentity(id); program.saved = read(PROJECT_KEY); program.title = read(TITLE_KEY); program.replacedAt = Date.now(); },
    async flush() { await busy; await tick(); },
    async save() {
      while (busy) await busy;
      let failure: unknown = null;
      busy = (async () => { try { await pushKeys(false); await saveProgram(false, true); } catch (error) { failure = error; } finally { busy = null; } })();
      await busy;
      if (failure) throw failure;
    },
    async signOut() {
      await busy; await tick();
      stopped = true; clearInterval(timer); host.stopSaving();
      try { await api('POST', '/api/logout'); } catch { /* signing out anyway */ }
      for (const key of SYNCED_KEYS) write(key, null);
      writeMeta(null);
      location.assign('/login');
    },
  };
}
