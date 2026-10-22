import * as Blockly from 'blockly/core';

/** Scripts that start this close together, left to right, make one column. */
const COLUMN = 120;
const GAP_X = 48, GAP_Y = 32;

/** Spread out the scripts of a project just opened so none overlaps another, by their size as drawn on
 * this screen (a touch screen's larger text makes wider blocks). The layout keeps its columns and their
 * order: a script that runs into the one above it in its column moves down, and a column that runs into
 * a script of a column on its left moves right. Scripts that do not overlap stay where they are.
 * Returns whether anything moved. */
export function spreadScripts(workspace: Blockly.WorkspaceSvg) {
  Blockly.renderManagement.triggerQueuedRenders(workspace);
  const scripts = workspace.getTopBlocks(false).map(block => {
    const box = block.getBoundingRectangle();
    return { block, left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top, dx: 0, dy: 0 };
  });
  if (scripts.length < 2) return false;
  type Script = typeof scripts[number];
  const columns: Script[][] = [];
  for (const script of [...scripts].sort((a, b) => a.left - b.left)) {
    const column = columns.at(-1);
    if (column && script.left - column[0].left < COLUMN) column.push(script); else columns.push([script]);
  }
  const left = (s: Script) => s.left + s.dx, top = (s: Script) => s.top + s.dy;
  const placed: Script[] = [];
  for (const column of columns) {
    // Down the column: each script starts below the ones above it.
    let bottom = -Infinity;
    for (const script of column.sort((a, b) => a.top - b.top)) {
      if (top(script) < bottom + 8) script.dy = bottom + GAP_Y - script.top;
      bottom = Math.max(bottom, top(script) + script.height);
    }
    // Across: the column moves right past any script on its left that it overlaps.
    let shift = 0;
    for (const script of column) for (const other of placed) {
      const beside = top(script) < top(other) + other.height && top(other) < top(script) + script.height;
      if (beside && left(script) < left(other) + other.width + 8) shift = Math.max(shift, left(other) + other.width + GAP_X - left(script));
    }
    if (shift > 0) for (const script of column) script.dx += shift;
    placed.push(...column);
  }
  const moved = scripts.filter(s => Math.abs(s.dx) > 0.5 || Math.abs(s.dy) > 0.5);
  for (const script of moved) script.block.moveBy(script.dx, script.dy);
  if (moved.length) workspace.resizeContents();
  return moved.length > 0;
}
