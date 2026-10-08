import type * as Blockly from 'blockly/core';
import { defaultMotion, motionNumbers, type Motion } from './motion';
import { changeScene, sceneState } from './state';

export function installMotionEditor(workspace: Blockly.WorkspaceSvg, selected: () => string, editable: () => boolean) {
  const labels = { vx: 'x velocity', vy: 'y velocity', ax: 'x acceleration', ay: 'y acceleration', dragX: 'x drag', dragY: 'y drag', speedX: 'Control x speed', speedY: 'Control y speed', lifetime: 'Lifetime (s)' };
  document.getElementById('scene-properties')!.insertAdjacentHTML('afterend', `<details id="scene-motion"><summary>Game motion & collisions</summary>
    <p>Velocity is pixels per second; positive y goes up. Negative y acceleration makes gravity. Moving bodies collide with solid walls. Hidden walls remain solid.</p>
    <form id="motion-form"><fieldset id="motion-fields"><legend>Starting game settings</legend><div class="scene-toolbar"><label>Preset <select id="motion-preset"><option value="walker">Platform walker</option><option value="flying">Flying player</option><option value="wall">Solid wall</option><option value="bouncing">Bouncing ball</option><option value="off">Motion off</option></select></label><button id="motion-use-preset" type="button" class="button secondary">Use preset</button></div>
      <div class="scene-properties-grid"><label>Kind <input id="motion-kind" maxlength="32" required></label>
      <label>Body <select id="motion-body"><option value="off">Off</option><option value="moving">Moving</option><option value="wall">Solid wall</option></select></label>
      <label>Walls <select id="motion-response"><option value="slide">Slide</option><option value="stop">Stop</option><option value="bounce">Bounce</option><option value="destroy">Destroy</option></select></label>
      <label>Edges <select id="motion-edges"><option value="none">Pass through</option><option value="stop">Stop</option><option value="bounce">Bounce</option><option value="destroy">Destroy</option></select></label>
      <label>Controller <select id="motion-controller"><option value="none">None</option><option value="arrows">Arrow keys</option><option value="wasd">WASD</option></select></label>
      ${Object.entries(motionNumbers).map(([key, [min, max]]) => `<label>${labels[key as keyof typeof labels]} <input id="motion-${key}" type="number" min="${min}" max="${max}" step="any" required></label>`).join('')}
      <label>Offstage destroy <input id="motion-autoDestroy" type="checkbox"></label></div>
      <p>Controller speed 0 leaves that axis free for velocity or gravity. Lifetime 0 means no expiry. Add a jump block in a key handler to jump only when grounded.</p>
      <button class="button primary" type="submit">Apply game settings</button>
    </fieldset></form><p id="motion-error" role="alert"></p></details>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  let displayed = '';
  function load(motion: Motion, kind: string) {
    el<HTMLInputElement>('motion-kind').value = kind;
    for (const key of Object.keys(motion) as (keyof Motion)[]) {
      if (key === 'autoDestroy') el<HTMLInputElement>('motion-' + key).checked = motion[key];
      else el<HTMLInputElement>('motion-' + key).value = String(motion[key]);
    }
  }
  function refresh() {
    const sprite = sceneState(workspace).sprites.find(s => s.id === selected()), fingerprint = JSON.stringify([selected(), editable(), sprite?.kind, sprite?.motion]);
    if (displayed === fingerprint) return; displayed = fingerprint;
    el<HTMLFieldSetElement>('motion-fields').disabled = !editable() || !sprite;
    load({ ...defaultMotion(), ...sprite?.motion }, sprite?.kind ?? 'sprite');
  }
  el('motion-use-preset').addEventListener('click', () => {
    const preset = el<HTMLSelectElement>('motion-preset').value, motion = defaultMotion(); let kind = 'sprite';
    if (preset === 'walker') { Object.assign(motion, { body: 'moving', ay: -600, controller: 'arrows', speedX: 140, speedY: 0, edges: 'stop' }); kind = 'player'; }
    if (preset === 'flying') { Object.assign(motion, { body: 'moving', controller: 'arrows', edges: 'stop' }); kind = 'player'; }
    if (preset === 'wall') { motion.body = 'wall'; kind = 'wall'; }
    if (preset === 'bouncing') { Object.assign(motion, { body: 'moving', vx: 100, vy: 80, response: 'bounce', edges: 'bounce' }); kind = 'ball'; }
    load(motion, kind);
  });
  el('motion-form').addEventListener('submit', event => {
    event.preventDefault(); if (!editable()) return;
    try {
      const scene = sceneState(workspace), sprite = scene.sprites.find(s => s.id === selected()); if (!sprite) return;
      const motion = defaultMotion();
      for (const key of Object.keys(motionNumbers) as (keyof typeof motionNumbers)[]) motion[key] = el<HTMLInputElement>('motion-' + key).valueAsNumber;
      for (const key of ['body', 'response', 'edges', 'controller'] as const) Object.assign(motion, { [key]: el<HTMLSelectElement>('motion-' + key).value });
      motion.autoDestroy = el<HTMLInputElement>('motion-autoDestroy').checked; sprite.motion = motion; sprite.kind = el<HTMLInputElement>('motion-kind').value.trim();
      changeScene(workspace, scene); refresh(); el('motion-error').textContent = '';
    } catch (error) { el('motion-error').textContent = error instanceof Error ? error.message : String(error); }
  });
  return { refresh };
}
