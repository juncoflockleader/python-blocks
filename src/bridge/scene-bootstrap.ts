import type { AstNode, AstValue } from './parser-protocol';
const node = (value: AstValue | undefined): value is AstNode => !!value && typeof value === 'object' && 'type' in value;
const call = (statement: AstNode | undefined, method: string, argument?: string) => {
  if (statement?.type !== 'Expr' || !node(statement.fields.value)) return false;
  const expression = statement.fields.value, fn = expression.fields.func, args = expression.fields.args;
  if (expression.type !== 'Call' || !node(fn) || fn.type !== 'Attribute' || fn.fields.attr !== method || !node(fn.fields.value) || fn.fields.value.type !== 'Name' || fn.fields.value.fields.id !== '_pb_scene' || !Array.isArray(args) || !Array.isArray(expression.fields.keywords) || expression.fields.keywords.length) return false;
  if (argument === undefined) return args.length === 0;
  if (args.length !== 1 || !node(args[0]) || args[0].type !== 'Constant') return false;
  const value = args[0].fields.value;
  return !!value && typeof value === 'object' && 'literalType' in value && value.literalType === 'str' && value.text === argument;
};
/** Recognize only the compiler's exact managed prelude. It stays in semantic
 * comparison and exported source; it is not an arbitrary callable code block. */
export function scenePreludeLength(body: AstNode[]) {
  const first = body[0], names = first?.fields.names;
  if (first?.type !== 'ImportFrom' || first.fields.module !== 'playground' || first.fields.level !== 0 || !Array.isArray(names) || names.length !== 1 || !node(names[0]) || names[0].fields.name !== 'scene' || names[0].fields.asname !== '_pb_scene' || !call(body[1], 'load', 'scene.json')) return 0;
  return call(body[2], 'enable_motion') ? 3 : 2;
}
export function withoutScenePrelude(tree: AstNode) {
  const body = (tree.fields.body as AstNode[]).filter(n => n.type !== 'Pass');
  return { ...tree, fields: { ...tree.fields, body: body.slice(scenePreludeLength(body)) } };
}
