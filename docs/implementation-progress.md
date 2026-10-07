# Core language implementation progress

Objective: implement the complete [core language plan](core-language-implementation-plan.md) in verified batches. P0–P6 are implemented and verified for the supported subset; the [completion audit](core-language-completion-audit.md) maps each requirement to evidence. This log retains the history of the individual batches.

## Batch 1 — Program, compilation, persistence, and sequential foundations

Implemented on 2026-10-07:

- Explicit Program root and stable execution order independent of block placement; loose blocks are marked as drafts.
- Compilation artifact with language version, revision, diagnostics, and statement-level source mapping, reused for preview/run/export.
- Required-input, unsupported-block, numeric-literal, naming, and loop-control diagnostics. Invalid drafts cannot execute stale source.
- Native Python repeat semantics, range loops, iteration, break/continue, arithmetic including floor division, short-circuit logic, truthiness, `None`, and explicit conversions.
- Text-preserving numeric literals, including integers beyond JavaScript's exact numeric range; no synthetic `None` initialization for variables.
- Versioned project JSON, browser autosave, project file save/open, isolated import validation, recovery of incompatible browser saves, and ordering review for legacy multi-stack imports.
- Structured Python exceptions and tracebacks, statement highlighting, and revision-aware error attribution.
- Explicit execution-start event, with hard Stop and existing resource limits retained.

Evidence: [compiler tests](../tests/unit/language.test.ts), [project tests](../tests/unit/project.test.ts), [execution helper tests](../tests/python/test_execution.py), [browser flows](../tests/e2e/language.spec.ts), and [saved fixtures](../tests/fixtures/language/).

Validation: `pnpm check` passes (36 TypeScript tests, 9 native Python tests, type checks, production build). Ten real Chromium/Pyodide browser tests pass, including autosave reload, a large integer, missing inputs, a fractional repeat count, structured error display, Stop during an infinite loop, recovery, legacy migration, and the original drawing/export flows. The error screenshot was visually inspected. Local native tests used Python 3.9.6; the browser uses the bundled Python 3.14.2. CI has been updated to 3.14.2 to align future native runs; a remote CI run is not claimed here.

## Batch 2a — Scoped functions and editing

Implemented on 2026-10-07:

- Procedure-model compatibility tests against the pinned package. They establish stable serialization and expose a native reorder-undo defect: Blockly filters the delete/create pair for a parameter identity.
- A Python adapter with independent function/parameter identities, case-sensitive parameter names, scoped variable references, and explicit project/local labels.
- Named function definitions, statement/value calls, bare/value returns, direct and mutual recursion, local range targets, and selective `global` declarations for project rebinding.
- Scope/conflict, unbound-local, unresolved-call, and return-context diagnostics; native conditional `UnboundLocalError` and runaway `RecursionError` remain intact.
- Accessible function/variable forms and dynamic toolbox entries. Parameter rename/reorder is one undo operation; removed arguments become recoverable drafts and reconnect on undo, including shadow arguments. Deleting a definition keeps calls intact and unresolved.
- Version-2 projects and a version-1 migration preserving old parameter/project bindings. Save/reload preserves IDs and generated behavior.
- Undo/redo notifications keep the Python preview and browser autosave synchronized with restored model state.

Evidence: [procedure compatibility tests](../tests/unit/procedure-model.test.ts), [function semantics/editing tests](../tests/unit/functions.test.ts), [rendered function flows](../tests/e2e/functions.spec.ts), and [a portable function example](../tests/fixtures/language/functions.json).

Validation: `pnpm check` passes with 53 TypeScript tests, 9 native Python tests, type checks, and production build. All 13 browser tests pass using real Chromium/Pyodide, including the 3 new function flows and the existing drawing, persistence, diagnostics, and cancellation flows. The function editor and executed example screenshots were visually inspected. Native tests still use local Python 3.9.6; the browser uses the bundled Python 3.14.2. A remote CI run is not claimed.

At the end of Batch 2a, function copying and same-scope case-sensitive variable names remained open. Batch 2b below closes those remaining P2 items.

## Batch 2b — Function copying and Python naming

Implemented on 2026-10-07:

- A shared clipboard path for the function manager's Duplicate action, Blockly's standard Duplicate command, and copy/paste. Copies receive fresh function, parameter, local, and block IDs; self-recursion and internal symbols follow the copy, while external targets retain their IDs.
- Cross-project copies preserve unavailable references and their labels instead of binding to a similarly named destination symbol. Calls copied before a signature edit reconcile arguments by parameter ID and retain removed expressions as drafts.
- Preflight copy validation, grouped undo/redo, and full block serialization metadata for local ownership and unresolved symbol labels. Save/load and undo never generate replacement identities.
- Case-sensitive project/local variable lookup; `count` and `Count` can coexist. Rename, undo, execution, and saved-project reload preserve both bindings.
- Reserved repeat-counter names, preventing the generated helper from overwriting a parameter or local named `count`.
- Version-3 project output, with versions 1 and 2 still accepted.

Evidence: [copy and naming tests](../tests/unit/copy.test.ts), [function tests](../tests/unit/functions.test.ts), and [rendered duplicate/undo flows](../tests/e2e/functions.spec.ts). The recursive-copy fixture checks independent locals, remapped self-calls, preserved external dependencies, native execution, and persistence. Browser coverage exercises both the function manager and Blockly's standard menu command.

P2's planned gate is complete for the supported top-level, positional-argument function model. Reusable dependency imports belong to P5; unavailable clipboard targets intentionally remain unresolved.

## Batch 3 — Native lists and dictionaries

Implemented on 2026-10-07:

- A Collections category with list/dictionary literals, length, item lookup/update/delete, append, membership, key iteration, dictionary lookup with a default, and shallow copy.
- Native Python objects throughout: mutation through aliases and parameters, nested collections, zero-based and negative list indices, repeated dictionary keys, and eager evaluation of `.get` defaults.
- A dictionary-pair editor, plus adapted list editing. Reordering retains expressions; removal preserves them as drafts, including visible shadow values; Undo reconnects the program.
- Required literal-input diagnostics and mapped `IndexError`, `KeyError`, and `TypeError` failures. Collection mutation inside a function does not add a project `global` declaration.
- Python comparison behavior across different operand types. The inherited editor handler that disconnected mixed-type operands is disabled; equality runs normally, and invalid ordering raises Python's `TypeError`.
- A [portable collections example](../tests/fixtures/language/collections.json) and saved collection-error fixtures.

Evidence: [collection semantics/editing tests](../tests/unit/collections.test.ts), [comparison regressions](../tests/unit/language.test.ts), [collection browser flows](../tests/e2e/collections.spec.ts), and [language browser flows](../tests/e2e/language.spec.ts).

Validation of Batches 2b and 3 together: `pnpm check` passes with **75 TypeScript tests, 9 native Python tests, type checks, and production build**. All **21 real Chromium/Pyodide browser tests pass**, covering function duplication/undo/reload, native collection execution, error attribution, list/dictionary editor Undo, mixed-type comparison persistence, and existing drawing/cancellation/recovery flows. The dictionary editor screenshot was visually inspected. Native tests used local Python 3.9.6; Pyodide uses bundled Python 3.14.2. No remote CI run is claimed. Vite still reports the existing large JavaScript bundle advisory.

P3's gate is complete, reaching the first sequential-language milestone. The next batch is P4's event/scheduling prototype and its runtime lifecycle contract; P5 and P6 remain part of the full goal.

## Batch 4a — Event runtime and scheduling prototype

Implemented on 2026-10-07:

- A cooperative Python event session with FIFO dispatch, registration ordering, explicit waits (including zero), independent handler tasks, and per-receiver payload snapshots.
- Bounded handlers, active tasks, queued events, payload bytes/depth/nodes, and host input in flight. Python and the host read one shared limits file; overload is an explicit session failure.
- A persistent event lifecycle separate from sequential execution, with initialization before readiness and one automatic start event. Idle event sessions remain alive for later input.
- Explicit worker commands for run mode, input, acknowledgements, and heartbeat. The runner watchdog terminates a nonresponsive worker while allowing healthy idle/waiting sessions to outlive the sequential deadline.
- Whole-session failure/cancellation, structured asynchronous tracebacks, and separate originating emit locations for overload detected during dispatch. Hard Stop and restart discard previous worker/input state.
- A [cooperative Python fixture](../tests/fixtures/events/cooperative.py) demonstrating two handlers, shared state, and an awaited helper returning a value.

The scheduling decision, API semantics, exact limits, and remaining editor gate are recorded in the [event runtime prototype](event-runtime-prototype.md). Startup emissions retain FIFO order ahead of the runtime's start event. Payload trees do not preserve aliases; whole-number payload values must fit the exact JavaScript integer range. These are event-boundary rules, not changes to ordinary Python values.

Evidence: [manual-clock scheduler tests](../tests/python/test_events.py), [async execution/error tests](../tests/python/test_execution.py), [runner/host boundary tests](../tests/unit/runner.test.ts), and [real-browser runtime tests](../tests/e2e/event-runtime.spec.ts). The browser harness serves the actual runner source with types removed and uses the production worker. It adds no test-only interface to the app. It verifies a healthy session beyond ten seconds, host payload isolation, concurrent waits, cancellation after failure, queue/task overload, automatic watchdog termination of an infinite loop, Stop, and a clean restart.

Validation: `pnpm check` passes with **80 TypeScript tests, 30 native Python tests, type checks, and production build**. All **27 Chromium/Pyodide browser tests pass**, including the 21 existing language/editor/drawing flows and 6 event-runtime scenarios. Native tests used local Python 3.9.6; the browser uses bundled Python 3.14.2. No remote CI run is claimed. Vite's existing bundle-size advisory remains.

At the end of Batch 4a, P4 remained open pending handler/compiler/editor integration. Batch 4b below closes that gate.

## Batch 4b — Event language and editor integration

Implemented on 2026-10-07:

- Named handler roots with one scoped payload parameter and saved delivery order independent of block placement. Handler-only projects can run; Program startup initializes state before registration and dispatch.
- Emit and explicit wait blocks, async function metadata, awaited statement/value calls, and diagnostics for invalid wait/call contexts. Existing synchronous functions stay synchronous.
- A handler manager for creation, rename, payload editing, duplication, deletion, and order changes. Handler copies receive fresh function/parameter/local identities and append to delivery order. Handler locals use the existing variable editor.
- Version-4 projects preserving async and handler metadata, with versions 1–3 still readable. Signature, copy, deletion, and ordering edits survive Undo/Redo and reload.
- Compiler-selected event mode, persistent idle sessions, a test-event form enabled after readiness, and export notes describing the event host requirement.
- Mapped failures after awaits and originating send-block attribution for delayed task overload. Editing during a run retains the earlier revision's attribution; failure, Stop, and watchdog termination disable host input.
- Immediate reload after Undo/Redo now saves the current model on page exit. Run and Export refresh the current compilation before use; duplicate notifications retain the same revision. Recovery mode still preserves incompatible saved input.
- Creation and initial placement now form one undo action for both functions and handlers. Toolbox manager buttons use Blockly's supported callback key.

Evidence: [event compiler/scope/persistence tests](../tests/unit/events.test.ts), [event editor browser flows](../tests/e2e/events.spec.ts), [function creation Undo regression](../tests/e2e/functions.spec.ts), and [portable event projects](../tests/fixtures/events/). The existing runtime, language, collection, drawing, and recovery tests remain part of the gate.

Validation: `pnpm check` passes with **89 TypeScript tests, 30 native Python tests, type checks, and production build**. All **38 Chromium/Pyodide browser tests pass**, including 11 event-editor flows. Handler manager and executed event-project screenshots were visually inspected. Native tests used local Python 3.9.6; the browser uses bundled Python 3.14.2. No remote CI run is claimed. Vite's existing bundle-size advisory remains.

At the end of Batch 4b, P4 was complete for the explicit cooperative event contract; P5–P6 remained open. Later batches below close those gates. Sprite/device event sources are separate library work.

## Batch 5 — Reusable function modules

Implemented on 2026-10-07:

- Versioned local module bundles with public function/parameter identities, private helper closure, immutable revision pins, explicit dependency imports, and acyclic module graphs. Direct and mutual function recursion remain supported.
- Project-embedded copies that work offline. Import validates structure, scope, signatures, dependencies, and generated code before mutation. Conflicting pins, unavailable dependencies, unsupported versions, and hidden project globals are rejected without replacing work.
- Qualified statement/value calls, separate Python module namespaces, explicit imported async helpers, and preserved native collection aliasing. Namespace collisions, shadowing, unresolved references, and mismatching signatures produce preflight diagnostics.
- Compiler artifacts now carry generated module files and source maps with module identity. The runtime loads ordinary Python modules from those captured sources, scopes import caches to the execution, and preserves imported traceback and emit-origin locations.
- A Modules manager with export selection, persistent authoring identity, import preview, namespace editing, exact-copy re-export, removal/Undo, and read-only inspection of blocks and Python, including dependencies.
- Clipboard behavior that retains an existing binding in the same project, translates to an available identical pin/signature across projects, and preserves unavailable references instead of binding to same-named replacements. Explicit reimport can restore an unambiguous missing binding.
- Version-5 projects with versions 1–4 still readable. Module calls, arguments, pins, aliases, and authoring selections survive save/reload and Undo/Redo.
- Python source ZIPs containing the exact main/module files, filename-to-pin manifest, and runtime requirement note. Single-file projects retain their existing Python export. The ZIP dependency is pinned to fflate 0.8.3.
- Portable arithmetic, dependency-chain, missing-import, error, and async-module fixtures.

Evidence: [module semantics and durability tests](../tests/unit/modules.test.ts), [module loader/async/error tests](../tests/python/test_execution.py), [module browser flows](../tests/e2e/modules.spec.ts), and [portable fixtures](../tests/fixtures/modules/). The [module contract](reusable-modules.md) records the implemented format, scope, limits, recovery rules, and source export behavior.

Validation: `pnpm check` passes with **102 TypeScript tests, 35 native Python tests, type checks, and production build**. The full **45-test Chromium/Pyodide browser suite passes**, including seven module flows. The module manager and read-only inspector screenshots were visually inspected. Native tests used Python 3.9.6; Pyodide uses bundled Python 3.14.2. No remote CI run is claimed. Vite's existing bundle-size advisory remains.

P5 meets the local reuse gate. P6 is still required: synchronous function references, dynamic calls, higher-order examples, and expression-bodied lambdas with scope and persistence.

## Batch 6a — Synchronous function values

Implemented on 2026-10-07:

- Local and imported synchronous function references with stable function/import/pin identities, palette entries, rename updates, and unresolved-reference recovery.
- Dynamic statement/value calls with a callable input and 0–100 positional arguments. Their editor preserves the callable, retains removed expressions and shadows as drafts, and restores connections with Undo.
- Native function objects and calls: assignment, passing, returning, collection storage, object identity, and left-to-right evaluation without callable wrappers. Dynamic arguments remain positional across target signature edits.
- Dependency collection through references as well as direct calls. A public factory can return a private helper, and an exported wrapper can return a function from a pinned dependency.
- Scope/shadowing validation and explicit rejection of async/handler values. Native arity and non-callable errors retain Python details and statement attribution.
- Reference copying, definition self-reference remapping, module namespace edits/removal, Undo/Redo, file persistence, and reload.
- Version-6 projects/modules with older project versions and embedded version-5 module contents preserved.
- A deserialization recovery fix: rejected block metadata now restores Blockly's Undo-recording flag, event group, and workspace load cleanup. A malformed upload no longer disables subsequent Undo.
- Portable reference, higher-order, and imported-factory examples, plus the [function-value contract](function-values.md).

Evidence: [unit/native behavior cases](../tests/unit/function-values.test.ts), [browser editor/Pyodide flows](../tests/e2e/function-values.spec.ts), and [saved examples](../tests/fixtures/function-values/). The browser recovery test imports invalid argument metadata, edits the still-open project, undoes that edit, and runs successfully. Screenshots of executed references and the argument editor were inspected; arguments use a vertical layout to keep ordinary calls within the workspace width.

Validation: `pnpm check` passes with **114 TypeScript tests, 35 native Python tests, type checks, and production build**. All **52 Chromium/Pyodide browser tests pass** on the final build, including seven function-value flows. Native tests use Python 3.9.6; Pyodide uses Python 3.14.2. No remote CI run is claimed. Vite's existing bundle-size advisory remains.

At the end of Batch 6a, expression lambdas and the final audit remained open. Batch 6b below closes those gates.

## Batch 6b — Expression lambdas and completion audit

Implemented on 2026-10-07:

- Expression lambda blocks with independent scope IDs, ordered parameter IDs, zero to 100 parameters, and native Python function-object behavior. Lambdas can be passed, returned, aliased, stored in collections, and nested without capture.
- A Function values toolbox manager and context-menu form for creation, parameter rename/reorder/removal, and navigation. Changes are atomic Undo actions. Removed parameter reads retain their blocks and labels as unresolved work; Undo restores their bindings.
- Scope-aware parameter choices and diagnostics for project/enclosing-variable capture, free function/module-name shadowing, and invalid async bodies. Explicit synchronous helper calls/references remain available.
- Copy/duplicate remapping for lambda scopes and parameters, including lambdas inside copied named functions. Repeated toolbox creation produces fresh identities; save/load and Undo preserve existing identities.
- Language-version-7 projects and module exports, preserving project versions 1–6 and existing version-5/6 module pins. Module dependency closure includes helper calls and references in lambda bodies; duplicate scope metadata is rejected even in disabled module code.
- Native arity failures and lambda traceback attribution to the containing definition statement. Capture failures remain editable and cannot Run stale code.
- Portable higher-order, parameter-editing, imported-lambda, runtime-error, and capture-error examples.
- A complete C01–C16 and P0–P6 audit. Focused audit regressions cover while/until, nested branches, division/floor division/negative remainder, explicit and failing conversions, fractional range bounds, and lambda alias/collection identity.

Evidence: [lambda semantics and durability tests](../tests/unit/lambdas.test.ts), [browser editing/Pyodide flows](../tests/e2e/lambdas.spec.ts), [sequential audit regressions](../tests/unit/language.test.ts), [portable examples](../tests/fixtures/lambdas/), and the updated [function-value contract](function-values.md).

Validation: `pnpm check` passes with **138 TypeScript tests, 35 native Python tests, type checks, and production build**. All **62 Chromium/Pyodide browser tests pass** against that build, including ten lambda flows. Lambda parameter-form and executed-program screenshots were visually inspected. Native tests use local Python 3.9.6; Pyodide uses Python 3.14.2. No remote CI run is claimed. Vite's existing bundle-size advisory remains.

P6 and the final audit are complete. The [completion audit](core-language-completion-audit.md) records every requirement, phase gate, cross-cutting guarantee, and explicit supported-subset boundary.

## Status against the plan

| Phase | Status | Gate evidence |
| --- | --- | --- |
| P0 | Implemented and verified | Batch 1 compilation/persistence contracts and procedure compatibility spike. |
| P1 | Implemented and verified | Sequential fixtures, browser error/lifecycle flows, and final audit regressions. |
| P2 | Implemented and verified through Batch 2b | Scope, signatures, copy, Undo, and migration fixtures. |
| P3 | Implemented and verified in Batch 3 | Native collection behavior, error attribution, and editor durability. |
| P4 | Implemented and verified through Batch 4b | Manual-clock scheduling, async editor flows, overload, Stop/watchdog, and restart. |
| P5 | Implemented and verified in Batch 5 | Pinned dependency transfer, namespaces, recovery, source attribution, and durability. |
| P6 | Implemented and verified through Batch 6b | Function values, lambda scopes/editing/durability, module integration, and the final C01–C16 audit. |

All required gates in the core implementation plan are verified. This completes the defined core language subset; the wider product's libraries, asset tools, and editor work remain separate.

## Procedure compatibility findings

The public package metadata for `@blockly/block-shareable-procedures` 13.3.0 declares `blockly: ^13.2.0`, which includes our pinned Blockly 13.3.0. The app now uses its procedure models and serializer infrastructure with project-owned blocks, parameter naming, scope rules, and atomic signature edits.

The executable spike showed that shared backing variables do not provide Python parameter scope and that native delete/insert parameter events do not preserve reordering through undo. The standard plugin call blocks also dispose themselves when a definition is deleted. Our adapter therefore owns those semantics, while retaining model/parameter IDs and serializer integration. Legacy generators remain available for reading/characterizing old workspaces; the new palette and migrated version-1 projects use scoped blocks.

Sources: [package metadata](https://registry.npmjs.org/@blockly%2Fblock-shareable-procedures/13.3.0), [official procedure integration guide](https://docs.blockly.com/guides/create-custom-blocks/procedures/using-procedures/).

## Current technical limits

- Error mapping identifies statement blocks; expression-level locations and stepping remain future work.
- The editor uses dynamic core values and Python runtime errors; no complete static type or definite-assignment analysis is claimed.
- Sequential runs have a 10-second deadline. Event sessions remain active until Stop or failure and use a heartbeat watchdog; ordinary loops never yield automatically.
- Local project import is intended for the user's own code. The previously documented isolation work remains necessary before public untrusted sharing.
- Browser storage is local to the origin/profile. Project files are the portable editor format; Python source archives preserve module files but do not include the playground runtime or host.
