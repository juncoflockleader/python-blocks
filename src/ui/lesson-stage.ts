import { iconMarkup } from './icon-art';

/** In a lesson the stage steps back while the learner builds: a small window beside
 * the sprites, so the lesson under it has room for the whole step. Run code brings
 * it back to full size; touching the blocks or the palette makes it small again.
 * The button on the stage swaps the sizes by hand, and a stage made big that way
 * stays big until it is made small. A puzzle's stage is only a picture, so it stays
 * small. Free play, Stage view and narrow screens keep the usual stage
 * (docs/learner-experience-plan.md §3.17). */
export function installLessonStage() {
  const root = document.documentElement, wrap = document.querySelector('.stage-wrap'), blocks = document.querySelector('.blocks-panel');
  let lesson = false, puzzle = false, big = false, kept = false;
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'stage-size'; button.className = 'stage-size'; button.hidden = true;
  wrap?.append(button);
  function apply() {
    if (lesson) root.dataset.lessonStage = big && !puzzle ? 'big' : 'small'; else delete root.dataset.lessonStage;
    button.hidden = !lesson || puzzle;
    const small = root.dataset.lessonStage === 'small', label = small ? 'Make the stage bigger' : 'Make the stage smaller';
    button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(!small));
    button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup(small ? 'resize' : 'fit')}</svg>`;
  }
  button.addEventListener('click', event => {
    event.stopPropagation();
    big = root.dataset.lessonStage === 'small'; kept = big; apply();
  });
  // Back to the blocks: the stage steps back again, unless the learner made it big by hand.
  const building = () => { if (lesson && big && !kept) { big = false; apply(); } };
  blocks?.addEventListener('pointerdown', building, true);
  apply();
  return {
    /** A lesson opened or closed, or a step opened (a puzzle or not): the learner builds again, so the stage steps back. */
    lesson(on: boolean, isPuzzle: boolean) {
      if (on !== lesson) kept = false;
      if (!kept) big = false;
      lesson = on; puzzle = isPuzzle; apply();
    },
    /** Run code: the game gets the full stage. */
    running() { if (lesson && !puzzle && !big) { big = true; apply(); } },
    dispose() { blocks?.removeEventListener('pointerdown', building, true); button.remove(); delete root.dataset.lessonStage; },
  };
}
