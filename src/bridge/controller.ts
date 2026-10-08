import { Blockly } from '../blocks';
import { compile } from '../language/compiler';
import { canonical, utf8Size } from '../language/modules';
import { MAX_FILE_SIZE, snapshot, type Project } from '../project';
import { convertPython, type ConvertedPython, type ParsePython, type RejectedConversion } from './converter';
import { bridgeState, changeBridgeState, MAX_RECOVERIES, validateBridgeState, type BridgeState, type PythonDraft, type RecoveredDraft } from './draft-state';
import { applyProjectTransaction } from './transaction';
import type { ConversionDiagnostic } from './ast';

export function authoredProject(project: Project) {
  const workspace = { ...project.workspace }; delete workspace.pythonBridge;
  return { languageVersion: project.languageVersion, workspace };
}
export async function projectRevision(project: Project): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(authoredProject(project)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export type ApplyResult = ConvertedPython | RejectedConversion;
export interface BridgeStatus { busy: boolean; diagnostics: ConversionDiagnostic[] }
const rejected = (source: string, code: string, message: string): RejectedConversion => ({ ok: false, source, diagnostics: [{ code, message }] });
const conflict = (source: string) => rejected(source, 'conflict', 'Blocks or project assets changed since this Python draft began. Your draft is saved. Start from the current blocks or recover an earlier project before applying it.');
const cancelled = (source: string) => rejected(source, 'cancelled', 'This conversion was cancelled. Your draft and blocks are preserved.');

export class PythonBridge {
  private operation = 0;
  private abort?: AbortController;
  private disposed = false;
  private statusValue: BridgeStatus = { busy: false, diagnostics: [] };
  private listeners = new Set<() => void>();
  private readonly workspaceChanged = (event: Blockly.Events.Abstract) => { if (!event.isUiEvent) this.notify(); };
  constructor(readonly workspace: Blockly.Workspace, private readonly parse: ParsePython) { workspace.addChangeListener(this.workspaceChanged); }
  get state() { return bridgeState(this.workspace); }
  get status(): BridgeStatus { return structuredClone(this.statusValue); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notify() { if (!this.disposed) for (const listener of this.listeners) listener(); }
  private check() { if (this.disposed) throw new Error('This Python editor has been closed.'); }
  cancel(notify = true) {
    this.operation++; this.abort?.abort(); this.abort = undefined;
    this.statusValue = { busy: false, diagnostics: [] }; if (notify) this.notify();
  }
  dispose() { if (this.disposed) return; this.cancel(false); this.disposed = true; this.workspace.removeChangeListener(this.workspaceChanged); this.listeners.clear(); }
  private write(state: BridgeState) {
    validateBridgeState(state);
    const project = snapshot(this.workspace); project.workspace.pythonBridge = state;
    if (utf8Size(JSON.stringify(project)) > MAX_FILE_SIZE) throw new Error('This draft and its recovery copies exceed the 16 MB project limit. Save a copy, then remove an older recovery entry or reduce asset sizes.');
    changeBridgeState(this.workspace, state); this.notify();
  }
  private archive(state: BridgeState, draft: PythonDraft, reason: RecoveredDraft['reason']) {
    if (state.recovery.some(entry => entry.source === draft.source && entry.baseSource === draft.baseSource && entry.baseRevision === draft.baseRevision)) return;
    if (state.recovery.length >= MAX_RECOVERIES) throw new Error('Python recovery is full (20 entries). Save a project copy or download a recovery source, then remove an older entry.');
    state.recovery.push({ ...structuredClone(draft), id: crypto.randomUUID(), reason });
  }
  /** Reopen a saved draft; creating a new draft requires valid generated code. */
  async begin() { this.check(); if (!this.state.draft) await this.useBlocks(); }
  async useBlocks() {
    this.check(); this.cancel(false); const operation = this.operation;
    const project = snapshot(this.workspace), source = compile(this.workspace).source, state = this.state;
    if (source === null) throw new Error('Resolve the block errors before starting a new Python draft. The existing draft is preserved.');
    const revision = await projectRevision(project);
    if (operation !== this.operation || this.disposed) return;
    if (canonical(authoredProject(snapshot(this.workspace))) !== canonical(authoredProject(project)) || canonical(this.state) !== canonical(state)) throw new Error('The project changed while the draft was being prepared. Try starting from the current blocks again.');
    if (state.draft) this.archive(state, state.draft, 'replaced');
    state.draft = { source, baseSource: source, baseRevision: revision, origin: 'blocks' };
    this.write(state);
  }
  edit(source: string) {
    this.check(); const state = this.state;
    if (!state.draft) throw new Error('Start a Python draft before editing.');
    this.cancel(false); state.draft.source = source; this.write(state);
  }
  discard() {
    this.check(); const state = this.state; if (!state.draft) return;
    this.cancel(false); this.archive(state, state.draft, 'discarded'); delete state.draft; this.write(state);
  }
  recover(id: string) {
    this.check(); const state = this.state, entry = state.recovery.find(entry => entry.id === id);
    if (!entry) throw new Error('That Python recovery entry is no longer available.');
    this.cancel(false); state.recovery = state.recovery.filter(item => item.id !== id);
    if (state.draft) this.archive(state, state.draft, 'replaced');
    const { id: _id, reason: _reason, ...draft } = entry; state.draft = draft; this.write(state);
  }
  removeRecovery(id: string) { this.check(); this.cancel(false); const state = this.state; state.recovery = state.recovery.filter(entry => entry.id !== id); this.write(state); }
  async apply(): Promise<ApplyResult> {
    this.check(); this.cancel(false); const operation = this.operation, abort = new AbortController(); this.abort = abort;
    const state = this.state, project = snapshot(this.workspace), source = state.draft?.source ?? '';
    this.statusValue = { busy: true, diagnostics: [] }; this.notify();
    let result: ApplyResult;
    try {
      if (!state.draft) result = rejected(source, 'no-draft', 'Start a Python draft before applying it.');
      else if (await projectRevision(project) !== state.draft.baseRevision) result = conflict(source);
      else if (operation !== this.operation || this.disposed) result = cancelled(source);
      else {
        result = await convertPython(source, project, this.parse, abort.signal);
        if (operation !== this.operation || this.disposed) result = cancelled(source);
        else if (canonical(this.state) !== canonical(state) || canonical(authoredProject(snapshot(this.workspace))) !== canonical(authoredProject(project))) result = conflict(source);
        else if (result.ok) {
          const next = structuredClone(state), revision = await projectRevision(result.project);
          // Hashing also yields to input and workspace changes.
          if (operation !== this.operation || this.disposed) result = cancelled(source);
          else if (canonical(this.state) !== canonical(state) || canonical(authoredProject(snapshot(this.workspace))) !== canonical(authoredProject(project))) result = conflict(source);
          else {
            if (source !== state.draft.baseSource) this.archive(next, { ...state.draft, source: state.draft.baseSource }, 'before-apply');
            next.draft = { source, baseSource: source, baseRevision: revision, origin: 'python' };
            result.project.workspace.pythonBridge = next;
            applyProjectTransaction(this.workspace, result.project);
            result.project = snapshot(this.workspace);
          }
        }
      }
    } catch (error) {
      result = operation !== this.operation || error instanceof Error && error.name === 'AbortError' ? cancelled(source)
        : rejected(source, 'apply', error instanceof Error ? error.message : String(error));
    }
    if (operation === this.operation && !this.disposed) {
      this.abort = undefined; this.statusValue = { busy: false, diagnostics: result.ok ? [] : result.diagnostics }; this.notify();
    }
    return result;
  }
}
