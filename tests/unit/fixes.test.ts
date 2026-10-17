import { afterEach, describe, expect, it, vi } from 'vitest';
import { Blockly } from '../../src/blocks';
import { compile } from '../../src/language/compiler';
import { createWorkspace, prepareProject, restore } from '../../src/project';
import { fixFor, programToStart, type FixTools } from '../../src/guide/fixes';

/** Fix flows: a block's warning explained, with a one-tap action that clears it. */
const spaces: Blockly.Workspace[] = [];
afterEach(() => { for (const w of spaces.splice(0)) w.dispose(); });
const block = (type: string, id: string, fields: Record<string, string> = {}, inputs: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ type, id, fields, inputs, ...extra });
const value = (type: string, fields: Record<string, string>) => ({ block: { type, fields } });
function load(blocks: unknown[], scene?: unknown) {
  const w = createWorkspace(); spaces.push(w);
  restore(w, prepareProject(JSON.stringify({ format: 'python-blocks', formatVersion: 1, languageVersion: 19, workspace: { blocks: { languageVersion: 0, blocks }, ...(scene ? { pythonScene: scene } : {}) } })).project);
  return w;
}
const tools = (): FixTools => ({ openLibrary: vi.fn(), openSounds: vi.fn(), makeVariable: vi.fn(), openHandlers: vi.fn(), showOutput: vi.fn(), showRecipe: vi.fn() });
const diagnosticOn = (w: Blockly.Workspace, id: string, code: string) => compile(w).diagnostics.find(d => d.blockId === id && d.code === code) ?? null;
const codesOn = (w: Blockly.Workspace, id: string) => compile(w).diagnostics.filter(d => d.blockId === id).map(d => d.code);

describe('fix flows', () => {
  it('fills an empty number slot with 0', () => {
    const w = load([block('py_program', 'prog', {}, { BODY: { block: block('pen_move', 'mv') } }, { x: 40, y: 40 })]);
    const diagnostic = diagnosticOn(w, 'mv', 'missing-input')!;
    expect(diagnostic.input).toBe('STEPS');
    const flow = fixFor(w, w.getBlockById('mv')!, diagnostic, null, tools());
    expect(flow.title).toBe('This slot needs a value');
    expect(flow.steps[0].action?.label).toBe('Put a 0 here');
    flow.steps[0].action!.run();
    expect(codesOn(w, 'mv')).toEqual([]);
    expect(w.getBlockById('mv')!.getInputTargetBlock('STEPS')?.type).toBe('py_number');
  });

  it('fills a text slot with empty text', () => {
    const w = load([block('py_program', 'prog', {}, { BODY: { block: block('text_print', 'pr') } }, { x: 40, y: 40 })]);
    const flow = fixFor(w, w.getBlockById('pr')!, diagnosticOn(w, 'pr', 'missing-input'), null, tools());
    expect(flow.steps[0].action?.label).toBe('Put empty text here');
    flow.steps[0].action!.run();
    expect(codesOn(w, 'pr')).toEqual([]);
  });

  it('puts a loose draft under a new “when game starts” script', () => {
    const w = load([block('py_program', 'prog', {}, {}, { x: 40, y: 40 }), block('pen_move', 'mv', {}, { STEPS: value('py_number', { VALUE: '100' }) }, { x: 300, y: 200 })]);
    const diagnostic = diagnosticOn(w, 'mv', 'inactive-draft')!;
    expect(diagnostic.severity).toBe('warning');
    const flow = fixFor(w, w.getBlockById('mv')!, diagnostic, null, tools());
    expect(flow.steps[0].highlight).toEqual({ category: 'events' });
    flow.steps[0].action!.run();
    expect(codesOn(w, 'mv')).toEqual([]);
    const handler = w.getTopBlocks(false).find(b => b.type === 'py_handler')!;
    expect(handler.getInputTargetBlock('BODY')?.id).toBe('mv');
    expect(compile(w).source).toContain('events.on("start"');
  });

  it('moves Program into a start script when a block needs live input', () => {
    const w = load([block('py_program', 'prog', {}, { BODY: { block: block('text_print', 'pr', {}, { TEXT: { block: block('scene_key', 'key', { KEY: 'Space' }) } }) } }, { x: 40, y: 40 })]);
    const diagnostic = diagnosticOn(w, 'key', 'event-context')!;
    const flow = fixFor(w, w.getBlockById('key')!, diagnostic, null, tools());
    expect(flow.steps[0].action?.label).toBe('Move Program into “when game starts”');
    flow.steps[0].action!.run();
    expect(codesOn(w, 'key')).toEqual([]);
    expect(w.getTopBlocks(false).map(b => b.type)).toEqual(['py_handler']);
    expect(w.getBlockById('pr')!.getRootBlock().type).toBe('py_handler');
  });

  it('merges a second Program into the first', () => {
    const w = load([
      block('py_program', 'a', {}, { BODY: { block: block('pen_turn', 't', {}, { DEGREES: value('py_number', { VALUE: '90' }) }) } }, { x: 40, y: 40 }),
      block('py_program', 'b', {}, { BODY: { block: block('pen_move', 'm', {}, { STEPS: value('py_number', { VALUE: '10' }) }) } }, { x: 400, y: 40 }),
    ]);
    const flow = fixFor(w, w.getBlockById('b')!, diagnosticOn(w, 'b', 'multiple-programs'), null, tools());
    flow.steps[0].action!.run();
    expect(w.getTopBlocks(false).map(b => b.id)).toEqual(['a']);
    expect(w.getBlockById('t')!.getNextBlock()?.id).toBe('m');
    expect(compile(w).diagnostics).toEqual([]);
  });

  it('offers the library when no sprite exists, then a one-tap pick once one does', () => {
    const scene = { version: 1, background: '#ffffff', sprites: [] as unknown[], assets: [] };
    const w = load([block('py_program', 'prog', {}, { BODY: { block: block('scene_move', 'mv', {}, { SPRITE: { block: block('scene_sprite', 'ref', { SPRITE_ID: 'ghost' }) }, VALUE: value('py_number', { VALUE: '10' }) }) } }, { x: 40, y: 40 })], scene);
    const t = tools();
    let flow = fixFor(w, w.getBlockById('ref')!, diagnosticOn(w, 'ref', 'missing-sprite'), null, t);
    expect(flow.title).toBe('This sprite is gone');
    expect(flow.steps[0].action?.label).toBe('Open the Sprite library');
    flow.steps[0].action!.run(); expect(t.openLibrary).toHaveBeenCalledWith('costume');
    // The learner adds a sprite; the flow now offers to use it.
    const w2 = load([block('py_program', 'prog', {}, { BODY: { block: block('scene_move', 'mv', {}, { SPRITE: { block: block('scene_sprite', 'ref', { SPRITE_ID: 'ghost' }) }, VALUE: value('py_number', { VALUE: '10' }) }) } }, { x: 40, y: 40 })],
      { ...scene, sprites: [{ id: 'ball1', name: 'Ball 1', x: 0, y: 0, direction: 0, size: 100, layer: 0, visible: true, costume: 'ball' }] });
    flow = fixFor(w2, w2.getBlockById('ref')!, diagnosticOn(w2, 'ref', 'missing-sprite'), null, t);
    expect(flow.steps[0].action?.label).toBe('Use Ball 1 here');
    flow.steps[0].action!.run();
    expect(codesOn(w2, 'ref')).toEqual([]);
  });

  it('falls back to a built-in costume or backdrop in one tap', () => {
    const scene = { version: 1, background: '#ffffff', sprites: [{ id: 's', name: 'S', x: 0, y: 0, direction: 0, size: 100, layer: 0, visible: true, costume: 'bird' }], assets: [] };
    const w = load([block('py_program', 'prog', {}, { BODY: { block: block('scene_costume_set', 'set', {}, { SPRITE: { block: block('scene_sprite', 'ref', { SPRITE_ID: 's' }) }, COSTUME: { block: block('scene_costume', 'c', { COSTUME_ID: 'lost' }) } }) } }, { x: 40, y: 40 })], scene);
    const flow = fixFor(w, w.getBlockById('c')!, diagnosticOn(w, 'c', 'missing-costume'), null, tools());
    expect(flow.steps[0].action?.label).toBe('Use Bird here');
    flow.steps[0].action!.run();
    expect(codesOn(w, 'c')).toEqual([]);
  });

  it('removes a stray break and explains a runtime error with the matching idea', () => {
    const w = load([block('py_program', 'prog', {}, { BODY: { block: block('py_flow', 'brk', { FLOW: 'break' }) } }, { x: 40, y: 40 })]);
    const flow = fixFor(w, w.getBlockById('brk')!, diagnosticOn(w, 'brk', 'flow-outside-loop'), null, tools());
    expect(flow.steps[0].action?.label).toBe('Remove this block');
    flow.steps[0].action!.run();
    expect(w.getBlockById('brk')).toBeNull();
    const t = tools();
    const runtime = fixFor(w, w.getBlockById('prog')!, null, { message: "NameError: name 'score' is not defined", kind: 'name' }, t);
    expect(runtime.title).toBe('Python stopped at this block');
    expect(runtime.recipe?.id).toBe('fix-name-not-set');
    runtime.steps[0].action!.run(); expect(t.showRecipe).toHaveBeenCalledWith(runtime.recipe);
  });

  it('keeps programToStart harmless without a Program', () => {
    const w = load([]);
    programToStart(w);
    expect(w.getTopBlocks(false)).toEqual([]);
  });
});
