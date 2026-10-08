import type * as Blockly from 'blockly/core';
import { effectLimits, effectNames, type Effects } from './effects';
import { defaultPen } from './model';
import { sceneState, changeScene } from './state';

export function installAppearanceEditor(workspace: Blockly.WorkspaceSvg, selected: () => string, editable: () => boolean) {
  document.getElementById('scene-properties')!.insertAdjacentHTML('afterend', `<details id="scene-appearance"><summary>Pen & graphic effects</summary>
    <p>These settings are saved as the starting appearance. Pen trails and stamps are created by running blocks.</p>
    <label>Edit <select id="appearance-target"><option value="sprite">Selected sprite</option><option value="stage">Stage background</option></select></label>
    <form id="appearance-form"><fieldset id="appearance-fields"><legend>Initial appearance</legend>
      <fieldset id="appearance-pen"><legend>Sprite pen</legend><div class="scene-properties-grid">
        <label>Pen down <input id="appearance-down" type="checkbox"></label><label>Pen color <input id="appearance-color" type="color"></label>
        <label>Width (pixels) <input id="appearance-width" type="number" min="1" max="1200" step="any" required></label><label>Opacity % <input id="appearance-opacity" type="number" min="0" max="100" step="any" required></label>
      </div></fieldset>
      <div class="scene-properties-grid">${effectNames.map(name => `<label>${name === 'color' ? 'Color (hue °)' : name[0].toUpperCase() + name.slice(1)} <input id="appearance-effect-${name}" type="number" min="${effectLimits[name][0]}" max="${effectLimits[name][1]}" step="any" value="0" required></label>`).join('')}</div>
      <div class="scene-toolbar"><button class="button primary" type="submit">Apply appearance</button><button id="appearance-clear" class="button secondary" type="button">Clear graphic effects</button></div>
    </fieldset></form><p id="appearance-error" role="alert"></p></details>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const target = el<HTMLSelectElement>('appearance-target');
  function refresh() {
    const scene = sceneState(workspace), sprite = scene.sprites.find(s => s.id === selected()), stage = target.value === 'stage', pen = sprite?.pen ?? defaultPen();
    el<HTMLFieldSetElement>('appearance-fields').disabled = !editable() || (!stage && !sprite);
    el<HTMLFieldSetElement>('appearance-pen').disabled = stage; el('appearance-pen').hidden = stage;
    el<HTMLInputElement>('appearance-down').checked = pen.down;
    for (const key of ['color', 'width', 'opacity'] as const) el<HTMLInputElement>('appearance-' + key).value = String(pen[key]);
    for (const name of effectNames) el<HTMLInputElement>('appearance-effect-' + name).value = String((stage ? scene.effects : sprite?.effects)?.[name] ?? 0);
  }
  function apply(clear = false) {
    if (!editable()) return;
    try {
      const scene = sceneState(workspace), sprite = scene.sprites.find(s => s.id === selected());
      const effects: Effects = Object.fromEntries(effectNames.map(name => [name, clear ? 0 : el<HTMLInputElement>('appearance-effect-' + name).valueAsNumber]));
      if (target.value === 'stage') scene.effects = effects;
      else if (sprite) {
        sprite.effects = effects;
        if (!clear) sprite.pen = { down: el<HTMLInputElement>('appearance-down').checked, color: el<HTMLInputElement>('appearance-color').value, width: el<HTMLInputElement>('appearance-width').valueAsNumber, opacity: el<HTMLInputElement>('appearance-opacity').valueAsNumber };
      }
      changeScene(workspace, scene); refresh(); el('appearance-error').textContent = '';
    } catch (error) { el('appearance-error').textContent = error instanceof Error ? error.message : String(error); }
  }
  target.addEventListener('change', refresh);
  el('appearance-form').addEventListener('submit', event => { event.preventDefault(); apply(); });
  el('appearance-clear').addEventListener('click', () => apply(true));
  return { refresh };
}
