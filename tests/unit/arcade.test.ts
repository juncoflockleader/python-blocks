import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { prepareProject, restore } from '../../src/project';
import { compile } from '../../src/language/compiler';
import type { GameStep } from '../../src/guide/checker';
import { paletteWorkspace } from './palette-workspace';

/** The arcade examples (content/examples), played by the scripted player the academy uses
 * (src/runtime/checks.py, run under CPython by tests/python/scene_check.py): each one runs
 * without an error, its controls do what they say, and it can be lost. */
const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
function play(id: string, steps: GameStep[]) {
  const w = paletteWorkspace(); spaces.push(w);
  restore(w, prepareProject(readFileSync(`content/examples/${id}.json`, 'utf8')).project);
  const compiled = compile(w);
  expect(compiled.diagnostics.filter(d => d.severity === 'error'), id).toEqual([]);
  const out = execFileSync('python3', ['tests/python/scene_check.py'], { input: JSON.stringify({ source: compiled.source, scene: compiled.scene, steps, files: compiled.files }), encoding: 'utf8' });
  const { result, reports } = JSON.parse(out) as { result: { type: string; message?: string }; reports: { index: number; ok: boolean; got: unknown }[] };
  expect(result.type, result.message).toBe('done');
  expect(reports.filter(r => !r.ok), `${id}: ${JSON.stringify(reports)}`).toEqual([]);
}

describe('arcade examples', () => {
  it('Maze Muncher: the muncher sets off left eating dots, turns up at a corner, and ghosts catch it when it stops', () => {
    play('maze-muncher', [
      { wait: 1 }, { expect: { sprite: 'Muncher', y: -112 } }, { expect: { sprite: 'Muncher', x: [-160, -60] } }, { expect: { score: [30, 60] } },
      { key: 'ArrowUp' }, { wait: 1.5 }, { expect: { sprite: 'Muncher', x: -192 } }, { expect: { sprite: 'Muncher', y: [-80, 150] } },
      { wait: 40 }, { expect: { finished: 'lost' } },
    ]);
  }, 60_000);
  it('Sky Defenders: a laser from the middle hits an alien, and the game is lost to bombs or to aliens landing', () => {
    // Left alone, the aliens land in about two minutes, if their bombs have not used up the lives first.
    play('sky-defenders', [{ wait: 1 }, { key: 'Space' }, { wait: 1.2 }, { expect: { score: 10 } }, { wait: 150 }, { expect: { finished: 'lost' } }]);
  }, 120_000);
  it('Rock Blaster: the ship turns with the arrows and flies forward, and rocks cost lives', () => {
    play('rock-blaster', [
      // Thrust first, from the bottom, out of the rocks' way (they start at the top).
      { wait: 0.3 }, { expect: { sprite: 'Ship', direction: 270 } }, { place: 'Ship', x: 0, y: -130 }, { key: 'ArrowUp', hold: 0.5 }, { expect: { sprite: 'Ship', y: [-100, -30] } },
      { key: 'ArrowRight', hold: 0.3 }, { expect: { sprite: 'Ship', direction: [290, 360] } },
      { wait: 40 }, { expect: { lives: [0, 2] } },
    ]);
  }, 60_000);
  it('Snake: the head moves a square at a time, turns, and the wall ends the game', () => {
    play('snake', [
      { wait: 0.62 }, { expect: { sprite: 'Head', x: -10 } }, { key: 'ArrowUp' }, { wait: 0.25 }, { expect: { sprite: 'Head', y: [30, 90] } },
      { wait: 3 }, { expect: { finished: 'lost' } },
    ]);
  }, 60_000);
  it('Moon Lander: the engine pushes up, and without it the lander crashes', () => {
    play('moon-lander', [{ wait: 0.3 }, { key: 'ArrowUp', hold: 1.5 }, { expect: { sprite: 'Lander', y: [125, 160] } }, { wait: 8 }, { expect: { finished: 'lost' } }]);
  }, 60_000);
  it('Flappy Pipe: gravity pulls the pipe down, Space flaps it up, and a pipe that stops flapping is lost', () => {
    play('flappy-pipe', [
      { wait: 0.3 }, { expect: { sprite: 'Pipe', y: [-40, 0] } }, { key: 'Space' }, { wait: 0.3 }, { expect: { sprite: 'Pipe', y: [5, 60] } },
      { wait: 4 }, { expect: { finished: 'lost' } },
    ]);
  }, 60_000);
});
