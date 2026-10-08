/** Move the existing stage and input hosts into a modal; never restart the run. */
export function installPlayView(release: () => void) {
  const panel = document.querySelector('.stage-panel')!;
  panel.querySelector('.panel-heading')!.insertAdjacentHTML('beforeend', '<button id="play-expand" class="button secondary">Large stage</button>');
  document.body.insertAdjacentHTML('beforeend', '<dialog id="play-dialog" aria-labelledby="play-title"><header><h2 id="play-title">Play your project</h2><span id="play-status" role="status"></span><button id="play-run" class="button primary">Run code</button><button id="play-stop" class="button secondary">Stop</button><button id="play-close" class="button secondary">Return to editor</button></header><div id="play-body"></div><p id="play-error" role="alert" hidden></p><p class="play-help">Focus the stage to use keys, or show Touch controls. Escape returns to the editor.</p></dialog>');
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('play-dialog'), run = el<HTMLButtonElement>('run'), stop = el<HTMLButtonElement>('stop');
  const slots: [HTMLElement, Comment][] = [];
  const sync = () => { el<HTMLButtonElement>('play-run').disabled = run.disabled; el<HTMLButtonElement>('play-stop').disabled = stop.disabled; el('play-status').textContent = el('status').textContent; el('play-error').hidden = el('status').textContent !== 'Let’s try again'; el('play-error').textContent = el('output').textContent; };
  const observer = new MutationObserver(sync); for (const node of [run, stop, el('status'), el('output')]) observer.observe(node, {attributes:true,childList:true,characterData:true,subtree:true});
  el('play-expand').addEventListener('click', () => {
    release();
    for (const selector of ['.stage-wrap','#touch-controls','#questions','#watch-readouts','#stage-dialogue','.audio-controls']) {
      const node = document.querySelector<HTMLElement>(selector); if (!node) continue;
      const slot = document.createComment('play-view'); node.before(slot); slots.push([node,slot]); el('play-body').append(node);
    }
    sync(); dialog.showModal();
    (el<HTMLFormElement>('question-form').hidden ? el('stage') : el('question-answer')).focus({preventScroll:true});
  });
  const restore = () => { release(); for (const [node,slot] of slots.splice(0)) slot.replaceWith(node); el('play-expand').focus({preventScroll:true}); };
  dialog.addEventListener('close', restore);
  el('play-close').addEventListener('click', () => dialog.close());
  el('play-run').addEventListener('click', () => { run.click(); el('stage').focus({preventScroll:true}); });
  el('play-stop').addEventListener('click', () => stop.click());
  return { dispose() { observer.disconnect(); dialog.removeEventListener('close', restore); if (slots.length) restore(); dialog.remove(); } };
}
