# Reusable function modules

Date: **2026-10-07**. P5 implements local module files, pinned imports, qualified calls, dependency closure, and an editor workflow. This extends the [core language plan](core-language-implementation-plan.md); Batches 6a and 6b extend it with [synchronous function values and expression lambdas](function-values.md).

## Using modules

1. In a project with named functions, open **Modules**, name the module, select its public functions, and choose **Export module**. Local helpers reached by calls or function references are included automatically, even if they are private. The source project's module identity and export selection survive project save/reload; a later export creates a new revision.
2. In another project, choose the module file under **Import a module file**. Review its exported signatures and dependency count, choose a namespace such as `tools`, and select **Import module**.
3. Use statement/value calls or synchronous function references from the **Modules** toolbox. Calls show qualified names such as `tools.difference(left, right)`. Async helpers show **await call** and require an async caller or handler.
4. **Inspect module** shows saved blocks and generated Python in a read-only view, including a selector for dependency modules. **Rename namespace** updates call labels without changing their targets. **Export saved copy** preserves the exact imported revisions.
5. **Remove import** leaves calls and argument blocks intact and visibly unresolved. Undo restores the import. Reimporting the exact pin under the original alias can restore an unambiguous missing binding; a different revision never silently takes its place.

Try the [consumer project](../tests/fixtures/modules/consumer.json), [transitive dependency example](../tests/fixtures/modules/transitive-consumer.json), or [async module example](../tests/fixtures/modules/async-consumer.json) with Open project. The [standalone arithmetic module](../tests/fixtures/modules/arithmetic.module.json) is imported through Modules, not Open project. The [missing-import project](../tests/fixtures/modules/missing-module.json) demonstrates recovery by importing that file under `tools`.

## The saved contract

A module bundle is ordinary JSON with:

| Field | Meaning |
| --- | --- |
| `format`, `formatVersion` | `python-blocks.module`, version 1. |
| `entry` | The root module's `moduleId` and `revision`. |
| `definitions` | The complete pinned dependency closure, including the entry module. |

Each definition contains its identity/revision, Python-compatible name, language version, exported signatures, dependency imports, and saved function workspace. Public signatures include function/parameter IDs and explicit async metadata. Private helpers remain in the workspace without becoming public call blocks. Dependencies bind a local import ID and namespace alias to another exact module/revision pair.

Project language versions 5–19 store `pythonModules` in Blockly's registered serializer: project import bindings, embedded definitions, and optional local authoring identity/selection. Existing version-1 through version-4 projects remain readable. New exports use language version 19; pinned version-5 through version-18 modules remain readable without changing their contents. Version 6 added function references/dynamic calls; version 7 added expression lambdas and their parameter identities; version 8 added sprite library operations; version 9 added motion, dialogue and pointer sensing; version 10 added backdrop and saved-frame operations; version 11 added sprite pen/stamps and graphic effects; version 12 added sprite behavior/data and pixel sensing; version 13 added game motion, kinds and kind handlers; version 14 added named worlds, tilemaps and cameras; version 15 added game state and presentation; version 16 added sound/music; version 17 added questions, timers, color sensing and touch mappings; version 18 added watches; version 19 adds unary plus/minus expressions for the Python bridge. Game and sound helpers automatically enable an event session in their consumer. Incompatible module input is rejected before replacing work. There is no network lookup during loading or execution.

Pins identify immutable contents within the import workflow. Reimporting the same pin and alias is a no-op. Another alias may refer to the same pin; different revisions may coexist under distinct aliases. Different contents claiming an existing pin are rejected, as is replacing an occupied namespace with another revision. Importing another revision does not update old calls. The learner must explicitly choose its call blocks.

Module dependency graphs must be acyclic **by pinned revision**. Ordinary direct and mutual function recursion inside one module remain valid. Export follows local call and function-reference dependencies once, including those inside lambda bodies, preserving private helpers and their scoped variables. Lambda scopes and parameter IDs travel with their definitions; duplicate scope identities are rejected even in disabled code. Imported dependency bundles must be complete, with no unrelated definitions.

## Scope and execution

Modules contain functions. Export excludes Program startup and handler registrations. Functions may be synchronous or explicitly async; they retain the core language's positional calls, returns, recursion, native collection identity, and Python errors. Project state must enter through parameters. References to donor project variables are rejected rather than silently redirected to variables in the consumer.

The supported runtime set is fixed by the language/compiler version: the exposed core operations, controlled standard-library helpers, `playground.pen`, `playground.events`, and the [scene library](sprites-stage-input.md). Authored sprite references and imported costume references must be passed in through parameters; modules do not embed donor scene assets. Module files do not introduce arbitrary imports, pip dependencies, host capabilities, or a separate language. A module containing emission blocks requires its consumer to run an event session. Waiting helpers retain the existing explicit async/context rules.

Compilation produces `program.py` plus generated `_pb_module_N.py` files. Namespace aliases generate ordinary Python imports and qualified calls. Each file executes in its own module namespace; local functions and other modules can reuse the same names and function IDs without binding to each other. Normal Python parameter passing means a list mutated by a module function remains the same list in the caller.

The runtime uses a small import hook implementing Python's `find_spec`, `create_module`, and `exec_module` protocol. It supplies the captured compilation's files to ordinary Python import machinery. Module caches and source-line caches are scoped to the run; the loader stays available during a persistent event session and is removed when that execution exits. A new worker still provides fresh state on every Run. [Python import hooks](https://docs.python.org/3/library/importlib.html#importlib.abc.MetaPathFinder), [the import system](https://docs.python.org/3/reference/import.html)

## Durability and diagnostics

- Import validates structure, dependency pins, signatures, scope, supported blocks, and compilation in temporary workspaces before changing the project. Invalid files leave the current project intact.
- Import, namespace rename, and removal are undoable. Removal retains unresolved calls and all arguments. Ordinary project save/load preserves binding and function IDs.
- Within one project, copied calls retain their exact binding. Cross-project copies can use an already imported matching pin/signature under its destination alias; otherwise the saved reference stays unresolved. Same-named functions or modules with a different pin do not capture the reference.
- Namespace collisions and local shadowing are diagnosed. A saved call with a mismatching pinned signature is not silently reshaped or rebound.
- Source maps include each module filename and pin. Runtime errors report the module, filename, line, and function, and highlight the local calling statement where available. Inspect module exposes the imported definition. Errors after an edit remain associated with the earlier compilation revision.
- Delayed event overload retains emit locations inside module files as well as the main program. Those origins remain separate from the live Python traceback.

Limits: 32 pinned definitions in a project/bundle, 32 imports per project or module, 2,000 blocks per module, a 2 MB module-file limit and a 16 MB project-file limit. Import also checks that the combined project can fit its file limit. Existing execution, event, output, and drawing limits remain in effect.

## Source export and boundaries

For projects containing modules, **Export Python** downloads `python-sources.zip` containing the exact compiled `program.py` and module files, a filename-to-pin manifest, and a dependency note. The archive is created with the pinned [fflate ZIP library](https://github.com/101arrowz/fflate). Keep the generated files together. Projects using playground APIs still require that runtime and host, and event projects require a host that awaits the event session. The archive does not bundle those runtime dependencies or editable blocks.

Use **Save project** for the complete editable project, and **Export module** for reusable definitions. Imported definitions are read-only in this increment. Editing imported code in place, remote package discovery, automatic updates, arbitrary pip installation, and public untrusted sharing remain outside P5.

## Evidence

[Module tests](../tests/unit/modules.test.ts) execute generated Python and cover closure, nested imports, duplicate pins, independent revisions, missing/cyclic dependencies, hidden globals, malformed signatures, namespace conflicts, direct/mutual recursion, collection aliasing, copy, undo, save/reload, and module error locations. [Execution tests](../tests/python/test_execution.py) verify isolated module namespaces, cache cleanup, file validation, imported async helpers, and module emit origins.

[Browser flows](../tests/e2e/modules.spec.ts) exercise export from a donor and import into a different project, namespace editing, read-only inspection, source archives, removal/recovery, incompatible files, actual Pyodide module failures, awaited imported helpers/restart, transitive imports, and rendered call duplication. See [implementation progress](implementation-progress.md) for the verified suite totals. [Lambda tests](../tests/unit/lambdas.test.ts) and [browser flows](../tests/e2e/lambdas.spec.ts) additionally cover imported lambda factories, dependencies, scoped parameters, read-only inspection, and reload.
