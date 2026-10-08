# Function values

Date: **2026-10-07**. Batches 6a and 6b implement synchronous function references, calls through values, higher-order programs, expression lambdas, and module export through references. These complete P6 of the [core language plan](core-language-implementation-plan.md).

## Using the blocks

The **Functions** palette includes a `function name` value block for each synchronous named function. It produces the function itself. Assign it to a variable, pass it as an argument, return it, or store it in a list/dictionary. The **Modules** palette provides equivalent qualified references to synchronous exported functions.

Use **Function values → call function value** to invoke a value. There are statement and expression forms. Connect the callable and its arguments; the gear adds, removes, or reorders positional arguments. The callable stays connected while arguments change. Removed expressions, including shadow numbers, become recoverable drafts. Undo restores their connections.

For example, the [higher-order project](../tests/fixtures/function-values/higher-order.json) generates the equivalent of:

```python
def difference(left, right):
    return left - right


def choose_operation():
    return difference


def apply_operation(operation, left, right):
    return operation(left, right)


print(apply_operation(choose_operation(), 10, 3))
```

The output is `7`. “Higher-order” means that a function accepts or returns another function.

## Expression lambdas

The **Function values** category contains a **lambda** value block and **Manage lambdas**. A lambda has an ordered parameter list and one expression body. Use the manager to create one, select an existing one, add/remove parameters, or change their names and order. The block's **Edit lambda parameters** context-menu item opens the same form. **Go to lambda** locates it in the workspace.

The [named and anonymous function example](../tests/fixtures/lambdas/higher-order.json) generates the equivalent of:

```python
def double(value):
    return value * 2


def apply(operation, value):
    return operation(value)


operation = double
print(apply(operation, 3))
print(apply(lambda value: value + 1, 3))
```

It prints `6` and `4`. Lambdas produce ordinary Python function objects and can be assigned, passed, returned, stored in collections, and called. Each evaluation creates a function object; aliasing an existing value preserves that object. Zero-parameter lambdas and nested lambdas that do not capture enclosing variables are supported. [Python lambdas](https://docs.python.org/3/reference/expressions.html#lambdas).

Each lambda has a scope ID, and each parameter has its own ID. Renaming preserves body references. Reordering changes the Python positional signature while retaining each body's parameter binding. Removing a used parameter keeps its read block and former label visible as unresolved work. Apply is one Undo action; Undo restores the binding, and Redo/reload preserve the resulting state.

Duplicate and copy/paste allocate new scope/parameter IDs and remap internal reads, including nested lambdas inside copied named functions. External references retain their original targets. Copying a parameter read by itself does not make it valid in another scope. Each new lambda dragged from the toolbox receives independent identities.

## Calls and identity

References emit ordinary Python names, such as `difference` or `tools.choose_operation`. Dynamic calls emit ordinary Python calls, with parentheses around the callable expression where needed. There is no callable wrapper. The callable and arguments evaluate once, left to right; Python reports wrong argument counts and non-callable values as `TypeError`. [Python calls](https://docs.python.org/3/reference/expressions.html#calls), [evaluation order](https://docs.python.org/3/reference/expressions.html#evaluation-order).

A local reference binds to a function ID. A module reference additionally retains the import binding and exact module/revision pin. Rename changes the displayed/generated name without changing the target. Deletion or removal leaves unresolved references; Undo can restore their targets. Copying a definition remaps self references to the copied definition; copying a reference alone retains its existing target. Unavailable external references remain unresolved.

Direct named calls and dynamic calls handle signature edits differently:

| Call kind | Argument editing rule |
| --- | --- |
| Direct named call | Sockets bind to parameter IDs. Reordering parameters carries the matching expressions with them. |
| Dynamic call | Sockets are an ordered positional list. The target can be computed at runtime, so signature changes never reshape or reorder these inputs automatically. |

For `difference(left, right)`, the dynamic call `(difference)(10, 3)` returns `7`. Reordering its definition to `difference(right, left)` while retaining the same body and dynamic arguments changes the result to `-7`. Both forms use the Python shown in the preview.

## Scope and module reuse

References use the same name-conflict and local-shadowing checks as direct calls. An enclosing parameter or assigned local cannot silently replace the named function or imported namespace selected by a reference block.

Only synchronous function values are exposed. Async functions retain direct awaited calls; event handlers are started through events. Manually imported async/handler reference blocks are diagnosed before Run, including inside async callers.

Inside a lambda, the variable picker exposes only that lambda's parameters. Reads of project variables, enclosing function parameters/locals, or enclosing lambda parameters produce capture diagnostics. Explicit references/calls to synchronous named or imported functions are allowed, provided intervening parameters/locals do not shadow their generated names. Python itself supports broader name lookup and closures; this restriction defines our current editor subset. A lambda inside an async function remains synchronous. Nested named definitions, lexical capture, async function values, and multi-statement anonymous functions remain outside P6. [Python name resolution](https://docs.python.org/3/reference/executionmodel.html#resolution-of-names).

Module export follows local and imported function references as well as direct calls. A public factory returning a private helper includes that helper and its dependencies in the bundle. The helper remains private in the palette, but its returned Python function is callable. The [module consumer example](../tests/fixtures/function-values/module-consumer.json) demonstrates this with separate module namespaces.

The same dependency traversal includes lambda bodies. A module factory may return a lambda that calls a private helper or refers to a pinned dependency. The [lambda module example](../tests/fixtures/lambdas/module-consumer.json) preserves parameters through import, read-only inspection, save, and reload.

## Persistence and errors

New project and module exports use language version 19. The version-7 lambda model now coexists with the [creative libraries](sprites-stage-input.md), input tools, watches and unary plus/minus expressions used by the [Python bridge](python-and-blocks.md). Projects from versions 1–18 and pinned modules from versions 5–18 remain readable. Project envelope version 2 also preserves exact Python drafts and recovery; it is distinct from the block language version and the module format version. Loading a project preserves existing module revisions and their contents. Saved files describe blocks, identities, arguments, definitions and draft text; running reconstructs the function objects. They do not snapshot a Python heap.

Dynamic calls support 0–100 positional arguments; lambdas support 0–100 distinct, validly named parameters. Invalid counts, malformed identities, and duplicate lambda scope IDs are rejected before replacing the current project, including disabled lambda code in modules. Deserialization restores Blockly's global event group and Undo-recording state on failure, so a rejected file or clipboard item cannot disable later Undo.

Preflight diagnostics cover missing inputs, unavailable definitions/pins, mismatched module signatures, shadowing, and unsupported async/handler references. Runtime errors retain Python exception details and map to the containing statement using the captured compilation revision. Imported failures retain their module filename and identity. Expression-level highlighting remains separate work.

When a returned lambda fails later, its traceback retains the `<lambda>` frame and identifies the statement that defined its expression, such as the factory's return block. Arity failures identify the calling statement. The [error example](../tests/fixtures/lambdas/error.json) and [capture example](../tests/fixtures/lambdas/capture.json) demonstrate runtime and preflight failures respectively.

## Verification

[Unit and native execution cases](../tests/unit/function-values.test.ts) cover assignment, passing/returning functions, collections, identity, evaluation order, positional signature changes, recursion references during copy, arity/non-callable failures, module dependency transfer, scopes, serialization, and argument editing. [Browser flows](../tests/e2e/function-values.spec.ts) exercise the actual palettes, signature forms, argument mutator, duplication, Undo/Redo, invalid-file recovery, reload, and Pyodide execution.

[Lambda cases](../tests/unit/lambdas.test.ts) additionally cover parameter scope, identities, aliasing, nesting, shadowing, errors, module transfer, malformed metadata, and disabled module scopes. [Lambda browser flows](../tests/e2e/lambdas.spec.ts) exercise real toolbox creation, parameter forms, duplication, Undo/Redo, reload, imported lambdas, and failure highlighting.

The completed suite passes `pnpm check` with 138 TypeScript tests and 35 native Python tests, plus 62 Chromium/Pyodide browser tests. See the [completion audit](core-language-completion-audit.md) for requirement coverage and the [progress log](implementation-progress.md) for batch history.
