import * as Blockly from 'blockly/core';
import { emptyScene, validateScene, type SceneState } from './model';
const states = new WeakMap<Blockly.Workspace, SceneState>();
export function sceneState(workspace: Blockly.Workspace): SceneState { return structuredClone(states.get((workspace as Blockly.WorkspaceSvg).targetWorkspace ?? workspace) ?? emptyScene()); }
function apply(workspace: Blockly.Workspace, state: SceneState) {
  validateScene(state);
  for (const block of workspace.getAllBlocks(false)) for (const key of ['SPRITE_ID', 'COSTUME_ID', 'BACKDROP_ID', 'WORLD_ID', 'SOUND_ID']) {
    const field = block.getField(key); if (field) field.loadState(field.saveState(true));
  }
  states.set(workspace, structuredClone(state));
  for (const block of workspace.getAllBlocks(false)) if (block.type === 'py_handler') (block as Blockly.Block & { doProcedureUpdate(): void }).doProcedureUpdate();
  for (const block of workspace.getAllBlocks(false)) for (const key of ['SPRITE_ID', 'COSTUME_ID', 'BACKDROP_ID', 'WORLD_ID', 'SOUND_ID']) {
    const field = block.getField(key) as Blockly.FieldDropdown | null;
    if (field) (field as Blockly.FieldDropdown & { refresh(): void }).refresh();
  }
}
interface SceneEventJson extends Blockly.Events.AbstractEventJson { before: SceneState; after: SceneState }
class SceneEvent extends Blockly.Events.Abstract {
  type = 'py_scene'; isBlank = false;
  constructor(workspace: Blockly.Workspace, readonly before: SceneState, readonly after: SceneState) { super(); this.workspaceId = workspace.id; }
  override run(forward: boolean) {
    const workspace = this.getEventWorkspace_(); apply(workspace, forward ? this.after : this.before);
    const notification = new SceneEvent(workspace, forward ? this.before : this.after, forward ? this.after : this.before); notification.recordUndo = false; Blockly.Events.fire(notification);
  }
  override toJson(): SceneEventJson { return { ...super.toJson(), before: this.before, after: this.after }; }
  static override fromJson(json: SceneEventJson, workspace: Blockly.Workspace) { const e = new SceneEvent(workspace, json.before, json.after); e.group = json.group; return e; }
}
Blockly.registry.register(Blockly.registry.Type.EVENT, 'py_scene', SceneEvent);
export function changeScene(workspace: Blockly.Workspace, next: SceneState) {
  const before = sceneState(workspace); if (JSON.stringify(before) === JSON.stringify(next)) return;
  if (new TextEncoder().encode(JSON.stringify({ ...Blockly.serialization.workspaces.save(workspace), pythonScene: next })).length > 15_990_000) throw new Error('The scene would exceed the 16 MB project limit. Use shorter sounds or smaller images.');
  apply(workspace, next); Blockly.Events.fire(new SceneEvent(workspace, before, structuredClone(next)));
}
Blockly.serialization.registry.register('pythonScene', {
  priority: 95,
  save(workspace) { const s = sceneState(workspace); return s.watchers?.length || s.controls || s.sounds?.length || s.worlds?.length || s.world || s.camera || s.sprites.length || s.assets.length || s.backdrops?.length || s.backdrop || s.effects || s.background !== emptyScene().background ? s : null; },
  load(state, workspace) { validateScene(state); apply(workspace, state); }, clear(workspace) { states.delete(workspace); },
});
