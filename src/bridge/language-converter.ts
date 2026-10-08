import { Blockly } from '../blocks';
import { callState, referenceState } from '../blocks/core/functions';
import { allSymbols, createFunctionModel, createVariable, isScopedDefinition, lambdaParameterSymbol, localScope, MODULE_SCOPE, nameError, parameterSymbol, signatureOf, type FunctionBlock, type Handler, type LambdaState, type Parameter, type Signature } from '../language/functions';
import { moduleCallState, moduleReferenceState, moduleState, samePin } from '../language/modules';
import { child, children, functionNode, identifier, literal, repeatName, sameSemantics, unsupported, walk } from './ast';
import { CoreConverter, type BlockState } from './core-converter';
import type { AstNode } from './parser-protocol';
import { LibraryConverter } from './library-converter';
import { withoutScenePrelude } from './scene-bootstrap';

interface FunctionScope { signature: Signature; globals: Set<string>; locals: Set<string> }
export interface PreviousFunction { signature: Signature; block: BlockState }
const uid = () => crypto.randomUUID();
const attr = (value: AstNode, receiver: string, member: string) => value.type === 'Attribute' && child(value, 'value').type === 'Name' && child(value, 'value').fields.id === receiver && value.fields.attr === member;

/** Scope-aware mappings extend the core converter. Its final AST check is still
 * required: recognizing a call does not authorize moving it in the program. */
export class LanguageConverter extends CoreConverter {
  private readonly functions = new Map<string, { node: AstNode; scope: FunctionScope; previous?: PreviousFunction }>();
  private readonly bindings = new Set<string>();
  private scope?: FunctionScope;
  private lambdas: LambdaState[] = [];
  private readonly modules;
  private readonly registrations = new Map<AstNode, Handler>();
  private readonly oldFunctions: PreviousFunction[];
  private readonly oldTree?: AstNode;
  private readonly library: LibraryConverter;

  constructor(workspace: Blockly.Workspace, previous: PreviousFunction[], oldTree?: AstNode) {
    super(workspace); this.modules = moduleState(workspace); this.oldFunctions = previous; this.oldTree = oldTree; this.library = new LibraryConverter(this);
  }
  private renamedFunction(definition: AstNode, names: Set<string>, used: Set<string>) {
    if (!this.oldTree) return;
    const matches = this.oldFunctions.filter(previous => !names.has(previous.signature.name) && !used.has(previous.signature.id)).filter(previous => {
      const original = children(this.oldTree!, 'body').find(n => functionNode(n) && n.fields.name === previous.signature.name);
      if (!original) return false;
      const renamed = structuredClone(original), from = previous.signature.name, to = definition.fields.name as string;
      renamed.fields.name = to;
      let shadowsSelf = children(child(original, 'args'), 'args').some(p => p.fields.arg === from);
      for (const statement of children(original, 'body')) walk(statement, n => {
        if (n.type === 'Lambda') return false;
        if (n.type === 'Name' && identifier(n) === from && child(n, 'ctx').type === 'Store') shadowsSelf = true;
      });
      if (!shadowsSelf) for (const statement of children(renamed, 'body')) walk(statement, n => {
        if (n.type === 'Lambda' && children(child(n, 'args'), 'args').some(p => p.fields.arg === from)) return false;
        if (n.type === 'Name' && identifier(n) === from) n.fields.id = to;
      });
      return sameSemantics(renamed, definition);
    });
    return matches.length === 1 ? matches[0] : undefined;
  }
  parameters(value: AstNode, previous: Parameter[] = []): Parameter[] {
    const args = child(value, 'args');
    if (children(args, 'posonlyargs').length || children(args, 'kwonlyargs').length || children(args, 'defaults').length || children(args, 'kw_defaults').length || args.fields.vararg !== null || args.fields.kwarg !== null) unsupported(args.span ? args : value, 'Functions and lambdas need ordinary positional parameters without defaults, /, *, or **.');
    const params = children(args, 'args');
    if (params.length > 100) unsupported(value, 'A function or lambda supports at most 100 parameters.');
    const names = params.map(p => {
      if (typeof p.fields.arg !== 'string' || p.fields.annotation !== null) unsupported(p, 'Parameter annotations do not have a block representation yet.');
      const name = p.fields.arg as string, error = nameError(name); if (error) unsupported(p, error); return name;
    });
    const reserved = new Set(previous.filter(p => names.includes(p.name)).map(p => p.id));
    return names.map((name, index) => ({ name, id: previous.find(p => p.name === name)?.id ?? (previous.length === names.length && !reserved.has(previous[index]?.id) ? previous[index].id : uid()) }));
  }
  registration(statement: AstNode): { call: AstNode; name: string; handler: Handler } | undefined {
    if (statement.type !== 'Expr' || child(statement, 'value').type !== 'Call') return;
    const call = child(statement, 'value'), func = child(call, 'func');
    let sprite: string | undefined, kind: string | undefined, args: AstNode[];
    if (attr(func, 'events', 'on')) args = this.args(call, [2]);
    else if (attr(func, '_pb_scene', 'on') || attr(func, '_pb_scene', 'on_kind')) {
      args = this.args(call, [3]);
      const owner = literal(args.shift()!);
      if (owner?.literalType !== 'str') unsupported(call, 'A behavior registration needs a literal authored sprite ID or kind.');
      if (func.fields.attr === 'on') sprite = owner.text; else kind = owner.text;
    } else return;
    const event = literal(args[0]);
    if (event?.literalType !== 'str' || args[1].type !== 'Name') unsupported(call, 'A handler registration needs a literal event name and one named async function.');
    return { call, name: identifier(args[1]), handler: { event: event.text, order: this.registrations.size, ...(sprite ? { sprite } : {}), ...(kind ? { kind } : {}) } };
  }
  prepare(tree: AstNode) {
    tree = withoutScenePrelude(tree);
    const statements = children(tree, 'body'), handlers = new Map<string, Handler>();
    const definitionNames = new Set(statements.filter(functionNode).map(n => n.fields.name as string)), usedIdentities = new Set<string>();
    let startup = false, registering = false;
    for (const statement of statements) {
      if (statement.type === 'Pass') continue;
      if (functionNode(statement)) {
        if (startup) unsupported(statement, 'Place function definitions before startup statements. Hoisting this definition could change when its name becomes available.');
        const name = statement.fields.name;
        if (typeof name !== 'string') unsupported(statement, 'This definition needs a function name.');
        const error = nameError(name); if (error) unsupported(statement, error);
        if (this.functions.has(name)) unsupported(statement, 'Each function needs a unique name; redefining a function changes binding time.');
        if (children(statement, 'decorator_list').length || statement.fields.returns !== null || (Array.isArray(statement.fields.type_params) && statement.fields.type_params.length)) unsupported(statement, 'Decorators, annotations and type parameters do not have a block representation yet.');
        const previous = this.oldFunctions.find(f => f.signature.name === name) ?? this.renamedFunction(statement, definitionNames, usedIdentities);
        if (previous) usedIdentities.add(previous.signature.id);
        const signature: Signature = { id: previous?.signature.id ?? uid(), name, parameters: this.parameters(statement, previous?.signature.parameters), ...(statement.type === 'AsyncFunctionDef' ? { async: true } : {}) };
        this.functions.set(name, { node: statement, scope: { signature, globals: new Set(), locals: new Set() }, previous });
      } else if (['Import', 'ImportFrom'].includes(statement.type)) {
        if (startup) unsupported(statement, 'Keep library imports before startup statements so conversion does not move their execution.');
      } else {
        startup = true;
        const registration = this.registration(statement);
        if (registration) {
          registering = true;
          if (handlers.has(registration.name)) unsupported(statement, 'Each handler block has one registration. Use separate named handlers for multiple events.');
          handlers.set(registration.name, registration.handler); this.registrations.set(statement, registration.handler);
        } else if (registering) unsupported(statement, 'Handler registrations must follow startup statements. Moving this action would change registration timing.');
      }
    }
    for (const [name, handler] of handlers) {
      const entry = this.functions.get(name);
      if (!entry) unsupported(statements.find(s => this.registrations.get(s) === handler)!, 'This handler registration needs a definition in the editable main file.');
      if (!entry.scope.signature.async || entry.scope.signature.parameters.length !== 1) unsupported(entry.node, 'An event handler needs an async definition with one payload parameter.');
      entry.scope.signature.handler = handler;
    }
    for (const statement of statements) {
      if (functionNode(statement)) continue;
      walk(statement, n => {
        if (n.type === 'Lambda') return false;
        if (n.type === 'Name' && child(n, 'ctx').type === 'Store' && !repeatName(identifier(n))) this.bindings.add(identifier(n));
      });
    }
    for (const entry of this.functions.values()) {
      for (const statement of children(entry.node, 'body')) walk(statement, n => {
        if (functionNode(n) || n.type === 'Lambda') return false;
        if (n.type === 'Global') for (const name of n.fields.names as string[]) entry.scope.globals.add(name);
        if (n.type === 'Name' && child(n, 'ctx').type === 'Store' && !repeatName(identifier(n))) entry.scope.locals.add(identifier(n));
      });
      for (const name of entry.scope.globals) { if (entry.scope.locals.has(name)) this.bindings.add(name); entry.scope.locals.delete(name); }
      for (const parameter of entry.scope.signature.parameters) entry.scope.locals.delete(parameter.name);
    }
    for (const entry of this.functions.values()) {
      if (this.bindings.has(entry.scope.signature.name)) unsupported(entry.node, 'A named function cannot also be assigned as a project variable. Use another name for the function value.');
      for (const variable of this.workspace.getVariableMap().getAllVariables()) if (variable.getType() === MODULE_SCOPE && variable.getName() === entry.scope.signature.name) this.workspace.getVariableMap().deleteVariable(variable);
      // A former local may have become a parameter. Its old reads in detached
      // drafts retain their saved field identity; active code uses the parameter.
      for (const variable of this.workspace.getVariableMap().getAllVariables()) if (variable.getType() === localScope(entry.scope.signature.id) && entry.scope.signature.parameters.some(p => p.name === variable.getName())) this.workspace.getVariableMap().deleteVariable(variable);
      createFunctionModel(this.workspace, entry.scope.signature);
    }
    return tree;
  }
  definitions(): BlockState[] {
    return [...this.functions.values()].map(entry => {
      const previous = this.scope; this.scope = entry.scope;
      try {
        const signature = entry.scope.signature;
        const block = this.block(signature.handler ? 'py_handler' : 'py_function', entry.node, undefined, { BODY: this.body(children(entry.node, 'body')) }, { functionId: signature.id, signature });
        if (entry.previous) {
          for (const span of this.sourceMap) if (span.blockId === block.id) span.blockId = entry.previous.block.id!;
          Object.assign(block, { id: entry.previous.block.id, x: entry.previous.block.x, y: entry.previous.block.y, collapsed: entry.previous.block.collapsed });
        }
        else Object.assign(block, { x: 480, y: 48 + [...this.functions.keys()].indexOf(signature.name) * 180 });
        this.statements.push({ node: entry.node, state: block }); return block;
      } finally { this.scope = previous; }
    });
  }
  private locallyBound(name: string) {
    return this.lambdas.some(lambda => lambda.parameters.some(p => p.name === name)) || !!this.scope && (this.scope.locals.has(name) || this.scope.signature.parameters.some(p => p.name === name));
  }
  override symbol(name: string, origin: AstNode): string {
    const error = nameError(name); if (error) unsupported(origin, error);
    if (this.lambdas.length) {
      const lambda = this.lambdas.at(-1)!, parameter = lambda.parameters.find(p => p.name === name);
      if (!parameter) unsupported(origin, `A lambda can read only its own parameters. Pass “${name}” as an argument instead of capturing it.`);
      return lambdaParameterSymbol(lambda.id, parameter.id);
    }
    const parameter = this.scope?.signature.parameters.find(p => p.name === name);
    if (parameter) return parameterSymbol(parameter.id);
    if (this.scope?.locals.has(name)) {
      const owner = this.scope.signature.id, existing = allSymbols(this.workspace).find(s => s.kind === 'local' && s.owner === owner && s.name === name);
      return existing?.id ?? createVariable(this.workspace, name, owner).getId();
    }
    return super.symbol(name, origin);
  }
  private moduleTarget(func: AstNode) {
    if (func.type !== 'Attribute' || child(func, 'value').type !== 'Name') return;
    const alias = identifier(child(func, 'value'));
    if (this.locallyBound(alias)) return;
    const binding = this.modules.imports.find(i => i.alias === alias);
    if (!binding) return;
    const definition = this.modules.definitions.find(d => samePin(d, binding));
    const signature = definition?.exports.find(f => f.name === func.fields.attr);
    if (!signature) unsupported(func, `“${alias}” does not export this function in its pinned revision.`);
    return { binding, signature };
  }
  private withState(state: BlockState, origin: AstNode, inputs: Record<string, BlockState> = {}) {
    return this.block(state.type, origin, state.fields, inputs, state.extraState);
  }
  override expression(value: AstNode): BlockState {
    if (value.type === 'Name' && !this.locallyBound(identifier(value))) {
      const entry = this.functions.get(identifier(value));
      if (entry) {
        if (entry.scope.signature.async || entry.scope.signature.handler) unsupported(value, 'Function values support synchronous functions only. Use an awaited direct call for an async function.');
        return this.withState(referenceState(entry.scope.signature), value);
      }
    }
    if (value.type === 'Attribute') {
      const target = this.moduleTarget(value);
      if (target) {
        if (target.signature.async) unsupported(value, 'Async module functions need direct awaited calls.');
        return this.withState(moduleReferenceState(target.binding, target.signature), value);
      }
    }
    const library = this.library.expression(value); if (library) return library;
    if (value.type === 'Lambda') {
      const lambda: LambdaState = { id: uid(), parameters: this.parameters(value) };
      this.lambdas.push(lambda);
      try { return this.block('py_lambda', value, undefined, { BODY: this.expression(child(value, 'body')) }, lambda); }
      finally { this.lambdas.pop(); }
    }
    if (value.type === 'Await') return this.awaited(value, false);
    return super.expression(value);
  }
  private mappedCall(value: AstNode, statement: boolean, awaited: boolean): BlockState | undefined {
    const func = child(value, 'func');
    const direct = func.type === 'Name' && !this.locallyBound(identifier(func)) ? this.functions.get(identifier(func))?.scope.signature : undefined;
    const imported = this.moduleTarget(func), signature = direct ?? imported?.signature;
    if (!signature) return;
    if (signature.handler) unsupported(value, 'Send the handler’s event instead of calling its function directly.');
    if (!!signature.async !== awaited) unsupported(value, signature.async ? 'Call this async function with await so its completion is explicit.' : 'This synchronous function call must not use await.');
    const args = this.args(value, [signature.parameters.length]);
    const inputs = Object.fromEntries(args.map((arg, index) => [`ARG_${signature.parameters[index].id}`, this.expression(arg)]));
    return this.withState(imported ? moduleCallState(imported.binding, signature, !statement) : callState(signature, !statement), value, inputs);
  }
  private awaited(value: AstNode, statement: boolean): BlockState {
    const call = child(value, 'value');
    if (call.type !== 'Call') unsupported(value, 'Await needs a direct call to an async function or supported timed operation.');
    if (statement && attr(child(call, 'func'), 'events', 'wait')) {
      const [seconds] = this.args(call, [1]); return this.block('py_wait', value, undefined, { SECONDS: this.expression(seconds) });
    }
    return this.mappedCall(call, statement, true) ?? this.library.call(call, statement, true) ?? unsupported(value, 'This awaited operation does not have a supported block mapping yet.');
  }
  override call(value: AstNode, statement: boolean): BlockState {
    const func = child(value, 'func');
    if (statement && attr(func, 'events', 'emit')) {
      const [event, payload] = this.args(value, [2]); return this.block('py_emit', value, undefined, { EVENT: this.expression(event), PAYLOAD: this.expression(payload) });
    }
    const mapped = this.mappedCall(value, statement, false); if (mapped) return mapped;
    const library = this.library.call(value, statement); if (library) return library;
    // Named built-ins and curated methods remain in the core/library registry.
    // Function-valued variables, parameters, lambdas and collection items use
    // the existing dynamic call block, preserving Python's runtime TypeErrors.
    const dynamic = ['Lambda', 'Subscript', 'Call'].includes(func.type) || func.type === 'Name' && (this.locallyBound(identifier(func)) || this.bindings.has(identifier(func)));
    if (dynamic) {
      const args = this.args(value, Array.from({ length: 101 }, (_, index) => index));
      return this.block(statement ? 'py_dynamic_call' : 'py_dynamic_call_value', value, undefined, { CALLABLE: this.expression(func), ...Object.fromEntries(args.map((arg, index) => [`ARG${index}`, this.expression(arg)])) }, { argumentCount: args.length });
    }
    return super.call(value, statement);
  }
  override statement(value: AstNode): BlockState | undefined {
    if (this.scope && ['Import', 'ImportFrom'].includes(value.type)) unsupported(value, 'Keep library imports at the top of the main file.');
    if (this.library.import(value)) return undefined;
    const library = this.library.statement(value); if (library) return library;
    if (functionNode(value)) {
      if (this.scope) unsupported(value, 'Nested function definitions and closures do not have a block representation yet.');
      return undefined;
    }
    if (this.registrations.has(value)) return undefined;
    if (value.type === 'Global') {
      if (!this.scope) unsupported(value, 'Declare global bindings inside a function; module statements already use project scope.');
      return undefined;
    }
    if (value.type === 'Return') return value.fields.value === null ? this.block('py_return', value) : this.block('py_return_value', value, undefined, { VALUE: this.expression(child(value, 'value')) });
    if (value.type === 'Expr' && child(value, 'value').type === 'Await') return this.awaited(child(value, 'value'), true);
    if (value.type === 'ImportFrom') {
      const names = children(value, 'names');
      if (value.fields.module === 'playground' && value.fields.level === 0 && names.length === 1 && names[0].fields.name === 'events' && names[0].fields.asname === null) return undefined;
      unsupported(value, 'Only existing playground library imports can be converted.');
    }
    if (value.type === 'Import') {
      const names = children(value, 'names');
      if (names.length === 1) {
        const imported = names[0], binding = this.modules.imports.find(i => i.alias === imported.fields.asname);
        if (binding) {
          const index = this.modules.definitions.findIndex(d => samePin(d, binding));
          if (imported.fields.name !== `_pb_module_${index}`) unsupported(value, 'This module import must keep its existing pinned file and namespace.');
          return undefined;
        }
      }
    }
    return super.statement(value);
  }
}

export function previousFunctions(workspace: Blockly.Workspace): PreviousFunction[] {
  return workspace.getTopBlocks(false).filter(b => b.isEnabled() && isScopedDefinition(b)).map(b => ({ signature: signatureOf((b as FunctionBlock).getProcedureModel()!), block: Blockly.serialization.blocks.save(b, { addCoordinates: true, addInputBlocks: false })! }));
}
