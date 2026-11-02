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
/** `settings` changes numbers and looks in the Settings tab first, by the id of the number or costume block. */
function play(id: string, steps: GameStep[], settings: Record<string, string> = {}) {
  const w = paletteWorkspace(); spaces.push(w);
  restore(w, prepareProject(readFileSync(`content/examples/${id}.json`, 'utf8')).project);
  for (const [id, value] of Object.entries(settings)) { const block = w.getBlockById(id)!; block.setFieldValue(value, block.type === 'scene_costume' ? 'COSTUME_ID' : 'VALUE'); }
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
  it('Rock Blaster: each sprite is set up by functions in its own tab, the one place that reads its setup Settings', () => {
    const w = paletteWorkspace(); spaces.push(w);
    const { project } = prepareProject(readFileSync('content/examples/rock-blaster.json', 'utf8'));
    restore(w, project);
    const setup = { dress_ship: 'ship', ship_to_start: 'ship', dress_shot: 'shots', fire_shot: 'shots', make_rock: 'rocks', split_rock: 'rocks' };
    expect(Object.fromEntries(Object.keys(setup).map(name => [name, project.workspace.scriptTabs!.scripts[`${name}_function_block`]]))).toEqual(setup);
    // The Python functions whose bodies name a setting or call a function.
    const lines = compile(w).source!.split('\n');
    const users = (name: string) => {
      const found = new Set<string>(); let inside = '';
      for (const line of lines) {
        const def = /^(?:async )?def (\w+)/.exec(line);
        if (def) inside = def[1]; else if (!/^\s/.test(line)) inside = ''; else if (inside && new RegExp(`\\b${name}\\b`).test(line)) found.add(inside);
      }
      return [...found].sort();
    };
    expect(Object.fromEntries(['SHIP_SIZE', 'SHIP_START_DIRECTION', 'SHIP_START_X', 'SHIP_START_Y', 'SHOT_LOOK', 'SHOT_SIZE', 'ROCK_SIZE', 'ROCK_START_Y', 'PIECE_SIZE', 'SPLIT_PIECES'].map(name => [name, users(name)]))).toEqual({
      SHIP_SIZE: ['dress_ship'], SHIP_START_DIRECTION: ['dress_ship'], SHIP_START_X: ['ship_to_start'], SHIP_START_Y: ['ship_to_start'], SHOT_LOOK: ['dress_shot'], SHOT_SIZE: ['dress_shot'],
      ROCK_SIZE: ['make_rock'], ROCK_START_Y: ['make_rock'], PIECE_SIZE: ['split_rock'], SPLIT_PIECES: ['split_rock'],
    });
    // The ship goes back to its start the same way at the start and after a rock hits it.
    expect(Object.fromEntries(Object.keys(setup).map(name => [name, users(name)]))).toEqual({
      dress_ship: ['on_start'], ship_to_start: ['on_rock_hits_ship', 'on_start'], dress_shot: ['on_start'], fire_shot: ['on_space_key'], make_rock: ['new_wave'], split_rock: ['on_rock_overlap'],
    });
  });
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
