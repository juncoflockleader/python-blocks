import { Blockly } from '../blocks';
import { compile, type Compilation } from '../language/compiler';
import { isScopedDefinition } from '../language/functions';
import { loadWorkspace, preserveEditingState } from '../language/serialization';
import { createWorkspace, prepareProject, snapshot, type Project } from '../project';
import { children, firstDifference, functionNode, sameSemantics, type ConversionDiagnostic } from './ast';
import { converterDiagnostic, type PythonBlockSpan } from './core-converter';
import { LanguageConverter, previousFunctions } from './language-converter';
import { preserveDisabledDrafts, reconcileBlocks, refreshPreservedCalls } from './reconcile';
import { validParseResult, type AstNode, type ParseResult } from './parser-protocol';

export type ParsePython = (source: string, signal?: AbortSignal) => Promise<ParseResult>;
export interface ConvertedPython {
  ok: true;
  source: string;
  project: Project;
  compilation: Compilation;
  sourceMap: PythonBlockSpan[];
  unchanged: boolean;
}
export interface RejectedConversion { ok: false; source: string; diagnostics: ConversionDiagnostic[] }
export type ConversionResult = ConvertedPython | RejectedConversion;
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Python conversion was cancelled.', 'AbortError'); };

function isolated<T>(action: () => T): T {
  Blockly.Events.disable();
  try { return preserveEditingState(action); }
  finally { Blockly.Events.enable(); }
}

/** Never receives or mutates the live workspace. Capture before the first
 * asynchronous operation; the controller must still check its base revision
 * before installing this candidate. Parser/abort failures remain rejections. */
export async function convertPython(source: string, base: Project, parse: ParsePython, signal?: AbortSignal): Promise<ConversionResult> {
  cancelled(signal);
  const captured = structuredClone(base);
  const parsed = await parse(source, signal);
  cancelled(signal);
  if (!validParseResult(parsed, source.length)) return { ok: false, source, diagnostics: [{ code: 'invalid-tree', message: 'The parser returned an invalid result.' }] };
  if (!parsed.ok) return { ok: false, source, diagnostics: parsed.diagnostics };
  const workspace = isolated(createWorkspace);
  try {
    const before = isolated(() => {
      const prepared = prepareProject(JSON.stringify(captured));
      if (prepared.migrationStacks.length) throw new Error('Choose the legacy startup stack order before editing Python.');
      loadWorkspace(prepared.project.workspace, workspace);
      return compile(workspace);
    });
    // Exact generated source needs no reconstruction. Legacy shapes, shadows,
    // disabled code, loose drafts, coordinates and identities remain intact.
    if (source === before.source) return { ok: true, source, project: captured, compilation: before, sourceMap: [], unchanged: true };
    const previousDefinitions = previousFunctions(workspace);
    let previousTree: AstNode | undefined;
    if (before.source && previousDefinitions.length && children(parsed.tree, 'body').some(n => functionNode(n) && !previousDefinitions.some(p => p.signature.name === n.fields.name))) {
      const original = await parse(before.source, signal); cancelled(signal);
      if (validParseResult(original, before.source.length) && original.ok) previousTree = original.tree;
    }
    const built = isolated(() => {
      const converter = new LanguageConverter(workspace, previousDefinitions, previousTree);
      const roots = workspace.getTopBlocks(false).filter(block => block.type === 'py_program' && block.isEnabled());
      if (roots.length > 1) throw new Error('Keep one active Program before editing Python.');
      const root = roots[0];
      const replaced = workspace.getTopBlocks(false).filter(block => block.isEnabled() && (block.type === 'py_program' || isScopedDefinition(block) || ['procedures_defnoreturn', 'procedures_defreturn'].includes(block.type)));
      preserveDisabledDrafts(replaced);
      const previousBlocks = replaced.map(block => Blockly.serialization.blocks.save(block, { addCoordinates: true })!);
      const previous = root ? Blockly.serialization.blocks.save(root, { addCoordinates: true, addInputBlocks: false, addNextBlocks: false }) : null;
      replaced.forEach(block => block.dispose(false));
      const mainTree = converter.prepare(parsed.tree);
      const definitions = converter.definitions();
      const body = converter.body(children(mainTree, 'body'));
      converter.attachComments(parsed);
      const program = converter.block('py_program', undefined, undefined, { BODY: body });
      if (previous) Object.assign(program, { id: previous.id, x: previous.x, y: previous.y, collapsed: previous.collapsed });
      else Object.assign(program, { x: 48, y: 48 });
      reconcileBlocks([program, ...definitions], previousBlocks, converter.sourceMap);
      Blockly.serialization.blocks.append(program, workspace);
      for (const definition of definitions) Blockly.serialization.blocks.append(definition, workspace);
      refreshPreservedCalls(workspace);
      if (workspace.getAllBlocks(false).length > 2000) throw new Error('The converted project and its drafts exceed 2,000 blocks.');
      const project = prepareProject(JSON.stringify(snapshot(workspace))).project;
      const compilation = compile(workspace);
      return { project, compilation, sourceMap: converter.sourceMap, unchanged: false };
    });
    if (built.compilation.source === null) {
      return { ok: false, source, diagnostics: built.compilation.diagnostics.filter(d => d.severity === 'error').map(d => ({ code: `blocks-${d.code}`, message: d.message, blockId: d.blockId, span: built.sourceMap.find(s => s.blockId === d.blockId)?.span })) };
    }
    if (!built.unchanged) {
      const generated = await parse(built.compilation.source, signal);
      cancelled(signal);
      if (!validParseResult(generated, built.compilation.source.length) || !generated.ok) return { ok: false, source, diagnostics: [{ code: 'generated-syntax', message: 'The proposed blocks did not produce valid Python. Your source and blocks have been preserved.' }] };
      if (!sameSemantics(parsed.tree, generated.tree)) return { ok: false, source, diagnostics: [{ code: 'semantic-mismatch', message: 'These blocks would change the program structure or execution order. Conversion was not applied.', span: firstDifference(parsed.tree, generated.tree).span }] };
    }
    return { ok: true, source, ...built };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return { ok: false, source, diagnostics: [converterDiagnostic(error)] };
  } finally { isolated(() => workspace.dispose()); }
}
