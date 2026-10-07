import { describe, expect, it } from 'vitest';
import { isDrawCommand } from '../../src/runtime/protocol';

describe('drawing bridge', () => {
  const move = { type: 'move', x1: 0, y1: 0, x2: 100, y2: 0, draw: true, color: '#267c70' };
  it('accepts bounded drawing messages', () => { expect(isDrawCommand(move)).toBe(true); });
  it.each([NaN, Infinity, 1_000_001, '100'])('rejects invalid coordinates: %s', x2 => {
    expect(isDrawCommand({ ...move, x2 })).toBe(false);
  });
  it('rejects unrecognized commands and invalid colors', () => {
    expect(isDrawCommand({ type: 'eval', code: 'anything' })).toBe(false);
    expect(isDrawCommand({ ...move, color: 'url(example)' })).toBe(false);
  });
});
