import limits from './parser-limits.json';

export { limits as parserLimits };
export interface SourcePoint { line: number; column: number; offset: number }
export interface TextSpan { start: SourcePoint; end: SourcePoint }
export type PythonLiteral =
  | { literalType: 'none' | 'ellipsis' }
  | { literalType: 'bool'; value: boolean }
  | { literalType: 'int' | 'float' | 'str' | 'bytes'; text: string }
  | { literalType: 'complex'; real: string; imag: string };
export type AstValue = AstNode | PythonLiteral | AstValue[] | string | number | boolean | null;
export interface AstNode { type: string; fields: Record<string, AstValue>; span?: TextSpan }
export interface PythonComment { text: string; span: TextSpan }
export interface ParseDiagnostic { code: 'syntax' | 'limit' | 'invalid-source'; message: string; span?: TextSpan }
interface ParseEnvelope { version: 1; pythonVersion: string }
export interface ParsedPython extends ParseEnvelope { ok: true; tree: AstNode; comments: PythonComment[]; nodeCount: number; sourceBytes: number }
export interface RejectedPython extends ParseEnvelope { ok: false; diagnostics: ParseDiagnostic[] }
export type ParseResult = ParsedPython | RejectedPython;
export interface ParseCommand { type: 'parse'; id: number; source: string }
export type ParserEvent = { type: 'ready' } | { type: 'result'; id: number; result: ParseResult } | { type: 'error'; message: string };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const whole = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
export function validSpan(value: unknown, sourceLength: number): value is TextSpan {
  if (!record(value)) return false;
  const point = (p: unknown): p is SourcePoint => record(p) && whole(p.line, 1, limits.sourceLines) && whole(p.column, 0, sourceLength) && whole(p.offset, 0, sourceLength);
  return point(value.start) && point(value.end) && value.start.offset <= value.end.offset && value.start.line <= value.end.line;
}

/** The parser is a separate asynchronous boundary; reject incompatible results
 * before a converter can act on them. Positions always refer to this request. */
export function validParseResult(value: unknown, sourceLength: number): value is ParseResult {
  if (!record(value) || value.version !== 1 || typeof value.pythonVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.pythonVersion)) return false;
  if (value.ok === false) return Array.isArray(value.diagnostics) && value.diagnostics.length > 0 && value.diagnostics.length <= 100 && value.diagnostics.every(d => record(d) && ['syntax','limit','invalid-source'].includes(String(d.code)) && typeof d.message === 'string' && (d.span === undefined || validSpan(d.span, sourceLength)));
  if (value.ok !== true || !record(value.tree) || value.tree.type !== 'Module' || !whole(value.nodeCount, 1, limits.nodes) || !whole(value.sourceBytes, 0, limits.sourceBytes)
    || !Array.isArray(value.comments) || value.comments.length > limits.comments || !value.comments.every(c => record(c) && typeof c.text === 'string' && validSpan(c.span, sourceLength))) return false;
  let count = 0;
  const pending: { value: unknown; depth: number }[] = [{value:value.tree,depth:0}];
  while (pending.length) {
    const { value: part, depth } = pending.pop()!;
    if (part === null || typeof part === 'string' || typeof part === 'boolean' || (typeof part === 'number' && Number.isFinite(part))) continue;
    if (Array.isArray(part)) { pending.push(...part.map(value => ({value,depth}))); continue; }
    if (!record(part)) return false;
    if ('literalType' in part) {
      if (part.literalType === 'none' || part.literalType === 'ellipsis') continue;
      if (part.literalType === 'bool' && typeof part.value === 'boolean') continue;
      if (['int','float','str','bytes'].includes(String(part.literalType)) && typeof part.text === 'string') continue;
      if (part.literalType === 'complex' && typeof part.real === 'string' && typeof part.imag === 'string') continue;
      return false;
    }
    if (depth > limits.depth || typeof part.type !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(part.type) || !record(part.fields) || (part.span !== undefined && !validSpan(part.span, sourceLength)) || ++count > limits.nodes) return false;
    pending.push(...Object.values(part.fields).map(value => ({value,depth:depth+1})));
  }
  return count === value.nodeCount;
}
