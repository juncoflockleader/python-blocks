import { Blockly } from '../blocks';
import { canonical } from '../language/modules';
import { loadWorkspace, preserveEditingState } from '../language/serialization';
import { prepareProject, snapshot, type Project } from '../project';
import { BridgeNotification, bridgeState } from './draft-state';

type State = Project['workspace'];
function isolated<T>(action: () => T) {
  Blockly.Events.disable();
  try { return preserveEditingState(action); }
  finally { Blockly.Events.enable(); }
}
function replace(workspace: Blockly.Workspace, state: State) {
  const before = Blockly.serialization.workspaces.save(workspace);
  isolated(() => {
    try { loadWorkspace(structuredClone(state), workspace); }
    catch (error) { loadWorkspace(before, workspace); throw error; }
  });
}
interface ApplyEventJson extends Blockly.Events.AbstractEventJson { before: State; after: State }
class ApplyEvent extends Blockly.Events.Abstract {
  type = 'py_bridge_apply'; isBlank = false;
  constructor(workspace: Blockly.Workspace, readonly before: State, readonly after: State) { super(); this.workspaceId = workspace.id; }
  override run(forward: boolean) {
    const workspace = this.getEventWorkspace_(), from = forward ? this.before : this.after, target = structuredClone(forward ? this.after : this.before);
    // Later typing is outside block history. Undo/Redo must not erase it.
    // Its original base revision remains, so a changed base becomes a conflict.
    const current = Blockly.serialization.workspaces.save(workspace).pythonBridge;
    if (canonical(current) !== canonical(from.pythonBridge)) {
      if (current) target.pythonBridge = bridgeState(workspace);
      else delete target.pythonBridge;
    }
    replace(workspace, target);
    Blockly.Events.fire(new BridgeNotification(workspace));
  }
  override toJson(): ApplyEventJson { return { ...super.toJson(), before: this.before, after: this.after }; }
  static override fromJson(json: ApplyEventJson, workspace: Blockly.Workspace) { const event = new ApplyEvent(workspace, json.before, json.after); event.group = json.group; return event; }
}
Blockly.registry.register(Blockly.registry.Type.EVENT, 'py_bridge_apply', ApplyEvent);

/** Validate first, then install one atomic Blockly history entry. */
export function applyProjectTransaction(workspace: Blockly.Workspace, project: Project) {
  const prepared = isolated(() => prepareProject(JSON.stringify(project)));
  if (prepared.migrationStacks.length) throw new Error('Choose the legacy startup order before applying Python.');
  const before = snapshot(workspace).workspace, after = prepared.project.workspace;
  if (canonical(before) === canonical(after)) return;
  replace(workspace, after);
  const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(true);
  try { Blockly.Events.fire(new ApplyEvent(workspace, before, snapshot(workspace).workspace)); }
  finally { Blockly.Events.setGroup(group); }
}
