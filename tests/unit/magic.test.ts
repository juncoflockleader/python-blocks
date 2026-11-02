import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { createWorkspace, prepareProject, restore } from '../../src/project';
import { acceptValue, blockValues, magicEntries, readNote, stepValue } from '../../src/guide/magic-notes';

/** The magic book (guide/magic-notes.ts): a project's block comments read as a guide to the numbers worth
 * changing, plus well-known numbers spotted without a note. */
const workspaces: Blockly.Workspace[] = [];
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
const open = (path: string) => { const w = createWorkspace(); workspaces.push(w); restore(w, prepareProject(readFileSync(path, 'utf8')).project); return w; };

describe('the magic book', () => {
  it('turns each note into a page, in tab order, with the numbers in its block', () => {
    const w = open('content/examples/maze-muncher.json'), pages = magicEntries(w);
    const notes = pages.filter(p => p.source === 'note');
    expect(notes).toHaveLength(9);
    expect([...new Set(notes.map(p => p.tab))]).toEqual(['game', 'muncher', 'ghosts']);
    const lives = notes.find(p => p.title === 'Lives at the start')!;
    expect(lives.note).toMatch(/^How many times a ghost can catch you/);
    expect(lives.values).toEqual([expect.objectContaining({ kind: 'number', value: '3', label: 'set lives to', field: 'VALUE' })]);
    expect(lives.script).toBe('when game starts');
    // The sprite the block moves is not a choice: only a sprite a setting names is (Rock Blaster's SHIP).
    expect(notes.find(p => p.title === 'Muncher speed')!.values.map(v => [v.label, v.value])).toEqual([['change sprite x by', '4']]);
    expect(notes.find(p => p.title === 'Ghost guessing')!.values.map(v => [v.label, v.value])).toEqual([['random integer from', '0'], ['to', '48']]);
    // A title alone is a page too.
    expect(notes.find(p => p.title === 'Points for a dot')!).toMatchObject({ note: '', values: [expect.objectContaining({ value: '10' })] });
    // Numbers that already have a note are not spotted again: the points have notes, the lives a ghost takes do not.
    expect(pages.filter(p => p.source === 'spotted').map(p => p.title)).toEqual(['Winning message', 'Lives lost (or won)']);
  });

  it('reads a settings tab as a config: each setting a page, costumes as looks to pick', () => {
    const w = open('content/examples/sky-defenders.json'), pages = magicEntries(w);
    const settings = pages.filter(p => p.tab === 'settings');
    expect(settings[0]).toMatchObject({ title: 'Settings', values: [] });
    expect(settings.slice(1).map(p => p.values[0].label)).toEqual(['LIVES', 'CANNON_SPEED', 'LASER_SPEED', 'ALIENS_PER_ROW', 'ALIEN_STEP', 'ALIEN_DROP', 'BOMB_SPEED', 'BOMB_CHANCE', 'MOST_BOMBS', 'POINTS_PER_ALIEN', 'DAMAGE', 'CANNON_LOOK', 'LASER_LOOK', 'BOMB_LOOK'].map(name => `set ${name} to`));
    const laser = settings.find(p => p.title === 'Laser look')!.values[0];
    expect(laser).toMatchObject({ kind: 'choice', value: 'stock-laser', field: 'COSTUME_ID' });
    expect(laser.options).toEqual(expect.arrayContaining([['Star', 'star']]));
    // The cannon's speed comes from CANNON_SPEED, so it is not spotted again in the control block.
    expect(pages.filter(p => p.source === 'spotted').map(p => p.title)).toEqual(['Game over message', 'Winning message']);
  });

  it('reads Rock Blaster’s settings tab the same way, and keeps a note without numbers with its script', () => {
    const w = open('content/examples/rock-blaster.json'), pages = magicEntries(w);
    const settings = pages.filter(p => p.tab === 'settings');
    expect(settings[0]).toMatchObject({ title: 'Settings', values: [] });
    // The last setting, ROCK_LOOKS, is a list of looks (below).
    expect(settings.slice(1, -1).map(p => p.values[0].label)).toEqual(['LIVES', 'SHIP_SPEED', 'TURN_SPEED', 'SHOT_SPEED', 'FIRST_WAVE_ROCKS', 'ROCK_SPEED', 'SPLIT_SIZE', 'SPLIT_PIECES', 'PIECE_SIZE', 'POINTS_PER_ROCK', 'DAMAGE', 'SHIP_START_X', 'SHIP_START_Y', 'SHIP_START_DIRECTION', 'SHIP_SIZE', 'SHOT_SIZE', 'ROCK_SIZE', 'ROCK_START_Y', 'SHIP', 'SHIP_LOOK', 'SHIP_FLYING_LOOK', 'SHOT', 'SHOT_LOOK', 'ROCK'].map(name => `set ${name} to`));
    expect(settings.find(p => p.title === 'Lives at the start')!.note).toMatch(/^How many rocks can hit the ship/);
    // SHIP, SHOT and ROCK name the sprite that plays each part: a sprite to pick.
    expect(['The ship', 'The shot', 'The rocks'].map(title => settings.find(p => p.title === title)!.values.map(v => [v.kind, v.value, v.field]))).toEqual([
      [['choice', 'ship', 'SPRITE_ID']], [['choice', 'shot', 'SPRITE_ID']], [['choice', 'rock', 'SPRITE_ID']],
    ]);
    expect(settings.find(p => p.title === 'The ship')!.values[0].options).toEqual(expect.arrayContaining([['Ship', 'ship'], ['Shot', 'shot'], ['Rock', 'rock']]));
    const shot = settings.find(p => p.title === 'Shot look')!.values[0];
    expect(shot).toMatchObject({ kind: 'choice', value: 'stock-little-ball', field: 'COSTUME_ID' });
    expect(shot.options).toEqual(expect.arrayContaining([['Star', 'star']]));
    // A list's items are named by its setting and their place, each a look to pick.
    expect(settings.find(p => p.title === 'Rock looks')!.values.map(v => [v.kind, v.label, v.value])).toEqual([
      ['choice', 'set ROCK_LOOKS to (first look)', 'stock-rock-big'], ['choice', 'set ROCK_LOOKS to (second look)', 'stock-rock-lumpy'], ['choice', 'set ROCK_LOOKS to (third look)', 'stock-rock-round'],
    ]);
    // A note without numbers is still a page of the guide.
    expect(pages.filter(p => p.tab !== 'settings').map(p => [p.tab, p.title, p.values])).toEqual([['shots', 'Shot direction', []]]);
    // Every number in the scripts comes from a setting, so none is spotted.
    expect(pages.filter(p => p.source === 'spotted')).toEqual([]);
  });

  it('spots lives, points, jump, speed, gravity and end messages in a game without notes', () => {
    const pages = magicEntries(open('content/builds/jump-quest-game.json'));
    expect(pages.every(p => p.source === 'spotted')).toBe(true);
    expect(pages.map(p => p.title)).toEqual(['Gravity', 'Move speed', 'Jump strength', 'Winning message']);
    expect(pages.find(p => p.title === 'Winning message')!.values).toEqual([expect.objectContaining({ kind: 'text', field: 'TEXT' })]);
  });

  it('offers words the player reads, never a name the program uses', () => {
    const w = open('content/examples/maze-muncher.json');
    const speed = magicEntries(w).find(p => p.title === 'Ghost speed')!;
    // set ghost data "speed" to 4: the 4 can change, the key "speed" cannot.
    expect(speed.values.map(v => [v.kind, v.value])).toEqual([['number', '4']]);
    const block = w.getBlockById(speed.blockId)!;
    expect(blockValues(block).some(v => v.kind === 'text')).toBe(false);
  });

  it('reads a note’s first line as its title and the rest as what to try', () => {
    expect(readNote('\n  Jump height  \nBigger jumps higher.\n\nTry 700.')).toEqual({ title: 'Jump height', note: 'Bigger jumps higher. Try 700.' });
    expect(readNote('   \n ')).toBeNull();
    expect(readNote('x'.repeat(200))!.title).toHaveLength(80);
  });

  it('accepts Python numbers only, and steps by an amount that suits the number', () => {
    expect(acceptValue('number', ' 12 ')).toBe('12');
    expect(acceptValue('number', '+5')).toBe('5');
    expect(acceptValue('number', '−3')).toBe('-3');
    expect(acceptValue('number', 'fast')).toBeNull();
    expect(acceptValue('number', '1,5')).toBeNull();
    expect(acceptValue('text', 'You win!')).toBe('You win!');
    expect(acceptValue('choice', 'star', [['Star', 'star']])).toBe('star');
    expect(acceptValue('choice', 'banana', [['Star', 'star']])).toBeNull();
    expect([stepValue('3', 1), stepValue('220', 1), stepValue('-1200', -1), stepValue('-5', 1), stepValue('0', -1)]).toEqual(['4', '230', '-1300', '-4', '-1']);
    expect([stepValue('0.1', 1), stepValue('0.025', 1), stepValue('1.5', -1), stepValue('12.5', 1)]).toEqual(['0.11', '0.026', '1.4', '13.5']);
    expect(stepValue('abc', 1)).toBeNull();
  });
});
