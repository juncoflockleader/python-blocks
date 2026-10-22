import { describe, expect, it } from 'vitest';
import { matchingBlocks } from '../../src/ui/block-search';
const entries = [
  {category:'Motion',label:'Glide Friend',description:'',terms:'Motion glide Friend'},
  {category:'Functions',label:'café_count',description:'',terms:'Functions café_count Count characters'},
];
describe('block search matching', () => {
  it('requires all words, ignores case and accents, and accepts partial names', () => {
    expect(matchingBlocks(entries,'FRI GLI')).toEqual([entries[0]]);
    expect(matchingBlocks(entries,'cafe count')).toEqual([entries[1]]);
    expect(matchingBlocks(entries,'motion count')).toEqual([]);
    expect(matchingBlocks(entries,'   ')).toEqual([]);
  });
  it('puts the block named just the words first, then blocks whose name has them, in palette order', () => {
    const sprites = [
      { category: 'Motion', label: 'move sprite Fox by 10 steps', description: '', terms: 'Motion move sprite Fox', keyword: 'move' },
      { category: 'Game', label: 'this sprite', description: 'The sprite running this script', terms: 'Game this sprite', keyword: 'this sprite' },
      { category: 'Game', label: 'sprite Fox', description: 'A sprite', terms: 'Game sprite Fox', keyword: 'a sprite' },
      { category: 'Motion', label: 'glide Fox', description: 'Glide a sprite', terms: 'Motion glide Fox sprite', keyword: 'glide' },
    ];
    expect(matchingBlocks(sprites, 'Sprite').map(e => e.label)).toEqual(['sprite Fox', 'this sprite', 'move sprite Fox by 10 steps', 'glide Fox']);
  });
  it('treats punctuation literally, without regex interpretation', () => {
    expect(matchingBlocks(entries,'.*')).toEqual([]);
    expect(matchingBlocks(entries,'[')).toEqual([]);
  });
});
