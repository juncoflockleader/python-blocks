import * as Blockly from 'blockly/core';

/** Blockly 13.3 restores these globals only on successful deserialization.
 * A rejected file or clipboard item must not disable subsequent Undo events. */
export function preserveEditingState<T>(action: () => T): T {
  const recordUndo = Blockly.Events.getRecordUndo(); const group = Blockly.Events.getGroup();
  try { return action(); }
  finally { Blockly.Events.setRecordUndo(recordUndo); Blockly.Events.setGroup(group); }
}

export function loadWorkspace(state: Record<string, any>, workspace: Blockly.Workspace) {
  return preserveEditingState(() => {
    try { Blockly.serialization.workspaces.load(state, workspace); }
    catch (error) {
      // Match the cleanup skipped by the pinned loader's exceptional path.
      if (workspace.rendered) (workspace as Blockly.WorkspaceSvg).setResizesEnabled(true);
      Blockly.utils.dom.stopTextWidthCache();
      throw error;
    }
  });
}
