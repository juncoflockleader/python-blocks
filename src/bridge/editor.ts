import type { Blockly } from '../blocks';
import type { Compilation } from '../language/compiler';
import { canonical } from '../language/modules';
import { snapshot } from '../project';
import { PythonBridge, authoredProject, projectRevision } from './controller';
import { draftChanged } from './draft-state';
import { PythonParser } from './parser';

interface EditorOptions {
  compilation(): Compilation;
  changed(): void;
  applied(): void;
  download(name: string, text: string): void;
}
export function installPythonEditor(workspace: Blockly.Workspace, options: EditorOptions) {
  const panel = document.querySelector<HTMLElement>('.python-panel')!;
  panel.innerHTML = `<div class="panel-heading"><h2 id="python-title"><span class="step">03</span> Meet your Python</h2><span class="language-label">.py</span></div>
    <div class="python-toolbar" aria-label="Python views"><button id="python-edit" class="button secondary" aria-pressed="false">Edit Python</button><button id="python-inspect" class="button secondary" aria-pressed="true">Generated files</button><button id="python-blocks" class="button secondary">Go to blocks</button></div>
    <p id="python-state" class="python-message" role="status"></p>
    <div id="python-draft-view" hidden>
      <label class="python-label" for="python-editor">program.py — your Python draft</label>
      <p id="python-editor-help" class="python-message">Use spaces to indent. Tab moves to the next control. Ctrl/⌘+Enter applies your draft to blocks. Run and exports validate the active draft.</p>
      <textarea id="python-editor" class="python-source" rows="16" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-describedby="python-editor-help python-state"></textarea>
      <div class="python-toolbar"><button id="python-apply" class="button primary">Apply to blocks</button><button id="python-cancel" class="button secondary" hidden>Cancel conversion</button><button id="python-download" class="button secondary">Download draft</button></div>
      <div class="python-toolbar"><button id="python-use-blocks" class="button secondary">Start from current blocks</button><button id="python-discard" class="button secondary">Discard draft</button></div>
      <p class="python-message">Starting again or discarding keeps a recovery copy. Applying preserves your exact source and adds one block Undo step.</p>
    </div>
    <div id="python-generated-view"><label class="python-label" for="python-file">Inspect generated file</label><select id="python-file" class="python-file"></select><pre tabindex="0" aria-label="Generated Python code"><code id="python"></code></pre><p class="code-note">Generated files are read-only. Imported module definitions stay pinned; edit only program.py through the draft.</p></div>
    <ul id="python-diagnostics" class="python-diagnostics" aria-label="Python draft errors" role="alert" hidden></ul>
    <details id="python-recovery" class="python-recovery" hidden><summary>Recover earlier Python</summary><label class="python-label" for="python-recovery-entry">Saved source</label><select id="python-recovery-entry" class="python-file"></select><div class="python-toolbar"><button id="python-recover" class="button secondary">Open recovery draft</button><button id="python-recovery-download" class="button secondary">Download source</button><button id="python-recovery-remove" class="button secondary">Remove recovery entry</button></div><p class="python-message">Recovery restores text. If its blocks or assets have changed, Apply will explain the conflict. Save a project copy to preserve all recovery entries.</p></details>`;
  const element = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const textarea = element<HTMLTextAreaElement>('#python-editor'), files = element<HTMLSelectElement>('#python-file'), recovery = element<HTMLSelectElement>('#python-recovery-entry');
  const parser = new PythonParser(), bridge = new PythonBridge(workspace, (source, signal) => parser.parse(source, signal));
  let view: 'draft' | 'generated' = 'generated', hadDraft = false, error = '', unstored: string | undefined;
  let authored = '', revision = '', hashEpoch = 0, disposed = false;
  function message(value: unknown) { error = value instanceof Error ? value.message : String(value); refresh(); }
  function generated() {
    const compilation = options.compilation(), selected = files.value;
    const names = ['program.py', ...Object.keys(compilation.files)];
    if (names.join('\n') !== [...files.options].map(option => option.value).join('\n')) {
      files.replaceChildren(...names.map(name => new Option(name === 'program.py' ? name : `${name} — ${compilation.moduleSources[name].name}`, name)));
      if (names.includes(selected)) files.value = selected;
    }
    element('#python').textContent = files.value === 'program.py' ? compilation.source ?? '# Resolve the block errors to generate Python.\n' : compilation.files[files.value] ?? '';
  }
  function refresh() {
    if (disposed) return;
    const state = bridge.state, status = bridge.status, draft = state.draft;
    if (draft && !hadDraft) view = 'draft'; if (!draft) view = 'generated'; hadDraft = !!draft;
    element('#python-draft-view').hidden = view !== 'draft'; element('#python-generated-view').hidden = view !== 'generated';
    element('#python-edit').textContent = draft ? 'Python draft' : 'Edit Python'; element('#python-edit').setAttribute('aria-pressed', String(view === 'draft'));
    element('#python-inspect').setAttribute('aria-pressed', String(view === 'generated'));
    // Native textareas normalize newlines. Keep the exact saved source until
    // the learner actually edits, and translate diagnostic offsets for display.
    const text = (unstored ?? draft?.source ?? '').replace(/\r\n?/g, '\n'); if (textarea.value !== text) textarea.value = text;
    if (draft) {
      const project = snapshot(workspace), current = canonical(authoredProject(project));
      if (current !== authored) {
        authored = current; revision = ''; const epoch = ++hashEpoch;
        void projectRevision(project).then(value => { if (epoch === hashEpoch && !disposed) { revision = value; refresh(); } }).catch(message);
      }
    } else if (authored) { authored = ''; revision = ''; hashEpoch++; }
    const conflict = !!draft && !!revision && draft.baseRevision !== revision;
    element('#python-state').textContent = error || (status.busy ? 'Checking Python and building blocks…' : conflict ? 'Blocks or assets changed. Your Python draft is preserved; start from current blocks to make a new draft.' : draft ? draftChanged(draft) ? 'Python draft has unapplied changes. Run and exports will validate it first.' : draft.origin === 'python' ? 'Python applied. Your exact source is saved with the project.' : 'Python draft matches the current blocks.' : 'Build with blocks or start a Python draft.');
    element('#python-state').classList.toggle('python-warning', !!error || conflict);
    element<HTMLButtonElement>('#python-apply').disabled = !draft || status.busy;
    element('#python-cancel').hidden = !status.busy;
    const list = element('#python-diagnostics'); list.replaceChildren();
    for (const diagnostic of status.diagnostics) {
      const item = document.createElement('li');
      if (diagnostic.span) {
        const span = diagnostic.span, button = document.createElement('button'); button.className = 'python-error-link';
        button.textContent = `Line ${span.start.line}, column ${span.start.column + 1}: ${diagnostic.message}`;
        button.addEventListener('click', () => {
          view = 'draft'; refresh(); textarea.focus(); const source = bridge.state.draft?.source ?? '';
          const offset = (position: number) => source.slice(0, position).replace(/\r\n?/g, '\n').length;
          textarea.setSelectionRange(offset(span.start.offset), Math.max(offset(span.start.offset) + 1, offset(span.end.offset)));
        }); item.append(button);
      } else item.textContent = diagnostic.message;
      list.append(item);
    }
    list.hidden = !status.diagnostics.length;
    const selected = recovery.value;
    recovery.replaceChildren(...state.recovery.map((entry, index) => new Option(`${index + 1}. ${entry.reason === 'before-apply' ? 'Before Apply' : entry.reason === 'discarded' ? 'Discarded draft' : 'Replaced draft'} — ${entry.source.split(/\r?\n/).find(line => line.trim())?.slice(0, 55) ?? '(empty source)'}`, entry.id)));
    if (state.recovery.some(entry => entry.id === selected)) recovery.value = selected;
    element('#python-recovery').hidden = !state.recovery.length;
    generated();
  }
  function flush() {
    if (unstored !== undefined) { const value = unstored; unstored = undefined; try { bridge.edit(value); error = ''; } catch (failure) { unstored = value; message(failure); return false; } }
    return true;
  }
  async function apply() {
    if (!flush()) return false;
    error = ''; const result = await bridge.apply(); refresh();
    if (!result.ok) { if (result.diagnostics[0]?.code !== 'cancelled') { view = 'draft'; refresh(); element('#python-diagnostics').scrollIntoView({ block: 'nearest' }); } return false; }
    options.applied(); return true;
  }
  function edit() {
    const value = textarea.value; unstored = undefined; error = '';
    try { bridge.edit(value); } catch (failure) { unstored = value; message(failure); }
    options.changed();
  }
  function replayCheckpoint() {
    const draft = bridge.state.draft;
    return draft ? canonical({ draft, project: authoredProject(snapshot(workspace)) }) : null;
  }
  function allowReplay(checkpoint: string | null) {
    if (!bridge.state.draft) return true;
    if (!flush()) return false;
    // The checkpoint was captured after Run validated this exact draft and
    // authored project. Replay must neither apply new text nor run stale blocks.
    if (bridge.status.busy || checkpoint === null || checkpoint !== replayCheckpoint()) {
      message('Your Python draft or project has changed. Use Run Python to validate and play it, or discard the draft to replay the captured game.');
      view = 'draft'; refresh(); textarea.focus(); textarea.scrollIntoView({ block: 'center' });
      return false;
    }
    return true;
  }
  textarea.addEventListener('input', edit);
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void apply().catch(message); }
  });
  element('#python-edit').addEventListener('click', () => { if (!flush()) return; error = ''; void bridge.begin().then(() => { view = 'draft'; refresh(); textarea.focus(); }).catch(message); });
  element('#python-inspect').addEventListener('click', () => { view = 'generated'; refresh(); });
  element('#python-blocks').addEventListener('click', () => { const blockly = document.querySelector<HTMLElement>('#blockly')!; blockly.tabIndex = -1; blockly.focus(); blockly.scrollIntoView({ block: 'center' }); });
  element('#python-apply').addEventListener('click', () => { void apply().catch(message); });
  element('#python-cancel').addEventListener('click', () => bridge.cancel());
  element('#python-use-blocks').addEventListener('click', () => { if (!flush()) return; error = ''; void bridge.useBlocks().then(refresh).catch(message); });
  element('#python-discard').addEventListener('click', () => { if (!flush()) return; try { error = ''; bridge.discard(); refresh(); } catch (failure) { message(failure); } });
  element('#python-download').addEventListener('click', () => options.download('python-draft.py', unstored ?? bridge.state.draft?.source ?? ''));
  element('#python-recover').addEventListener('click', () => { if (!flush()) return; try { error = ''; bridge.recover(recovery.value); view = 'draft'; refresh(); textarea.focus(); } catch (failure) { message(failure); } });
  element('#python-recovery-download').addEventListener('click', () => { const entry = bridge.state.recovery.find(entry => entry.id === recovery.value); if (entry) options.download('recovered-python.py', entry.source); });
  element('#python-recovery-remove').addEventListener('click', () => { if (confirm('Remove this saved Python recovery entry? Download it first if you want to keep a copy.')) bridge.removeRecovery(recovery.value); });
  files.addEventListener('change', generated);
  const unsubscribe = bridge.subscribe(() => { refresh(); options.changed(); });
  return {
    refresh, apply, flush, replayCheckpoint, allowReplay, get active() { return !!bridge.state.draft; }, get busy() { return bridge.status.busy; }, get unstored() { return unstored !== undefined; }, get hasChanges() { return unstored !== undefined || draftChanged(bridge.state.draft); },
    reset() { bridge.cancel(false); unstored = undefined; error = ''; hadDraft = false; view = 'generated'; },
    cancel() { bridge.cancel(); },
    dispose() { disposed = true; hashEpoch++; unsubscribe(); bridge.dispose(); parser.dispose(); },
  };
}
