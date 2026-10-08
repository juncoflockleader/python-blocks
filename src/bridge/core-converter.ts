import { Blockly } from '../blocks';
import { allSymbols, createVariable, nameError } from '../language/functions';
import { child, children, identifier, literal, repeatName, unsupported, type ConversionDiagnostic } from './ast';
import { ConversionError } from './ast';
import type { AstNode, ParsedPython, TextSpan } from './parser-protocol';

export type BlockState = Blockly.serialization.blocks.State;
export interface PythonBlockSpan { blockId: string; span: TextSpan }
const binary: Record<string, string> = { Add: '+', Sub: '-', Mult: '*', Div: '/', FloorDiv: '//', Mod: '%', Pow: '**' };
const comparison: Record<string, string> = { Eq: 'EQ', NotEq: 'NEQ', Lt: 'LT', LtE: 'LTE', Gt: 'GT', GtE: 'GTE' };

/** Builds serialization in an isolated workspace. No field contains executable
 * source: each accepted AST node must have an ordinary editable block. */
export class CoreConverter {
  readonly sourceMap: PythonBlockSpan[] = [];
  readonly statements: { node: AstNode; state: BlockState }[] = [];
  private count = 0;
  constructor(readonly workspace: Blockly.Workspace) {}

  block(type: string, origin?: AstNode, fields?: BlockState['fields'], values: Record<string, BlockState | undefined> = {}, extraState?: unknown): BlockState {
    if (++this.count > 2000) throw new ConversionError({ code: 'limit', message: 'This Python program needs more than 2,000 blocks.', span: origin?.span });
    const id = crypto.randomUUID();
    if (origin?.span) this.sourceMap.push({ blockId: id, span: origin.span });
    return { type, id, ...(fields ? { fields } : {}), ...(Object.keys(values).length ? { inputs: Object.fromEntries(Object.entries(values).filter(([, state]) => state).map(([name, block]) => [name, { block }])) } : {}), ...(extraState === undefined ? {} : { extraState }) };
  }
  number(value: string, origin?: AstNode) { return this.block('py_number', origin, { VALUE: value }); }
  symbol(name: string, origin: AstNode) {
    const error = nameError(name); if (error) unsupported(origin, error);
    const existing = allSymbols(this.workspace).find(s => s.kind === 'project' && s.name === name);
    if (existing) return existing.id;
    try { return createVariable(this.workspace, name).getId(); }
    catch (error) { unsupported(origin, error instanceof Error ? error.message : String(error)); }
  }
  args(call: AstNode, counts: number[]): AstNode[] {
    const args = children(call, 'args');
    if (children(call, 'keywords').length || args.some(a => a.type === 'Starred')) unsupported(call, 'This block needs positional arguments without * or ** expansion.');
    if (!counts.includes(args.length)) unsupported(call, `This block needs ${counts.join(' or ')} positional argument${counts.length === 1 && counts[0] === 1 ? '' : 's'}.`);
    return args;
  }
  expression(value: AstNode): BlockState {
    const constant = literal(value);
    if (constant) {
      switch (constant.literalType) {
        case 'int': return this.number(constant.text, value);
        case 'float': return this.number(constant.text === 'inf' ? '1e999' : constant.text, value);
        case 'str': return this.block('text', value, { TEXT: constant.text });
        case 'bool': return this.block('logic_boolean', value, { BOOL: constant.value ? 'TRUE' : 'FALSE' });
        case 'none': return this.block('py_none', value);
        default: unsupported(value, `${constant.literalType} literals do not have a block yet.`);
      }
    }
    switch (value.type) {
      case 'Name': return this.block('py_get', value, { SYMBOL: this.symbol(identifier(value), value) });
      case 'BinOp': {
        const op = binary[child(value, 'op').type];
        if (!op) unsupported(value, 'This operator does not have a block yet.');
        return this.block('py_binary', value, { OP: op }, { A: this.expression(child(value, 'left')), B: this.expression(child(value, 'right')) });
      }
      case 'UnaryOp': {
        const op = child(value, 'op').type, operand = child(value, 'operand');
        if (op === 'Not') return this.block('py_not', value, undefined, { VALUE: this.expression(operand) });
        if (!['UAdd', 'USub'].includes(op)) unsupported(value, 'This unary operator does not have a block yet.');
        return this.block('py_unary', value, { OP: op === 'UAdd' ? '+' : '-' }, { VALUE: this.expression(operand) });
      }
      case 'BoolOp': {
        const values = children(value, 'values'), op = child(value, 'op').type;
        if (values.length < 2 || !['And', 'Or'].includes(op)) unsupported(value, 'This Boolean expression is incomplete.');
        return values.slice(1).reduce((left, right) => this.block('py_logic', value, { OP: op.toLowerCase() }, { A: left, B: this.expression(right) }), this.expression(values[0]));
      }
      case 'Compare': {
        const operators = children(value, 'ops'), right = children(value, 'comparators');
        if (operators.length !== 1 || right.length !== 1) unsupported(value, 'Chained comparisons need a dedicated block to evaluate each middle value only once.');
        const kind = operators[0].type, a = this.expression(child(value, 'left')), b = this.expression(right[0]);
        if (['In', 'NotIn'].includes(kind)) return this.block('py_contains', value, { OP: kind === 'In' ? 'in' : 'not in' }, { ITEM: a, COLLECTION: b });
        if (!comparison[kind]) unsupported(value, 'Identity comparisons (is / is not) do not have a block yet.');
        return this.block('logic_compare', value, { OP: comparison[kind] }, { A: a, B: b });
      }
      case 'List': {
        const items = children(value, 'elts');
        return this.block('lists_create_with', value, undefined, Object.fromEntries(items.map((item, index) => [`ADD${index}`, this.expression(item)])), { itemCount: items.length });
      }
      case 'Dict': {
        const keys = value.fields.keys;
        if (!Array.isArray(keys) || keys.some(key => key === null)) unsupported(value, 'Dictionary ** expansion does not have a block yet.');
        const keyNodes = children(value, 'keys'), values = children(value, 'values');
        if (keyNodes.length > 100) unsupported(value, 'A dictionary block supports at most 100 pairs.');
        if (keyNodes.length !== values.length) unsupported(value, 'This dictionary is incomplete.');
        return this.block('py_dict', value, undefined, Object.fromEntries(keyNodes.flatMap((key, index) => [[`KEY${index}`, this.expression(key)], [`VALUE${index}`, this.expression(values[index])]])), { itemCount: keyNodes.length });
      }
      case 'Subscript': return this.block('py_item_get', value, undefined, this.subscript(value));
      case 'Call': return this.call(value, false);
      default: unsupported(value, `${value.type} expressions do not have a supported block mapping yet.`);
    }
  }
  subscript(value: AstNode) {
    let key = child(value, 'slice');
    if (key.type === 'Index') key = child(key, 'value'); // Older parser fixtures.
    if (key.type === 'Slice') unsupported(key, 'Slicing does not have a block yet; use one key or index.');
    return { COLLECTION: this.expression(child(value, 'value')), KEY: this.expression(key) };
  }
  call(value: AstNode, statement: boolean): BlockState {
    const func = child(value, 'func');
    // Blockly's 3+ item text join first evaluates the complete item list, then
    // converts each item to text. Recognize only that exact generated pattern;
    // replacing it with chained additions would change evaluation order.
    if (!statement && func.type === 'Attribute' && func.fields.attr === 'join' && literal(child(func, 'value'))?.literalType === 'str' && (literal(child(func, 'value')) as { text: string }).text === '') {
      const [collection] = this.args(value, [1]);
      if (collection.type === 'ListComp') {
        const generators = children(collection, 'generators'), element = child(collection, 'elt');
        const iterator = generators[0];
        const args = element.type === 'Call' ? children(element, 'args') : [];
        if (generators.length === 1 && iterator.fields.is_async === 0 && !children(iterator, 'ifs').length && child(iterator, 'target').type === 'Name' && child(iterator, 'target').fields.id === 'x'
          && element.type === 'Call' && child(element, 'func').type === 'Name' && child(element, 'func').fields.id === 'str' && !children(element, 'keywords').length
          && args.length === 1 && args[0].type === 'Name' && args[0].fields.id === 'x' && child(iterator, 'iter').type === 'List') {
          const items = children(child(iterator, 'iter'), 'elts');
          if (items.length >= 3) return this.block('text_join', value, undefined, Object.fromEntries(items.map((item, index) => [`ADD${index}`, this.expression(item)])), { itemCount: items.length });
        }
      }
    }
    if (func.type === 'Name') {
      const name = identifier(func);
      if (statement && name === 'print') {
        const [arg] = this.args(value, [1]); return this.block('text_print', value, undefined, { TEXT: this.expression(arg) });
      }
      if (!statement && ['int', 'float', 'str', 'bool', 'len'].includes(name)) {
        const [arg] = this.args(value, [1]);
        return this.block(name === 'len' ? 'py_length' : 'py_convert', value, name === 'len' ? undefined : { TYPE: name }, { VALUE: this.expression(arg) });
      }
    }
    if (func.type === 'Attribute') {
      const receiver = child(func, 'value'), method = func.fields.attr;
      if (!statement && receiver.type === 'Name' && receiver.fields.id === 'random' && method === 'randint') {
        const [a, b] = this.args(value, [2]);
        return this.block('math_random_int', value, undefined, { FROM: this.expression(a), TO: this.expression(b) });
      }
      if (statement && method === 'append') {
        const [arg] = this.args(value, [1]);
        return this.block('py_list_append', value, undefined, { LIST: this.expression(receiver), VALUE: this.expression(arg) });
      }
      if (!statement && method === 'get') {
        const [key, fallback] = this.args(value, [2]);
        return this.block('py_dict_get', value, undefined, { DICT: this.expression(receiver), KEY: this.expression(key), DEFAULT: this.expression(fallback) });
      }
      if (!statement && ['copy', 'keys'].includes(String(method))) {
        this.args(value, [0]);
        return this.block(method === 'copy' ? 'py_shallow_copy' : 'py_dict_keys', value, undefined, { [method === 'copy' ? 'VALUE' : 'DICT']: this.expression(receiver) });
      }
    }
    unsupported(value, statement ? 'This call does not have a supported statement block yet.' : 'This call does not have a supported value block yet.');
  }
  body(values: AstNode[]): BlockState | undefined {
    let first: BlockState | undefined, previous: BlockState | undefined;
    for (const value of values) {
      const block = this.statement(value);
      if (!block) continue;
      if (previous && ['py_flow', 'py_return', 'py_return_value'].includes(previous.type)) unsupported(value, 'Move this statement before return/break/continue or remove it. The terminating block has no following connection.');
      this.statements.push({ node: value, state: block });
      if (previous) previous.next = { block }; else first = block;
      previous = block;
    }
    return first;
  }
  statement(value: AstNode): BlockState | undefined {
    switch (value.type) {
      case 'Pass': return undefined;
      case 'Import': {
        const imports = children(value, 'names');
        if (imports.length === 1 && imports[0].fields.name === 'random' && imports[0].fields.asname === null) return undefined;
        unsupported(value, 'Only the existing library imports can be converted to blocks.');
      }
      case 'Assign': {
        const targets = children(value, 'targets');
        if (targets.length !== 1) unsupported(value, 'Multiple assignment targets need a dedicated block to preserve shared values.');
        const target = targets[0], expression = this.expression(child(value, 'value'));
        if (target.type === 'Name') return this.block('py_set', value, { SYMBOL: this.symbol(identifier(target), target) }, { VALUE: expression });
        if (target.type === 'Subscript') return this.block('py_item_set', value, undefined, { ...this.subscript(target), VALUE: expression });
        unsupported(target, 'Use a single variable name or collection item as the assignment target.');
      }
      case 'AugAssign': unsupported(value, 'Augmented assignment needs a dedicated block to preserve in-place changes to shared objects.');
      case 'Delete': {
        const targets = children(value, 'targets');
        if (targets.length !== 1 || targets[0].type !== 'Subscript') unsupported(value, 'The delete block accepts one collection item.');
        return this.block('py_item_delete', value, undefined, this.subscript(targets[0]));
      }
      case 'Expr': {
        const expression = child(value, 'value');
        if (expression.type !== 'Call') unsupported(value, 'This expression has no statement block. Assign its result to a variable to use a value block.');
        return this.call(expression, true);
      }
      case 'If': {
        // Preserve nested else/if as nested blocks. Both sides then have exactly
        // the same AST; no branch flattening or truthiness coercion is needed.
        const otherwise = children(value, 'orelse');
        return this.block('controls_if', value, undefined, { IF0: this.expression(child(value, 'test')), DO0: this.body(children(value, 'body')), ...(otherwise.length ? { ELSE: this.body(otherwise) } : {}) }, { elseIfCount: 0, hasElse: otherwise.length > 0 });
      }
      case 'While': {
        if (children(value, 'orelse').length) unsupported(value, 'A while/else loop does not have a block yet.');
        return this.block('controls_whileUntil', value, { MODE: 'WHILE' }, { BOOL: this.expression(child(value, 'test')), DO: this.body(children(value, 'body')) });
      }
      case 'For': {
        if (children(value, 'orelse').length) unsupported(value, 'A for/else loop does not have a block yet.');
        const target = child(value, 'target'), name = identifier(target), iterable = child(value, 'iter');
        const range = iterable.type === 'Call' && child(iterable, 'func').type === 'Name' && child(iterable, 'func').fields.id === 'range';
        if (range) {
          const args = this.args(iterable, [1, 2, 3]);
          if (repeatName(name)) {
            if (args.length !== 1) unsupported(target, 'A generated repeat counter needs the one-argument repeat pattern.');
            return this.block('controls_repeat_ext', value, undefined, { TIMES: this.expression(args[0]), DO: this.body(children(value, 'body')) });
          }
          return this.block('py_scoped_range', value, { SYMBOL: this.symbol(name, target) }, {
            START: args.length === 1 ? this.number('0') : this.expression(args[0]),
            STOP: this.expression(args.length === 1 ? args[0] : args[1]),
            STEP: args.length === 3 ? this.expression(args[2]) : this.number('1'), DO: this.body(children(value, 'body')),
          });
        }
        return this.block('py_for_each', value, { SYMBOL: this.symbol(name, target) }, { ITERABLE: this.expression(iterable), DO: this.body(children(value, 'body')) });
      }
      case 'Break': case 'Continue': return this.block('py_flow', value, { FLOW: value.type.toLowerCase() });
      default: unsupported(value, `${value.type} statements do not have a supported block mapping yet.`);
    }
  }
  attachComments(parsed: ParsedPython) {
    // Attach same-line trailing comments to the narrowest complete statement.
    // All comments, including those inside expressions, remain in exact source.
    for (const comment of parsed.comments) {
      const matches = this.statements.filter(({ node }) => node.span && node.span.end.line === comment.span.start.line && node.span.end.offset <= comment.span.start.offset);
      const match = matches.sort((a, b) => (b.node.span!.start.offset - a.node.span!.start.offset))[0];
      if (match) match.state.icons = { ...match.state.icons, comment: { text: comment.text.replace(/^# ?/, ''), pinned: false, width: 220, height: 100 } };
    }
  }
}

export function converterDiagnostic(error: unknown): ConversionDiagnostic {
  return error instanceof ConversionError ? error.diagnostic : { code: 'conversion', message: error instanceof Error ? error.message : String(error) };
}
