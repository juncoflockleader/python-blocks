import type { AstNode, AstValue, PythonLiteral, TextSpan } from './parser-protocol';
import { scenePreludeLength } from './scene-bootstrap';

export interface ConversionDiagnostic { code: string; message: string; span?: TextSpan; blockId?: string }
export class ConversionError extends Error {
  constructor(readonly diagnostic: ConversionDiagnostic) { super(diagnostic.message); }
}
export function unsupported(node: AstNode, message: string): never {
  throw new ConversionError({ code: 'unsupported', message, span: node.span });
}
export function isNode(value: AstValue | undefined): value is AstNode {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'type' in value && 'fields' in value;
}
export function node(value: AstValue | undefined): AstNode {
  if (!isNode(value)) throw new ConversionError({ code: 'invalid-tree', message: 'The parser returned an incomplete Python tree.' });
  return value;
}
export const child = (parent: AstNode, field: string) => node(parent.fields[field]);
export function children(parent: AstNode, field: string): AstNode[] {
  const value = parent.fields[field];
  if (!Array.isArray(value)) throw new ConversionError({ code: 'invalid-tree', message: `The parser omitted ${field}.`, span: parent.span });
  return value.map(node);
}
export function identifier(value: AstNode) {
  if (value.type !== 'Name' || typeof value.fields.id !== 'string') unsupported(value, 'This position needs a variable name.');
  return value.fields.id as string;
}
export function literal(value: AstNode): PythonLiteral | undefined {
  const constant = value.fields.value;
  return value.type === 'Constant' && constant && typeof constant === 'object' && 'literalType' in constant ? constant as PythonLiteral : undefined;
}
const integer = (text: string): AstNode => ({ type: 'Constant', fields: { value: { literalType: 'int', text }, kind: null } });
export const repeatName = (name: string) => /^_pb_repeat\d*$/.test(name);
export const functionNode = (node: AstNode) => ['FunctionDef', 'AsyncFunctionDef'].includes(node.type);
export function walk(node: AstNode, visit: (node: AstNode) => boolean | void) {
  if (visit(node) === false) return;
  for (const value of Object.values(node.fields)) {
    if (isNode(value)) walk(value, visit);
    else if (Array.isArray(value)) for (const item of value) if (isNode(item)) walk(item, visit);
  }
}

// A global declaration is compile-time scope metadata, even inside an if.
// Keep exactly the globally assigned names; never erase an assigned global.
function functionFields(value: AstNode) {
  const globals = new Set<string>(), assigned = new Set<string>();
  for (const statement of children(value, 'body')) walk(statement, n => {
    if (functionNode(n) || n.type === 'Lambda') return false;
    if (n.type === 'Global') for (const name of n.fields.names as string[]) globals.add(name);
    if (n.type === 'Name' && child(n, 'ctx').type === 'Store') assigned.add(identifier(n));
  });
  const remove = (n: AstNode): AstNode => ({ ...n, fields: Object.fromEntries(Object.entries(n.fields).map(([key, v]) =>
    [key, Array.isArray(v) ? v.filter(x => !isNode(x) || x.type !== 'Global').map(x => isNode(x) ? remove(x) : x) : isNode(v) ? remove(v) : v])) });
  const body = children(value, 'body').filter(n => n.type !== 'Global').map(remove);
  const names = [...globals].filter(name => assigned.has(name)).sort();
  return { ...value.fields, body: [...(names.length ? [{ type: 'Global', fields: { names } }] : []), ...body] };
}

/** This is deliberately not an optimizer. Only ignore source locations and
 * comments, no-op pass statements, literal spelling, Boolean grouping of the
 * same operator and implicit range defaults. No executable statement moves. */
export function semanticTree(value: AstValue): unknown {
  if (Array.isArray(value)) return value.map(semanticTree);
  if (!isNode(value)) return value;
  const fields: Record<string, AstValue> = functionNode(value) ? functionFields(value) : { ...value.fields };
  if (value.type === 'Constant') delete fields.kind; // u"text" has the same value.
  if (value.type === 'Module') delete fields.type_ignores;
  for (const key of ['body', 'orelse', 'finalbody']) if (Array.isArray(fields[key])) fields[key] = fields[key].filter(n => !isNode(n) || n.type !== 'Pass');
  if (value.type === 'Module') {
    const all = fields.body as AstNode[], prelude = all.slice(0, scenePreludeLength(all)), body = all.slice(prelude.length);
    const firstAction = body.findIndex(n => !functionNode(n) && !['Import', 'ImportFrom'].includes(n.type));
    const prefix = body.slice(0, firstAction < 0 ? body.length : firstAction);
    // The converter permits only plain, unique, annotation/default/decorator-
    // free functions in this initial region. Creating these bindings cannot run
    // learner code. Import order and every startup statement remain unchanged.
    fields.body = [...prelude, ...prefix.filter(n => !functionNode(n)), ...prefix.filter(functionNode).sort((a, b) => String(a.fields.name).localeCompare(String(b.fields.name))), ...body.slice(prefix.length)];
  }
  if (value.type === 'BoolOp') {
    const op = child(value, 'op').type;
    const flatten = (n: AstNode): AstNode[] => n.type === 'BoolOp' && child(n, 'op').type === op ? children(n, 'values').flatMap(flatten) : [n];
    fields.values = children(value, 'values').flatMap(flatten);
  }
  if (value.type === 'Call' && isNode(fields.func) && fields.func.type === 'Name' && fields.func.fields.id === 'range' && Array.isArray(fields.args) && Array.isArray(fields.keywords) && !fields.keywords.length) {
    const args = fields.args;
    if (args.length === 1) fields.args = [integer('0'), args[0], integer('1')];
    if (args.length === 2) fields.args = [...args, integer('1')];
  }
  // The converter separately rejects every read or reassignment of generated
  // repeat counters. Their distinct spellings cannot affect learner results.
  if (value.type === 'For' && isNode(fields.target) && fields.target.type === 'Name' && typeof fields.target.fields.id === 'string' && repeatName(fields.target.fields.id)) {
    fields.target = { ...fields.target, fields: { ...fields.target.fields, id: '_pb_repeat' } };
  }
  return { type: value.type, fields: Object.fromEntries(Object.keys(fields).sort().map(key => [key, semanticTree(fields[key])])) };
}
export const sameSemantics = (a: AstNode, b: AstNode) => JSON.stringify(semanticTree(a)) === JSON.stringify(semanticTree(b));

export function firstDifference(a: AstNode, b: AstNode): AstNode {
  if (sameSemantics(a, b)) return a;
  for (const key of Object.keys(a.fields)) {
    const x = a.fields[key], y = b.fields[key];
    if (isNode(x) && isNode(y) && !sameSemantics(x, y)) return firstDifference(x, y);
    if (Array.isArray(x) && Array.isArray(y)) for (let index = 0; index < x.length; index++) {
      const left = x[index], right = y[index];
      if (isNode(left) && isNode(right) && !sameSemantics(left, right)) return firstDifference(left, right);
      if (isNode(left) && !right) return left;
    }
  }
  return a;
}
