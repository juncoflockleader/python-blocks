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
  it('treats punctuation literally, without regex interpretation', () => {
    expect(matchingBlocks(entries,'.*')).toEqual([]);
    expect(matchingBlocks(entries,'[')).toEqual([]);
  });
});
