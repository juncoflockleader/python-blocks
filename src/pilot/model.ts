export const PILOT_KEY = 'python-blocks.learner-pilot.v1';
export const tasks = [
  { id: 'predict', title: 'Predict', prompt: 'Look at the score program in blocks and Python. Before running it, predict what it will print and explain why.' },
  { id: 'edit', title: 'Edit and compare', prompt: 'Change the starting score or repeat count in Python. Predict the result, Apply to blocks, inspect the blocks, then Run. Explain what changed.' },
  { id: 'repair', title: 'Repair a draft', prompt: 'Save a project copy. Remove a closing parenthesis in your Python draft, then try Run. Follow the error, reload this page, and repair your retained draft.' },
  { id: 'assets', title: 'Keep assets', prompt: 'Load the sprite starter below. Change its greeting and keyboard movement amount in Python. Apply and try it. Compare the sprites and their starting positions with the original.' },
  { id: 'conflict', title: 'Handle a conflict', prompt: 'Save a project copy. Begin a Python draft, then change a sprite property in the scene editor. Try Apply. Start from current blocks, then find and recover your earlier Python text. Explain the choices.' },
  { id: 'deliver', title: 'Deliver', prompt: 'Export a playable project. Open its editable project.json back in this editor. Explain the difference between the project, generated Python, and playable. Your facilitator may launch the local server.' },
] as const;
export type Outcome = 'unobserved' | 'completed' | 'unfinished' | 'skipped';
export type Hint = 'none' | 'conceptual' | 'step-specific';
export interface TaskNote {
  prediction: string; observation: string; interpretation: string; outcome: Outcome; hint: Hint; elapsedMs: number;
}
export interface PilotRecord {
  version: 1; protocol: 'bridge-pilot-1'; participant: string; experience: string; setting: string;
  revision: string; browser: string; startedAt: string; endedAt: string | null;
  task: number; notes: TaskNote[]; discussion: string;
}
// Project backups are deliberately separate from the exportable research record.
export interface PilotSession { record: PilotRecord; backups: Record<string, string> }
export function newSession(participant: string, experience: string, setting: string, revision: string, browser: string, original: string): PilotSession {
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(participant)) throw new Error('Use a participant code of 1–24 letters, numbers, dashes or underscores.');
  return { record: { version: 1, protocol: 'bridge-pilot-1', participant, experience, setting, revision, browser,
    startedAt: new Date().toISOString(), endedAt: null, task: 0, discussion: '',
    notes: tasks.map(() => ({ prediction: '', observation: '', interpretation: '', outcome: 'unobserved', hint: 'none', elapsedMs: 0 })),
  }, backups: { original } };
}
export function readSession(raw: string): PilotSession {
  if (raw.length > 50_000_000) throw new Error('Pilot record is too large.');
  const value = JSON.parse(raw) as PilotSession;
  const r = value?.record;
  const bounded = (v: unknown, max = 4000) => typeof v === 'string' && v.length <= max;
  if (!r || r.version !== 1 || r.protocol !== 'bridge-pilot-1' || !bounded(r.participant, 24) ||
      !/^[A-Za-z0-9_-]{1,24}$/.test(r.participant) || !bounded(r.experience) || !bounded(r.setting) ||
      !bounded(r.revision) || !bounded(r.browser) || !bounded(r.startedAt, 40) ||
      !(r.endedAt === null || bounded(r.endedAt, 40)) || !Number.isInteger(r.task) || r.task < 0 || r.task >= tasks.length ||
      !bounded(r.discussion) || !Array.isArray(r.notes) || r.notes.length !== tasks.length ||
      !r.notes.every(n => n && bounded(n.prediction) && bounded(n.observation) && bounded(n.interpretation) &&
        ['unobserved', 'completed', 'unfinished', 'skipped'].includes(n.outcome) && ['none', 'conceptual', 'step-specific'].includes(n.hint) &&
        Number.isFinite(n.elapsedMs) && n.elapsedMs >= 0) ||
      !value.backups || typeof value.backups !== 'object' || Array.isArray(value.backups) || !bounded(value.backups.original, 16_000_000) ||
      Object.entries(value.backups).some(([key, source]) => !['original', 'beforeSprites', 'endProject'].includes(key) || !bounded(source, 16_000_000))) {
    throw new Error('The saved pilot record is invalid. Download it before clearing it.');
  }
  return value;
}
export function exportRecord(session: PilotSession) {
  // Whitelist fields: neither project backups nor future provider settings belong here.
  const r = session.record;
  return JSON.stringify({ format: 'python-blocks-learner-observations', version: r.version, protocol: r.protocol,
    participant: r.participant, experience: r.experience, setting: r.setting, revision: r.revision, browser: r.browser,
    startedAt: r.startedAt, endedAt: r.endedAt, discussion: r.discussion,
    evidence: 'Facilitator-entered observations; not an automated assessment or a learning-outcome claim.',
    tasks: tasks.map((task, index) => ({ ...task, ...r.notes[index] })), notes: undefined,
  }, null, 2);
}
