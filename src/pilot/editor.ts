import { exportRecord, newSession, PILOT_KEY, readSession, tasks, type PilotSession } from './model';

interface PilotOptions {
  capture(): string;
  load(source: string): void;
  starter(kind: 'score' | 'sprites'): string;
  download(name: string, text: string): void;
  changed(active: boolean): void;
  revision: string;
}

export function installPilot(options: PilotOptions) {
  const panel = document.createElement('details'); panel.id = 'pilot-panel'; panel.className = 'learning-panel';
  panel.innerHTML = `<summary>Learner pilot <span>Six small activities · facilitator notes stay in this browser</span></summary>
    <p>Try this with a facilitator for 25–35 minutes. Use a participant code, not a name. Stop whenever you choose. Notes are saved locally, separately from your project. AI assist is off during the pilot.</p>
    <form id="pilot-setup"><div class="learning-fields"><label>Participant code <input id="pilot-participant" value="P01" required maxlength="24" pattern="[A-Za-z0-9_-]+"></label><label>Prior experience <select id="pilot-experience"><option>New to coding</option><option>Some blocks</option><option>Regular blocks</option><option>Some Python</option></select></label><label>Device, access needs, or task changes <textarea id="pilot-setting" maxlength="4000" rows="2"></textarea></label></div>
    <p>Start saves a return copy of your current project, then loads a short score example. Arrange participation with the learner and supervising adult before starting.</p><button id="pilot-start" class="button secondary">Start pilot & load score example</button></form>
    <div id="pilot-session" hidden><nav id="pilot-tasks" aria-label="Pilot activities"></nav><h2 id="pilot-task-title"></h2><p id="pilot-prompt"></p>
    <button id="pilot-sprites" class="button secondary" hidden>Save checkpoint & load sprite starter</button>
    <div class="learning-actions"><button id="pilot-timer" class="button secondary">Start task timer</button><span id="pilot-time" role="status"></span></div>
    <details id="pilot-notes"><summary>Facilitator notes</summary><div class="learning-fields">
      <label>Prediction and explanation <textarea id="pilot-prediction" maxlength="4000" rows="2"></textarea></label>
      <label>Observed result, errors, recovery, and assistance <textarea id="pilot-observation" maxlength="4000" rows="3"></textarea></label>
      <label>Interpretation and follow-up <textarea id="pilot-interpretation" maxlength="4000" rows="2"></textarea></label>
      <label>Outcome <select id="pilot-outcome"><option value="unobserved">Not observed</option><option value="completed">Completed</option><option value="unfinished">Unfinished</option><option value="skipped">Skipped</option></select></label>
      <label>Hint level <select id="pilot-hint"><option value="none">None</option><option value="conceptual">Conceptual</option><option value="step-specific">Step-specific</option></select></label>
      <label>End discussion: surprises, expectations, next change <textarea id="pilot-discussion" maxlength="4000" rows="2"></textarea></label>
    </div></details>
    <div class="learning-actions"><button id="pilot-download" class="button secondary">Download observations</button><button id="pilot-finish" class="button secondary">Finish session</button></div>
    <details><summary>Saved project checkpoints & session data</summary><p>Download a checkpoint to reopen with Open project. Returning saves the current project as an end checkpoint before restoring your original.</p><label>Checkpoint <select id="pilot-backup"></select></label><button id="pilot-download-backup" class="button secondary">Download checkpoint</button><button id="pilot-return" class="button secondary">Return to original project</button></details></div>
    <p id="pilot-status" role="status"></p><button id="pilot-recovery" class="button secondary" hidden>Download saved pilot data</button>
    <button id="pilot-clear" class="button secondary" hidden>Clear pilot notes & checkpoints</button>`;
  document.querySelector('.workspace-grid')!.before(panel);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>(`#pilot-${id}`)!;
  let session: PilotSession | null = null, rawRecovery: string | null = null, timer: number | null = null, disposed = false;
  let storageFailure = false;
  let lastStored: string | null = null;
  const message = (text: string) => { el('status').textContent = text; };
  function persist(next = session) {
    if (localStorage.getItem(PILOT_KEY) !== lastStored) { storageFailure = true; throw new Error('Pilot data changed in another tab. Download your observations, then reload before continuing.'); }
    try { const raw = JSON.stringify(next); localStorage.setItem(PILOT_KEY, raw); lastStored = raw; storageFailure = false; }
    catch { storageFailure = true; throw new Error('Browser storage is full or unavailable. Download observations and checkpoints before leaving. Project replacement was cancelled.'); }
  }
  function action(fn: () => void) { try { fn(); } catch (error) { message(error instanceof Error ? error.message : 'The pilot action failed.'); } }
  function stopTimer() {
    if (timer === null || !session) return;
    session.record.notes[session.record.task].elapsedMs += Math.max(0, performance.now() - timer); timer = null;
    renderTime();
  }
  function renderTime() {
    if (!session) return;
    const ms = session.record.notes[session.record.task].elapsedMs + (timer === null ? 0 : Math.max(0, performance.now() - timer));
    el('time').textContent = `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s${timer === null ? ' · paused' : ''}`;
    el('timer').textContent = timer === null ? 'Start task timer' : 'Pause task timer';
  }
  function render() {
    el('setup').hidden = !!session || !!rawRecovery; el('session').hidden = !session;
    el('clear').hidden = !session && !rawRecovery; el('recovery').hidden = !rawRecovery;
    options.changed(!!session && !session.record.endedAt);
    if (!session) return;
    const { record, backups } = session, task = tasks[record.task], note = record.notes[record.task];
    el('tasks').replaceChildren(...tasks.map((task, index) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'button secondary'; b.textContent = `${index + 1}. ${task.title}`;
      b.setAttribute('aria-current', String(index === record.task));
      b.addEventListener('click', () => action(() => { stopTimer(); const next = structuredClone(session!); next.record.task = index; persist(next); session = next; render(); })); return b;
    }));
    el('task-title').textContent = task.title; el('prompt').textContent = task.prompt;
    el('sprites').hidden = task.id !== 'assets' || !!record.endedAt;
    el<HTMLButtonElement>('sprites').disabled = !!backups.beforeSprites;
    el<HTMLButtonElement>('return').disabled = !!backups.endProject;
    for (const key of ['prediction', 'observation', 'interpretation', 'outcome', 'hint'] as const) el<HTMLInputElement>(key).value = String(note[key]);
    el<HTMLTextAreaElement>('discussion').value = record.discussion;
    el<HTMLSelectElement>('backup').replaceChildren(...Object.keys(backups).map(key => new Option(({ original: 'Before the pilot', beforeSprites: 'Before sprite starter', endProject: 'Before returning to original' } as Record<string, string>)[key], key)));
    el<HTMLButtonElement>('finish').disabled = !!record.endedAt; el<HTMLButtonElement>('timer').disabled = !!record.endedAt;
    renderTime();
  }
  el('setup').addEventListener('submit', event => { event.preventDefault(); action(() => {
    const original = options.capture(), starter = options.starter('score');
    const next = newSession(el<HTMLInputElement>('participant').value, el<HTMLSelectElement>('experience').value, el<HTMLTextAreaElement>('setting').value, options.revision, navigator.userAgent, original);
    persist(next); session = next; render(); options.load(starter);
    message('Session started. Record predictions before Run. Your original project has a return copy.');
  }); });
  for (const key of ['prediction', 'observation', 'interpretation', 'outcome', 'hint'] as const) el(key).addEventListener('input', () => action(() => {
    if (!session) return;
    const note = session.record.notes[session.record.task];
    (note[key] as string) = el<HTMLInputElement>(key).value; persist(); message('Pilot notes saved in this browser.');
  }));
  el('discussion').addEventListener('input', () => action(() => { if (session) { session.record.discussion = el<HTMLTextAreaElement>('discussion').value; persist(); message('Pilot notes saved in this browser.'); } }));
  el('timer').addEventListener('click', () => action(() => {
    if (!session || session.record.endedAt) return;
    if (timer === null) timer = performance.now(); else { stopTimer(); persist(); } renderTime();
  }));
  el('sprites').addEventListener('click', () => action(() => {
    if (!session || session.record.endedAt || session.backups.beforeSprites) return;
    const next = structuredClone(session); next.backups.beforeSprites = options.capture();
    const starter = options.starter('sprites'); persist(next); session = next; render(); options.load(starter);
    message('Sprite starter loaded. Your earlier work is available in saved checkpoints.');
  }));
  el('download').addEventListener('click', () => action(() => {
    if (!session) return; stopTimer(); renderTime(); options.download(`pilot-${session.record.participant}-observations.json`, exportRecord(session));
    persist(); message('Observation record downloaded. It does not include project checkpoints.');
  }));
  el('finish').addEventListener('click', () => action(() => {
    if (!session) return; stopTimer(); const next = structuredClone(session); next.record.endedAt = new Date().toISOString(); persist(next); session = next; render();
    message('Session finished. Download your observations, then review them with the facilitator. Unobserved tasks remain unobserved.');
  }));
  el('return').addEventListener('click', () => action(() => {
    if (!session || session.backups.endProject) return;
    if (!window.confirm('Save this project as the end checkpoint and return to the project from before the pilot?')) return;
    stopTimer(); const next = structuredClone(session); next.backups.endProject = options.capture(); next.record.endedAt ??= new Date().toISOString();
    persist(next); session = next; render(); options.load(next.backups.original); message('Original project restored. Pilot work remains in the end checkpoint.');
  }));
  el('download-backup').addEventListener('click', () => { if (session) options.download(`pilot-${el<HTMLSelectElement>('backup').value}.python-blocks.json`, session.backups[el<HTMLSelectElement>('backup').value]); });
  el('recovery').addEventListener('click', () => { if (rawRecovery) options.download('pilot-recovery.json', rawRecovery); });
  el('clear').addEventListener('click', () => action(() => {
    if (!window.confirm('Delete the pilot notes and all pilot checkpoints from this browser? Download anything you want to keep first. Your current project stays open.')) return;
    if (localStorage.getItem(PILOT_KEY) !== lastStored) throw new Error('Pilot data changed in another tab. Reload before clearing it.');
    localStorage.removeItem(PILOT_KEY); lastStored = null; timer = null; session = null; rawRecovery = null; storageFailure = false; render(); message('Pilot data cleared.');
  }));
  function pause() { if (timer !== null) action(() => { stopTimer(); persist(); renderTime(); }); }
  const visibility = () => { if (document.hidden) pause(); };
  const leaving = (event: BeforeUnloadEvent) => { if (storageFailure) event.preventDefault(); };
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pause); window.addEventListener('beforeunload', leaving);
  const ticker = window.setInterval(() => { if (!disposed && timer !== null) { renderTime(); } }, 1000);
  action(() => {
    rawRecovery = localStorage.getItem(PILOT_KEY); lastStored = rawRecovery;
    if (rawRecovery) { session = readSession(rawRecovery); rawRecovery = null; message('Saved pilot session restored. The task timer is paused.'); }
  }); render();
  return { get active() { return !!session && !session.record.endedAt; }, dispose() {
    pause(); disposed = true; clearInterval(ticker); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pause); window.removeEventListener('beforeunload', leaving); panel.remove();
  } };
}
