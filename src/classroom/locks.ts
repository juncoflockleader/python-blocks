import type * as Blockly from 'blockly/core';

/** Blocks a classroom step makes for the learner can be locked, so a script that is there to be read,
 * or to have blocks snapped into it, cannot be pulled apart or lost. `true` freezes the whole script:
 * it cannot be moved, deleted or changed. `"hat"` keeps only its "when …" block in place, and the
 * blocks under it stay free (a script to put in order, or to mend).
 *
 * A locked block is marked in its `data`, which is saved with the project, so the locks are still
 * there when the step is reopened, and leaving the classroom takes off exactly the locks it put on. */
export type Lock = true | 'hat';
const MARK = 'classroom-lock';

export function lockScript(top: Blockly.Block | null | undefined, lock: Lock) {
  if (!top) return;
  for (const block of lock === 'hat' ? [top] : top.getDescendants(false)) {
    block.setMovable(false); block.setDeletable(false);
    if (lock === true) block.setEditable(false);
    block.data = MARK;
  }
}
export const isLocked = (block: Blockly.Block) => block.data === MARK;
/** Take every classroom lock off: free play starts with blocks that can all be moved, changed and deleted. */
export function unlockAll(workspace: Blockly.Workspace) {
  for (const block of workspace.getAllBlocks(false)) if (isLocked(block)) {
    block.setMovable(true); block.setDeletable(true); block.setEditable(true); block.data = null;
  }
}
