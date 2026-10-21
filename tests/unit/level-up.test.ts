import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { prepareProject, restore } from '../../src/project';
import { compile } from '../../src/language/compiler';
import { buildById } from '../../src/guide/builds';
import type { GameStep } from '../../src/guide/checker';
import { paletteWorkspace } from './palette-workspace';

/** The Level up lesson's game, played by the scripted player the academy uses (src/runtime/checks.py, run
 * under CPython by tests/python/scene_check.py): each flag goes on to the next world, the Hero starts each
 * level on the left with new coins, and only the last level's flag wins. */
const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
function play(project: unknown, steps: GameStep[]) {
  const w = paletteWorkspace(); spaces.push(w);
  restore(w, prepareProject(JSON.stringify(project)).project);
  const compiled = compile(w);
  expect(compiled.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const out = execFileSync('python3', ['tests/python/scene_check.py'], { input: JSON.stringify({ source: compiled.source, scene: compiled.scene, steps, files: compiled.files }), encoding: 'utf8' });
  const { result, reports } = JSON.parse(out) as { result: { type: string; message?: string }; reports: { index: number; ok: boolean; got: unknown }[] };
  expect(result.type, result.message).toBe('done');
  return reports;
}
const AT_FLAG: GameStep[] = [{ place: 'Hero', x: 2048, y: -40 }, { wait: 0.4 }];
const expectations = (steps: GameStep[]) => steps.filter(step => 'expect' in step).length;

it('Level up: each flag goes on to the next level, where the Hero starts on the left with new coins, and the last flag wins', () => {
  const steps: GameStep[] = [
    { wait: 0.2 }, { expect: { level: 1 } },
    ...AT_FLAG, { expect: { level: 2 } }, { expect: { sprite: 'Hero', x: [-140, -116] } },
    // Level 2 made its own coins: the first row is on the ground near the start.
    { place: 'Hero', x: 0, y: -70 }, { wait: 0.3 }, { expect: { score: [1, 99] } },
    ...AT_FLAG, { expect: { level: 3 } }, { expect: { sprite: 'Hero', x: [-140, -116] } },
    ...AT_FLAG, { expect: { finished: 'won' } },
  ];
  const reports = play(JSON.parse(readFileSync('content/builds/level-up-game.json', 'utf8')), steps);
  expect(reports.filter(report => report.ok), JSON.stringify(reports)).toHaveLength(expectations(steps));
});

it('Level up starts as Super Hopper: the flag still wins on Level 1, and the Level 2 cave is waiting', () => {
  const lesson = buildById('level-up')!;
  const steps: GameStep[] = [{ wait: 0.2 }, { expect: { level: 1 } }, ...AT_FLAG, { expect: { finished: 'won' } }, { expect: { level: 1 } }];
  const reports = play(lesson.starter, steps);
  expect(reports.filter(report => report.ok), JSON.stringify(reports)).toHaveLength(expectations(steps));
});
