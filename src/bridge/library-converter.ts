import { Blockly } from '../blocks';
import { backdrops, costumes, type SceneState } from '../scene/model';
import { sceneState } from '../scene/state';
import { child, children, identifier, literal, unsupported } from './ast';
import type { AstNode } from './parser-protocol';
import type { BlockState, CoreConverter } from './core-converter';
import { libraryCalls, libraryProperties, type LibraryTarget } from './library-catalog';

const hosts = new Set(['pen', 'events', 'random', '_pb_scene', '_pb_sprites', '_pb_inputs', '_pb_game', '_pb_sounds']);
const scalar = (node: AstNode): string | boolean | null | undefined => {
  const value = literal(node);
  return value?.literalType === 'str' ? value.text : value?.literalType === 'bool' ? value.value : value?.literalType === 'none' ? null : undefined;
};
const targetMatches = (target: LibraryTarget, receiver: AstNode) => target === 'sprite' ? !(receiver.type === 'Name' && hosts.has(identifier(receiver))) : receiver.type === 'Name' && identifier(receiver) === target;

export class LibraryConverter {
  private scene: SceneState;
  private choices = new Map<string, Set<string>>();
  constructor(private readonly converter: CoreConverter) { this.scene = sceneState(converter.workspace); }
  choice(type: string, name: string, value: string) {
    const key = type + ':' + name;
    if (!this.choices.has(key)) {
      const block = this.converter.workspace.newBlock(type);
      try {
        const field = block.getField(name);
        this.choices.set(key, new Set(field instanceof Blockly.FieldDropdown ? field.getOptions(false).map(option => option[1]) : []));
      } finally { block.dispose(false); }
    }
    return this.choices.get(key)!.has(value);
  }
  input(name: string, value: AstNode): BlockState {
    const type = { COSTUME: 'scene_costume', BACKDROP: 'scene_backdrop', WORLD: 'scene_world', SOUND: 'sound_asset' }[name];
    const reference = scalar(value);
    if (type && (typeof reference === 'string' || reference === null && ['WORLD', 'BACKDROP'].includes(name))) {
      const options = name === 'COSTUME' ? costumes(this.scene) : name === 'BACKDROP' ? backdrops(this.scene) : name === 'WORLD' ? this.scene.worlds ?? [] : this.scene.sounds ?? [];
      if (reference !== null && !options.some(item => item.id === reference)) unsupported(value, `Choose an existing ${name.toLowerCase()} ID from the captured project.`);
      return this.converter.block(type, value, { [name === 'SOUND' ? 'SOUND_ID' : name + '_ID']: reference ?? '' });
    }
    if (name === 'FRAMES' && value.type === 'List') {
      const frames = children(value, 'elts');
      return this.converter.block('lists_create_with', value, undefined, Object.fromEntries(frames.map((frame, index) => [`ADD${index}`, this.input('COSTUME', frame)])), { itemCount: frames.length });
    }
    return this.converter.expression(value);
  }
  call(value: AstNode, statement: boolean, awaited = false): BlockState | undefined {
    const fn = child(value, 'func');
    if (fn.type !== 'Attribute') return;
    const receiver = child(fn, 'value'), method = fn.fields.attr;
    if (receiver.type === 'Name' && receiver.fields.id === '_pb_sprites' && method === 'named') {
      if (statement || awaited) unsupported(value, 'The named sprite block is a value and is not awaited.');
      const [name] = this.converter.args(value, [1]), text = scalar(name);
      const sprite = this.scene.sprites.find(sprite => sprite.name === text);
      if (!sprite) unsupported(name, 'Choose the exact name of an authored sprite in the captured project.');
      return this.converter.block('scene_sprite', value, { SPRITE_ID: sprite.id });
    }
    const methods = libraryCalls.filter(rule => rule.method === method && targetMatches(rule.target, receiver));
    if (!methods.length) return;
    const kind = methods.filter(rule => !!rule.value === !statement && !!rule.await === awaited);
    if (!kind.length) unsupported(value, methods.some(rule => rule.await) && !awaited ? 'This timed operation needs await and an async function or handler.' : 'Use this operation in its supported statement/value form with the matching await behavior.');
    const args = this.converter.args(value, [...new Set(kind.map(rule => rule.args.length))]);
    for (const rule of kind.filter(rule => rule.args.length === args.length)) {
      const fields = { ...rule.fields }; let valid = true;
      rule.args.forEach((argument, index) => {
        if ('input' in argument) return;
        const value = scalar(args[index]);
        if ('fixed' in argument) { if (value !== argument.fixed) valid = false; }
        else if (argument.boolean) { if (typeof value !== 'boolean') valid = false; else fields[argument.field] = value ? 'TRUE' : 'FALSE'; }
        else if (typeof value !== 'string' || !this.choice(rule.type, argument.field, value)) valid = false;
        else fields[argument.field] = value;
      });
      if (!valid) continue;
      const inputs: Record<string, BlockState> = rule.target === 'sprite' ? { SPRITE: this.converter.expression(receiver) } : {};
      rule.args.forEach((argument, index) => { if ('input' in argument) inputs[argument.input] = this.input(argument.input, args[index]); });
      return this.converter.block(rule.type, value, fields, inputs);
    }
    unsupported(value, 'This operation needs the literal property, mode or Boolean choices offered by its block. Dynamic dropdown arguments are not supported.');
  }
  expression(value: AstNode): BlockState | undefined {
    if (value.type === 'Subscript') {
      const dictionary = child(value, 'value');
      if (dictionary.type === 'Attribute' && dictionary.fields.attr === 'data' && targetMatches('sprite', child(dictionary, 'value'))) return this.converter.block('scene_data_get', value, undefined, { SPRITE: this.converter.expression(child(dictionary, 'value')), KEY: this.converter.expression(child(value, 'slice')) });
    }
    if (value.type !== 'Attribute') return;
    const receiver = child(value, 'value'), property = value.fields.attr;
    for (const rule of libraryProperties) {
      if (!targetMatches(rule.target, receiver) || typeof property !== 'string') continue;
      if (rule.field ? !this.choice(rule.type, rule.field, property) : rule.property !== property) continue;
      return this.converter.block(rule.type, value, rule.field ? { [rule.field]: property } : undefined, rule.target === 'sprite' ? { SPRITE: this.converter.expression(receiver) } : {});
    }
  }
  statement(value: AstNode): BlockState | undefined {
    if (value.type !== 'Assign') return;
    const targets = children(value, 'targets'); if (targets.length !== 1 || targets[0].type !== 'Subscript') return;
    const target = targets[0], dictionary = child(target, 'value');
    if (dictionary.type === 'Attribute' && dictionary.fields.attr === 'data' && targetMatches('sprite', child(dictionary, 'value'))) return this.converter.block('scene_data_set', value, undefined, { SPRITE: this.converter.expression(child(dictionary, 'value')), KEY: this.converter.expression(child(target, 'slice')), VALUE: this.converter.expression(child(value, 'value')) });
  }
  import(value: AstNode) {
    if (value.type !== 'ImportFrom' || value.fields.level !== 0 || value.fields.module !== 'playground') return false;
    const names = children(value, 'names');
    if (names.length !== 1) return false;
    const { name, asname } = names[0].fields;
    return name === 'pen' && asname === null || ['sprites', 'scene', 'inputs', 'game', 'sounds'].includes(String(name)) && asname === '_pb_' + name;
  }
}
