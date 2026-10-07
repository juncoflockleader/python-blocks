import { afterEach, describe, expect, it } from 'vitest';
import { Blockly, generatePython, squareProject } from '../../src/blocks';

const workspaces: Blockly.Workspace[] = [];
function workspace() { const value = new Blockly.Workspace(); workspaces.push(value); return value; }
afterEach(() => workspaces.splice(0).forEach(value => value.dispose()));

describe('blocks to Python', () => {
  it('generates the starter loop with one pen import', () => {
    const ws = workspace();
    Blockly.serialization.workspaces.load(squareProject, ws);
    const code = generatePython(ws);
    expect(code.match(/from playground import pen/g)).toHaveLength(1);
    expect(code).toContain('range(4)');
    expect(code).toMatch(/\n +pen.move\(100\)/);
    expect(code).toMatch(/\n +pen.turn\(90\)/);
    expect(generatePython(ws)).toBe(code);
  });

  it('reflects a learner edit in the Python', () => {
    const ws = workspace();
    Blockly.serialization.workspaces.load(squareProject, ws);
    const movement = ws.getAllBlocks(false).find(block => block.type === 'pen_move')!;
    movement.getInputTargetBlock('STEPS')!.setFieldValue('60', 'VALUE');
    expect(generatePython(ws)).toContain('pen.move(60)');
    expect(generatePython(ws)).not.toContain('pen.move(100)');
  });

  it('escapes quotes and newlines in text instead of producing extra statements', () => {
    const ws = workspace();
    const print = ws.newBlock('text_print');
    const text = ws.newBlock('text');
    text.setFieldValue("Hello 'Python'\npen.move(999)", 'TEXT');
    print.getInput('TEXT')!.connection!.connect(text.outputConnection!);
    const root = ws.newBlock('py_program');
    root.getInput('BODY')!.connection!.connect(print.previousConnection!);
    const code = generatePython(ws);
    expect(code.trim().split('\n')).toHaveLength(1);
    expect(code).toContain('\\n');
    expect(code.trim()).toMatch(/^print\(/);
  });
});
