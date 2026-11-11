import * as Blockly from 'blockly/core';
import './classroom.css';
import type { ClassroomStep } from '../guide/builds';
import type { Level } from '../ui/levels';
import { iconMarkup } from '../ui/icon-art';
import { stockDataUrl } from '../art/raster';
import { stepBlockNumber, stepToolbox } from './toolbox';

/** The classroom's narrowed editor. While a classroom step is open the editor shows only what the
 * step needs: the step's own blocks in one flat list that stays open ("Your blocks") in place of the
 * categories, the stage, and the lesson with the guide beside the stage. The level picker, Examples,
 * Lessons, the ⋯ menu, script tabs, Find blocks, Quick tools, the sprite tray and the other tabs are
 * put away (classroom.css), not greyed out: a control is either there or it is not. A step with no
 * blocks of its own (one that is watched, guessed or mended) has no list at all.
 *
 * `:root[data-classroom]` is "blocks" or "watch"; `data-classroom-show` names what a step asks to
 * have back ("sprites"). Leaving the classroom gives the editor back exactly as it was. */
export interface ClassroomHost {
  /** The learner's level: a block is looked for at the unit's level first, then here. */
  level(): Level;
  /** Keep the lesson panel in front while the classroom is open (its tabs are put away), or let the tabs go again. */
  pinLesson(on: boolean): void;
  /** The selected sprite, and selecting one. */
  selected(): string;
  select(sprite: string): void;
}
type Flyout = Blockly.IFlyout & { autoClose: boolean };

export function installClassroom(workspace: Blockly.WorkspaceSvg, host: ClassroomHost) {
  const root = document.documentElement;
  // The guide beside the small stage: the Chick says the step's goal, over the stop's dots.
  const guide = document.createElement('div');
  guide.id = 'classroom-guide'; guide.className = 'classroom-guide'; guide.hidden = true;
  guide.innerHTML = `<img class="classroom-chick" alt="" src="${stockDataUrl('cast/chick-happy@1')}"><p id="classroom-title" class="classroom-title"></p>
    <div class="classroom-place"><span id="classroom-stop"></span><ol id="classroom-dots" class="classroom-dots"></ol></div>`;
  document.querySelector('.stage-panel')?.after(guide);
  let current: ClassroomStep | null = null, timer = 0, shown = '';
  const levels = (): Level[] => current ? [...new Set([current.level, host.level()])] : [host.level()];
  const flyout = () => workspace.getToolbox()?.getFlyout() as Flyout | null | undefined;

  /** Show the step's blocks as the one open list, or no list; Blockly measures the workspace again either way. */
  function pin() {
    const list = flyout(); if (!list) return;
    // The categories were just hidden (or are back), so the workspace starts at another x.
    Blockly.svgResize(workspace);
    workspace.getToolbox()?.clearSelection();
    if (current?.blocks.length) { const items = stepToolbox(workspace, levels(), current.blocks); shown = JSON.stringify(items); list.autoClose = false; list.show(items); }
    else { shown = ''; list.autoClose = true; list.hide(); }
    Blockly.svgResize(workspace);
  }
  function renderGuide(step: ClassroomStep) {
    guide.querySelector('#classroom-title')!.textContent = step.title;
    guide.querySelector('#classroom-stop')!.textContent = step.stop;
    const dots = guide.querySelector('#classroom-dots')!;
    dots.setAttribute('aria-label', `${step.stop}: step ${step.place}`);
    dots.replaceChildren(...step.dots.map((state, i) => {
      const dot = document.createElement('li'); dot.className = `classroom-dot classroom-dot-${state}`;
      dot.setAttribute('aria-label', `Step ${i + 1}: ${state === 'done' ? 'done' : state === 'now' ? 'this one' : 'locked'}`);
      if (state === 'now') dot.textContent = String(i + 1);
      else dot.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup(state === 'done' ? 'check' : 'lock')}</svg>`;
      return dot;
    }));
  }
  /** The list is made from the project: its sprites, and the one selected ("when Robot clicked"). So once the project
   * settles (a step's project opened, a page reload put the work back, Start over) or a sprite is picked, the step's
   * sprite is the selected one again unless the step lets the learner choose, and the list is shown again if it changed. */
  const settle = () => {
    if (!current) return;
    if (current.sprite && !current.show.includes('sprites') && host.selected() !== current.sprite) host.select(current.sprite);
    if (current.blocks.length && JSON.stringify(stepToolbox(workspace, levels(), current.blocks)) !== shown) pin();
  };
  const later = () => { clearTimeout(timer); timer = window.setTimeout(settle, 80); };
  const changed = (event: Blockly.Events.Abstract) => { if (current && !event.isUiEvent) later(); };
  workspace.addChangeListener(changed);
  const tray = document.getElementById('sprite-tray'), surface = document.querySelector('.stage-surface');
  tray?.addEventListener('click', later); surface?.addEventListener('pointerup', later);

  return {
    get open() { return !!current; },
    /** A classroom step opened, or (null) the classroom closed. */
    step(next: ClassroomStep | null) {
      const was = !!current;
      current = next;
      if (next) { root.dataset.classroom = next.blocks.length ? 'blocks' : 'watch'; root.dataset.classroomShow = next.show.join(' '); renderGuide(next); }
      else { delete root.dataset.classroom; delete root.dataset.classroomShow; }
      guide.hidden = !next;
      if (was !== !!next) host.pinLesson(!!next);
      pin();
    },
    /** Scripts just put on the workspace are shown from their top left corner: beside the list the workspace is
     * narrow, and a script is read from its "when …" block. */
    reveal(block: Blockly.BlockSvg | undefined) {
      if (!current || !block) return;
      const at = block.getRelativeToSurfaceXY(), scale = workspace.scale;
      workspace.scroll(24 - at.x * scale, 24 - at.y * scale);
    },
    /** The list again, after the sprite picked or the level changed. */
    refresh() { if (current) pin(); },
    /** A block's number in the step's list, for block pictures in the lesson's text. */
    number(ref: string) { return current?.blocks.length ? stepBlockNumber(workspace, levels(), current.blocks, ref) : undefined; },
    dispose() { clearTimeout(timer); workspace.removeChangeListener(changed); tray?.removeEventListener('click', later); surface?.removeEventListener('pointerup', later); if (current) { current = null; delete root.dataset.classroom; delete root.dataset.classroomShow; } guide.remove(); },
  };
}
