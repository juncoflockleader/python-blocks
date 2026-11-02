import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { prepareProject, restore } from '../../src/project';
import { compile } from '../../src/language/compiler';
import type { GameStep } from '../../src/guide/checker';
import type { SpriteState } from '../../src/scene/model';
import { paletteWorkspace } from './palette-workspace';

/** The arcade examples (content/examples), played by the scripted player the academy uses
 * (src/runtime/checks.py, run under CPython by tests/python/scene_check.py): each one runs
 * without an error, its controls do what they say, and it can be lost. */
const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
/** `settings` changes numbers, looks and sprites in the Settings tab first, by the id of the number, costume or
 * sprite block. `stage` changes the stage's sprites before that, so a setting can pick a new one. */
const FIELDS: Record<string, string> = { scene_costume: 'COSTUME_ID', scene_sprite: 'SPRITE_ID' };
function play(id: string, steps: GameStep[], settings: Record<string, string> = {}, stage = (sprites: SpriteState[]) => sprites) {
  const w = paletteWorkspace(); spaces.push(w);
  const { project } = prepareProject(readFileSync(`content/examples/${id}.json`, 'utf8'));
  project.workspace.pythonScene!.sprites = stage(project.workspace.pythonScene!.sprites);
  restore(w, project);
  for (const [id, value] of Object.entries(settings)) { const block = w.getBlockById(id)!; block.setFieldValue(value, FIELDS[block.type] ?? 'VALUE'); }
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
  it('Rock Blaster: every script reads its Settings, so more lives, a faster ship and no turning change the game', () => {
    play('rock-blaster', [
      { wait: 0.3 }, { expect: { lives: 5 } }, { place: 'Ship', x: 0, y: -130 }, { key: 'ArrowUp', hold: 0.5 }, { expect: { sprite: 'Ship', y: [-40, 20] } },
      { key: 'ArrowRight', hold: 0.3 }, { expect: { sprite: 'Ship', direction: 270 } },
    ], { 'rock-blaster-lives': '5', 'rock-blaster-ship-speed': '8', 'rock-blaster-turn-speed': '0' });
  }, 60_000);
  it('Rock Blaster: each sprite starts with the look, size and place its Settings give it', () => {
    play('rock-blaster', [
      { wait: 0.3 }, { expect: { sprite: 'Ship', x: 100 } }, { expect: { sprite: 'Ship', y: -100 } }, { expect: { sprite: 'Ship', direction: 0 } },
      { expect: { sprite: 'Ship', size: 150 } }, { expect: { sprite: 'Ship', costume: 'star' } }, { expect: { sprite: 'Shot', size: 80 } },
      { expect: { sprite: 'Rock', size: 60 } }, { expect: { sprite: 'Rock', costume: 'ball' } }, { expect: { sprite: 'Rock', y: 100 } },
      // Pointing right, the ship flies right.
      { key: 'ArrowUp', hold: 0.3 }, { expect: { sprite: 'Ship', x: [120, 160] } },
    ], {
      'rock-blaster-ship-start-x': '100', 'rock-blaster-ship-start-y': '-100', 'rock-blaster-ship-start-direction': '0', 'rock-blaster-ship-size': '150', 'rock-blaster-ship-look': 'star',
      'rock-blaster-shot-size': '80', 'rock-blaster-rock-size': '60', 'rock-blaster-rock-start-y': '100', 'rock-blaster-rock-looks-1': 'ball', 'rock-blaster-rock-looks-2': 'ball', 'rock-blaster-rock-looks-3': 'ball',
    });
  }, 60_000);
  it('Rock Blaster: only Settings name the sprites, so new ones can play the ship, the shot and the rocks, and the old ones can go', () => {
    // Ufo, Bolt and Comet take the place of Ship, Shot and Rock, which are deleted: no script named them.
    const sprite = (id: string, name: string, visible: boolean): SpriteState => ({ id, name, x: -150, y: -100, direction: 0, size: 100, layer: 1, visible, rotationStyle: 'all', costume: 'star' });
    play('rock-blaster', [
      { wait: 0.3 }, { expect: { sprite: 'Ufo', at: [0, 0] } }, { expect: { sprite: 'Ufo', direction: 270 } },
      { place: 'Ufo', x: 0, y: -130 }, { key: 'ArrowUp', hold: 0.5 }, { expect: { sprite: 'Ufo', y: [-100, -30] } },
      { key: 'ArrowRight', hold: 0.3 }, { expect: { sprite: 'Ufo', direction: [290, 360] } },
      { key: 'Space' }, { wait: 0.1 }, { expect: { sprite: 'Bolt', visible: true } },
      // The rocks are copies of Comet, dressed in the rock looks.
      { expect: { sprite: 'Comet', costume: 'stock-rock-round' } },
      { wait: 40 }, { expect: { lives: [0, 2] } },
    ], { 'rock-blaster-ship': 'ufo', 'rock-blaster-shot': 'bolt', 'rock-blaster-rock': 'comet' }, () => [sprite('ufo', 'Ufo', true), sprite('bolt', 'Bolt', false), sprite('comet', 'Comet', false)]);
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
