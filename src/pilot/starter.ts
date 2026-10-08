import { Blockly } from '../blocks';
import { createVariable } from '../language/functions';
import { createWorkspace, snapshot } from '../project';

export function scoreStarter() {
  const w = createWorkspace();
  try {
    const variable = createVariable(w, 'score');
    const block = (type: string, fields: Record<string, string> = {}) => {
      const b = w.newBlock(type); for (const [key, value] of Object.entries(fields)) b.setFieldValue(value, key); return b;
    };
    const plug = (parent: Blockly.Block, name: string, child: Blockly.Block) => {
      parent.getInput(name)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent;
    };
    const number = (value: string) => block('py_number', { VALUE: value });
    const read = () => block('variables_get', { VAR: variable.getId() });
    const start = plug(block('variables_set', { VAR: variable.getId() }), 'VALUE', number('0'));
    const loop = plug(block('controls_repeat_ext'), 'TIMES', number('3'));
    const add = plug(plug(block('py_binary', { OP: '+' }), 'A', read()), 'B', number('2'));
    const increment = plug(block('variables_set', { VAR: variable.getId() }), 'VALUE', add);
    increment.nextConnection!.connect(plug(block('text_print'), 'TEXT', read()).previousConnection!);
    plug(loop, 'DO', increment); start.nextConnection!.connect(loop.previousConnection!);
    plug(block('py_program'), 'BODY', start).moveBy(48, 48);
    return snapshot(w);
  } finally { w.dispose(); }
}
