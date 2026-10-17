import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { installScenePalette } from '../../src/scene/palette';
import { sceneState } from '../../src/scene/state';
import { createWorkspace, prepareProject, restore } from '../../src/project';
import { installLevels } from '../../src/ui/levels';

type Item = Blockly.utils.toolbox.FlyoutItemInfo;
/** A headless workspace with the palette callbacks the browser editor registers. Dispose it after use. */
export function paletteWorkspace(project?: string) {
  const w = createWorkspace();
  if (project) restore(w, prepareProject(readFileSync(project, 'utf8')).project);
  const callbacks = new Map<string, (w: Blockly.WorkspaceSvg) => Item[]>();
  const mock = w as Blockly.WorkspaceSvg;
  mock.registerToolboxCategoryCallback = (key, fn) => { callbacks.set(key, fn as (w: Blockly.WorkspaceSvg) => Item[]); };
  mock.getToolboxCategoryCallback = key => callbacks.get(key) as never;
  installScenePalette(mock, () => sceneState(w).sprites[0]?.id ?? '');
  // Dialog-backed categories: their fixed buttons and blocks, as language/*-editor.ts registers them.
  mock.registerToolboxCategoryCallback('PY_VARIABLES', () => [{ kind: 'button', text: 'Make a variable', callbackkey: 'PB_MAKE_VARIABLE' }]);
  mock.registerToolboxCategoryCallback('PY_FUNCTIONS', () => [{ kind: 'block', type: 'py_return' }, { kind: 'block', type: 'py_return_value' }]);
  mock.registerToolboxCategoryCallback('PY_EVENTS', () => [{ kind: 'block', type: 'py_emit' }, { kind: 'block', type: 'py_wait' }]);
  mock.registerToolboxCategoryCallback('PY_FUNCTION_VALUES', () => [{ kind: 'block', type: 'py_lambda' }]);
  mock.registerToolboxCategoryCallback('PY_MODULES', () => []);
  installLevels(mock, () => sceneState(w).sprites[0]?.id ?? '');
  return mock;
}
