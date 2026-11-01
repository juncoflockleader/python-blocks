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
    const w = open('content/examples/sky-defenders.json'), pages = magicEntries(w);
    expect(pages.every(p => p.source === 'note' || p.source === 'spotted')).toBe(true);
    const notes = pages.filter(p => p.source === 'note');
    expect(notes).toHaveLength(13);
    expect([...new Set(notes.map(p => p.tab))]).toEqual(['game', 'cannon', 'aliens', 'bombs']);
    const lives = notes.find(p => p.title === 'Lives at the start')!;
    expect(lives.note).toMatch(/^How many bombs can hit you/);
    expect(lives.values).toEqual([expect.objectContaining({ kind: 'number', value: '3', label: 'set lives to', field: 'VALUE' })]);
    expect(lives.script).toBe('when game starts');
    expect(notes.find(p => p.title === 'Cannon speed')!.values.map(v => [v.label, v.value])).toEqual([['with arrow keys horizontal speed', '220'], ['vertical speed', '0']]);
    expect(notes.find(p => p.title === 'Alien march step')!.values.map(v => v.label)).toEqual(['set dx to']);
    expect(notes.find(p => p.title === 'Alien march timing')!.values.map(v => [v.label, v.value])).toEqual([['await wait (first number)', '0.1'], ['await wait (second number)', '0.025']]);
    expect(notes.find(p => p.title === 'Most bombs at once')!.values.map(v => [v.label, v.value])).toEqual([['bombs < 3', '3']]);
    expect(notes.find(p => p.title === 'Laser speed and direction')!.values.map(v => v.label)).toEqual(['change sprite y by']);
    // A note has no stack under it: the repeat's number, not the blocks inside it.
    expect(notes.find(p => p.title === 'Aliens in a row')!.values.map(v => v.value)).toEqual(['8']);
    // Numbers that already have a note are not spotted again.
    expect(pages.filter(p => p.source === 'spotted').map(p => p.title)).toEqual(['Game over message', 'Winning message']);
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
    expect([stepValue('3', 1), stepValue('220', 1), stepValue('-1200', -1), stepValue('-5', 1), stepValue('0', -1)]).toEqual(['4', '230', '-1300', '-4', '-1']);
    expect([stepValue('0.1', 1), stepValue('0.025', 1), stepValue('1.5', -1), stepValue('12.5', 1)]).toEqual(['0.11', '0.026', '1.4', '13.5']);
    expect(stepValue('abc', 1)).toBeNull();
  });
});
