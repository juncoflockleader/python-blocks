# Core language completion audit

Date: **2026-10-07**. **P0–P6 meet the acceptance gates in the [core language implementation plan](core-language-implementation-plan.md).** The supported C01–C16 subset now includes sequential programs, scoped functions, collections, cooperative events, reusable modules, function values, and expression lambdas. Each feature includes the editor interactions, persistence, and diagnostics required by that plan.

This conclusion applies to the defined editor subset. It does not imply full Python coverage or completion of the wider creative coding product. The [feature survey](research/block-programming-feature-survey.md) separately tracks libraries, creation tools, and editor capabilities; sprites, sound creation, stage/level authoring, and full debugging remain outside this gate.

## Verification record

The final local verification ran against the complete working tree, including the Batch 6b compiler validation and audit regressions:

| Command or check | Result |
| --- | --- |
| `pnpm check` | Type checking, **138 TypeScript tests**, **35 native Python tests**, and production build passed. Some TypeScript tests also execute generated programs in native Python. |
| `pnpm test:e2e` after that build | **62 Chromium/Pyodide tests passed**, covering the actual editor and runtime. |
| Native interpreter | Local Python **3.9.6**. |
| Supported browser interpreter | Pyodide **314.0.7**, bundled Python **3.14.2**. |
| CI configuration | Python **3.14.2**, with native and browser checks in [the workflow](../.github/workflows/ci.yml). A remote CI run is not claimed. |
| Visual checks | Function, collection, event, module, dynamic-call, and lambda editor screenshots inspected during their batches. |

Vite reports the existing large JavaScript bundle advisory. No failed required check remains. These checks establish the tested supported behaviors; they are not a proof about every possible Python program or browser configuration.

## C01 through C16 coverage

The compiler owns language validation and Python generation in [compiler.ts](../src/language/compiler.ts). Core blocks live in [src/blocks/core](../src/blocks/core/); the evidence below names the behavior exercised, rather than relying only on generated-source snapshots.

| Requirement | Implemented behavior | Acceptance evidence |
| --- | --- | --- |
| **C01 Ordered statements and entry points** | One Program body controls startup order; definitions are hoisted in stable order; loose stacks remain drafts. Handler-only projects also have an entry point. | [Language cases](../tests/unit/language.test.ts) move roots without changing generated behavior and reject duplicate Program roots. [Project cases](../tests/unit/project.test.ts) preserve drafts and require explicit legacy multi-stack order. [Event browser flows](../tests/e2e/events.spec.ts) run handler-only projects. |
| **C02 Values and operators** | Exact numeric text, precedence, `/`, `//`, modulo, power, comparisons, truthiness, short-circuit operand results, explicit conversions, text joining, and `None`. | [Language cases](../tests/unit/language.test.ts) execute large integers, grouping, failing short-circuit alternatives, division/remainder, conversions and conversion failures. [Browser language flows](../tests/e2e/language.spec.ts) preserve mixed-type comparisons and report native errors. |
| **C03 Branching** | Nested `if`/`elif`/`else` uses Python truthiness; empty bodies emit `pass`; required conditions remain required. | [Language cases](../tests/unit/language.test.ts) exercise nested branches, truthy `elif`, condition failures, and statement mapping. |
| **C04 Repetition** | Repeat without hidden integer coercion; stop-exclusive range with step; while/until; iteration; break/continue. Ordinary loops do not yield implicitly. | [Language cases](../tests/unit/language.test.ts) execute while/until, descending range, continue/break, zero step, fractional bounds, and repeat edge cases. [Browser flows](../tests/e2e/language.spec.ts) reject fractional repeat counts and Stop an infinite loop. |
| **C05 Mutable variables** | Case-sensitive identifiers, explicit assignment, no synthetic initialization, and native unbound-read errors. | [Language cases](../tests/unit/language.test.ts) preserve read-before-assignment errors. [Copy/naming cases](../tests/unit/copy.test.ts) preserve same-scope `count`/`Count` through rename, Undo, and reload. |
| **C06 Local state and scope** | Project, function-local, parameter, handler-payload, and lambda-parameter identities; selective `global` only for explicit project rebinding. | [Function cases](../tests/unit/functions.test.ts) isolate same-named locals, test conflicting bindings and conditional `UnboundLocalError`, and preserve legacy scope. [Lambda cases](../tests/unit/lambdas.test.ts) reject unsupported capture and retain unavailable reads. |
| **C07 Lists and nested collections** | Native lists, aliases, nesting, mutation through parameters, length, zero/negative indexing, deletion, membership, iteration, and shallow copy. | [Collection cases](../tests/unit/collections.test.ts) execute identity/mutation and failure cases. [Browser collection flows](../tests/e2e/collections.spec.ts) run the portable example and preserve item edits through Undo. |
| **C08 Dictionaries and records** | Native key/value dictionaries, lookup/set/delete, `.get` with explicit default, membership, key iteration, nesting, and shallow copy. | [Collection cases](../tests/unit/collections.test.ts) test duplicate keys, eager defaults, native errors and aliasing. [Browser flows](../tests/e2e/collections.spec.ts) exercise pair editing, recovery of removed values, Undo, and mapped `KeyError`. |
| **C09 Named procedures** | Top-level named definitions, stable-ID statement calls, forms, navigation, rename, duplication, deletion/recovery, and recursion-aware copy. | [Function cases](../tests/unit/functions.test.ts), [copy cases](../tests/unit/copy.test.ts), and [browser forms](../tests/e2e/functions.spec.ts) verify targets survive rename/Undo/reload and copies receive independent identities. |
| **C10 Parameters** | Positional parameters with stable IDs; direct-call argument bindings survive rename/reorder; removed work stays recoverable. | [Function cases](../tests/unit/functions.test.ts) preserve connected arguments including shadows. [Browser forms](../tests/e2e/functions.spec.ts) edit signatures, Undo, save/reload, and execute the restored program. |
| **C11 Returned values and predicates** | Value calls, value/bare returns, early return, and native fallthrough `None`. Predicates use ordinary function values/results. | [Function cases](../tests/unit/functions.test.ts) exercise returns, nesting, fallthrough, and mapped return-expression failures. [Function-value cases](../tests/unit/function-values.test.ts) pass and return functions. |
| **C12 Recursion** | Direct and mutual function recursion with ordinary CPython limits and traceback details. Copies remap self references. | [Function cases](../tests/unit/functions.test.ts) execute recursive results and runaway `RecursionError`. [Copy cases](../tests/unit/copy.test.ts) preserve self-calls; [module cases](../tests/unit/modules.test.ts) export mutually recursive helpers. |
| **C13 First-class and anonymous procedures** | Native synchronous local/imported function references, dynamic statement/value calls, higher-order use, expression lambdas, and editable lambda parameters. | [Function-value cases](../tests/unit/function-values.test.ts) check identity, evaluation order, arity/non-callable failures and module transfer. [Lambda cases](../tests/unit/lambdas.test.ts) cover scope, parameter edits, copy, aliasing, nesting and errors. [Browser flows](../tests/e2e/lambdas.spec.ts) execute the planned `6`, `4` example and test creation, Undo, reload, imported lambdas and capture failures. |
| **C14 Events and handlers** | Named handlers, saved registration order, scoped payloads, FIFO emission, per-receiver snapshots, initialization before readiness and one start event. | [Manual-clock runtime cases](../tests/python/test_events.py) verify order, no-yield emission, independent deliveries, start behavior and payload rules. [Event language cases](../tests/unit/events.test.ts) and [editor flows](../tests/e2e/events.spec.ts) verify forms, order changes, copying, scope and persistence. |
| **C15 Waits, concurrency and cancellation** | Explicit cooperative async calls/waits; independent handler tasks; shared project state; bounded queues/tasks; fail-session errors; persistent idle lifetime; watchdog, Stop and fresh restart. | [Runtime cases](../tests/python/test_events.py) prove progress at yield points and peer cancellation. [Real Pyodide runtime flows](../tests/e2e/event-runtime.spec.ts) and [editor flows](../tests/e2e/events.spec.ts) cover idle sessions beyond ten seconds, overload, non-yielding execution, watchdog/Stop and restart. |
| **C16 Reusable definitions** | Local immutable module pins, public signatures/private helper closure, acyclic dependencies, qualified calls, separate namespaces, import/export, inspection, and recovery. | [Module cases](../tests/unit/modules.test.ts) test transfer, pins/conflicts, scope, dependencies, aliases, copy and recursion. [Execution cases](../tests/python/test_execution.py) verify cache isolation and imported tracebacks/async calls. [Browser module flows](../tests/e2e/modules.spec.ts) transfer between projects and inspect/export/reload. Function-reference and lambda cases additionally prove dependency closure through values. |

## Phase exit gates

| Phase | Gate resolution |
| --- | --- |
| **P0 Contract and foundation** | Starter drawing remains covered by [app browser tests](../tests/e2e/playground.spec.ts). Compilation/version/source-map/project contracts have behavioral fixtures. The [procedure-model spike](../tests/unit/procedure-model.test.ts) records upstream identity/Undo limitations; the project-owned adapter resolves them in the function and copy suites. |
| **P1 Sequential foundation** | Ordered roots, native values/control flow, preflight failures and native exceptions pass. An invalid edited project cannot Run stale previously valid code. |
| **P2 Functions and scope** | Independent locals, returns/recursion, selective rebinding, ID-based signature changes, deletion, copy, Undo/Redo, migration and reload pass. |
| **P3 Collections** | Native aliases/nesting/shallow copy and collection errors execute in native Python and real Pyodide; list/dictionary editor changes preserve learner expressions. |
| **P4 Events** | Manual-clock scheduling, runtime boundaries and actual editor lifecycle pass. The [event contract](event-runtime-prototype.md) records the chosen cooperative policy and exact limits. |
| **P5 Modules** | Export/import between projects preserves behavior and pins. Conflicts and missing dependencies remain recoverable. Source archives retain the exact module files and runtime requirements. See [module contract](reusable-modules.md). |
| **P6 Function values** | Named/imported references, higher-order calls, expression lambdas, editing/durability, scope restrictions and failure attribution pass. See [function-value contract](function-values.md). This audit closes the final cross-feature gate. |

## Cross-cutting guarantees

- **Preview, Run and Export agree.** [main.ts](../src/main.ts) refreshes and captures one compilation artifact. Source maps cover nested statements, hoisted definitions and generated modules. Runtime errors after edits retain the earlier revision, verified in the event browser suite. Expression errors fall back to their containing statement; full expression stepping is not claimed.
- **Edits preserve identities and recoverable work.** [Function models](../src/language/functions.ts), [lambda models](../src/language/lambdas.ts), [clipboard handling](../src/language/clipboard.ts), and module events preserve bindings through ordinary save/load and Undo. Duplication deliberately allocates independent owned IDs. Dynamic-call arguments stay positional; direct calls retain parameter-ID bindings.
- **Persistence is transactional.** [Project loading](../src/project/index.ts) preflights in an isolated workspace, accepts project language versions 1–7, and preserves incompatible saved input. Modules accept language versions 5–7 without rewriting existing pins. Rejected metadata restores editor Undo state. Browser tests verify that subsequent edits, Undo and execution still work.
- **The runtime remains authoritative.** Values are native Python objects; source files reconstruct them on every Run. Saved projects do not serialize a live heap, function object, closure or task. Explicit event payload snapshots are a separately documented boundary.
- **Lifecycle and limits remain effective.** [Runner cases](../tests/unit/runner.test.ts), Python boundary cases and browser tests cover fresh workers, stale messages, startup/sequential deadlines, persistent event sessions, bounded payload/output/task handling and hard termination.

The audit added focused regressions for while/until truthiness, nested branches, division/floor division/negative remainder, explicit and failing conversions, fractional scoped range bounds, lambda alias/collection identity, and duplicate scope IDs in disabled module code. These close concrete coverage gaps in the earlier batches.

## Supported limits and separate work

The accepted language subset uses top-level positional named functions and synchronous function values. It deliberately excludes nested named definitions, lexical closure capture, multi-statement anonymous functions, async function values, keyword/default/variadic parameter blocks, classes, comprehensions, generators, exception-handling blocks, decorators and arbitrary imports. Native Python exceptions still describe invalid supported operations.

The delivered event API uses explicit yielding; it does not promise parallel threads, automatic loop yields, broadcast-and-wait or per-task cancellation controls. Project/module files are local editable formats. Exported Python using playground APIs still needs the runtime and host; source ZIPs do not bundle a standalone launcher.

Expression-level debugging, editable arbitrary Python, text-to-block conversion, sprites and device event sources, sound/asset creation, scene/level tools, accounts, cloud sharing and untrusted-code isolation remain separate workstreams. None was required to close the core implementation plan.
