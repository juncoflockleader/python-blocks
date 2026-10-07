# Core language implementation plan

Date: **2026-10-07**. Status: P0–P6 implemented for the supported subset, including expression lambdas in Batch 6b. The [completion audit](core-language-completion-audit.md) maps C01–C16 and every phase to code and behavioral evidence; [implementation progress](implementation-progress.md) records each delivered batch. This document retains the implementation sequence and acceptance contract.

This plan turns **C01–C16** from the [feature survey](research/block-programming-feature-survey.md#c--core-language-16-entries) into an implementation sequence for Python Blocks. It follows the [Python-first design](initial-design.md): blocks are a visual syntax for real Python, and CPython remains the interpreter.

**Recommended order:** establish a precise language contract and diagnostics; complete statements and control flow; make functions and scope dependable; add collections; prove events and cooperative execution; then add reusable modules and advanced function values.

The first useful milestone is a complete **sequential language** with functions and collections. Event-driven programming is a subsequent milestone with its own execution contract. Neither requires building sprites, sound tools, or a level editor first.

For planning, use three delivery milestones: **sequential programming** (P0–P3), **interactive programs** (P4), and **reusable abstractions** (P5–P6). Every batch includes the editor interactions, persistence, and diagnostics needed for its language features. Section 3 maps the survey to these batches, section 8 defines their exit gates, and section 10 details the final function-value batch. Implementation evidence belongs in the separate [progress log](implementation-progress.md).

This is a supported subset of Python, not an attempt to expose every Python construct as a block. The initial palette excludes classes, exception-handling blocks, comprehensions, generators, pattern matching, decorators, and arbitrary imports. Those can be considered after the milestones here; ordinary Python exceptions still report failures from the supported operations.

## 1. Scope and completion criteria

The core-language work includes block definitions, Python generation, symbol/scope handling, execution semantics, and the minimum editor support needed to use them correctly. A function is not complete merely because a `def` statement can be emitted: naming, arguments, calls, scope, errors, and saving must work together.

A feature is complete when:

1. Its blocks and generated Python express the same behavior.
2. Positive examples and relevant failure cases execute correctly on the supported runtime.
3. Editing, renaming, copying, undoing, and saving preserve its meaning where applicable.
4. Errors identify the responsible block or, when that is impossible, the relevant Python location.
5. A small example demonstrates the feature without depending on unfinished graphics libraries.

The existing pen library and printed output are enough for early examples. Asset creation, sprite physics, accounts, full debugging/stepping, and editable Python are separate workstreams. We will preserve source identity for future debugging and text editing without promising arbitrary Python-to-block conversion.

## 2. Current foundation and maintenance guarantees

Working tree inspected on 2026-10-07: [block registration](../src/blocks/index.ts), [compiler](../src/language/compiler.ts), [project persistence](../src/project/index.ts), [workspace setup](../src/main.ts), [worker](../src/runtime/python.worker.ts), and [runner](../src/runtime/runner.ts). Dependencies are pinned in [package.json](../package.json). This includes local work beyond the original scaffold; current verification is recorded in the progress log.

| Area | Present today | Guarantee to preserve |
| --- | --- | --- |
| Statements and expressions | Explicit Program root, exact number literals, Python operators/conversions, conditions, range/iteration, break/continue | Layout-independent execution and native Python semantics. |
| Functions | Scoped definitions/calls, stable IDs, signature editing, copying, undo, returns, recursion, explicit async, qualified module calls, expression lambdas, and migration | Scope, signature, copy, Undo, and identity guarantees. |
| Python execution | Real Pyodide/CPython; structured exceptions; sequential/event mode; generated Python modules with separate namespaces | Native function objects, calls, evaluation order, and exceptions. |
| Cancellation | Worker termination, stale-worker filtering, sequential deadlines, event watchdog, and editor lifecycle tests | Responsive Stop/watchdog and fresh state after restart. |
| Collections | Native lists/dictionaries, aliases, nested values, shallow copy; scoped bounded event-payload snapshots | Native aliases and shallow-copy behavior across calls. |
| Project structure | Version-7 JSON, autosave, file save/open, scoped identities, async/handler metadata, pinned modules, lambda parameters, and legacy migration | Preserve older projects and pinned module contents. |
| Diagnostics | Scope/context/input errors; statement source maps; mapped async failures, emit origins, and imported-module locations | Captured-revision attribution, useful dynamic-call errors, and explicit capture diagnostics. |

Several inherited defaults require deliberate adaptation. The original Blockly 13.3.0 generators supplied automatic `None` initialization, broad procedure `global` declarations, repeat-count integer conversion, and empty-input fallbacks. The current compiler removes learner-variable initialization, uses native repeat semantics, and validates required inputs. The new function blocks use scoped symbols and selective globals; legacy projects migrate their original bindings instead of silently adopting new ones.

The [language fixtures](../tests/unit/language.test.ts) characterize inherited behavior and test the sequential foundation. They do not establish conformance of the full planned language. Preserve existing projects through explicit migrations as scope and procedure semantics change.

## 3. Feature coverage and delivery order

The current position describes the inspected working tree. Phase membership defines the full acceptance gate; partial availability does not make a phase complete.

| Survey ID | Capability | Current position | Planned increment | Completion example |
| --- | --- | --- | --- | --- |
| C01 | Ordered statements and entry points | Explicit Program root; loose stacks are inactive drafts | P0–P1 | Moving stacks on screen never changes execution order. |
| C02 | Values and operators | Python operators, exact literal text, truthiness, and conversions | P1 | Precedence, conversions, truthiness, and short-circuiting match shown Python. |
| C03 | Branching | `if` family available | P1 | Nested `if`/`elif`/`else` selects the expected branch. |
| C04 | Repetition | Repeat, while/until, range, iteration, break/continue | P1 | Range, iteration, break/continue, and invalid bounds behave predictably. |
| C05 | Mutable variables | Case-sensitive scoped variables; no synthetic initialization | P1, completed with P2 | Assignment and read-before-assignment behave like the displayed program. |
| C06 | Local state and scope | Project, parameter, and function-local symbols; durable copy/rename/undo | P2 | Two functions can use independent locals named `count`. |
| C07 | Lists and nested collections | Native list operations, aliases, nested values, and shallow copy | P3 | A function takes a list, mutates it, and returns a computed value. |
| C08 | Dictionaries/records | Native key operations, defaults, iteration, and pair editing | P3 | Key lookup/update and a missing-key error map to their blocks. |
| C09 | Named procedures | ID-based definitions and calls; copy/rename/delete/undo covered | P2 | Rename a definition; every call remains connected to it. |
| C10 | Parameters | Stable IDs and signature editing; rename/reorder/removal undo covered | P2 | Reordering parameters preserves arguments by identity. |
| C11 | Returned values and predicates | Statement/value calls, bare/value returns, native fallthrough | P2 | A returned value feeds arithmetic or a condition; early return works. |
| C12 | Recursion | Direct/mutual recursion and runaway errors covered in native tests | P2 | Recursive factorial succeeds; runaway recursion gives a useful error. |
| C13 | First-class/anonymous procedures | Synchronous named/imported values, dynamic calls, and scoped expression lambdas | P6 | Pass a function to another function and call it through a variable. |
| C14 | Events/messages/handlers | Handler roots, saved order, payload scope, emission, and host input verified | P4 | Two handlers receive a named event with specified ordering and payload behavior. |
| C15 | Waits/concurrency/cancellation | Explicit async/waits, failure cancellation, idle lifetime, Stop/restart, and watchdog verified through editor | P4 | Two independent handlers progress; Stop also handles a non-yielding loop. |
| C16 | Reusable custom block libraries | Pinned local bundles, dependency closure, qualified calls, inspection, and import/export verified | P5 | Import a saved function module without breaking names or dependencies. |

## 4. Proposed language contract

These are recommended implementation decisions. Changes during implementation should update this document, the compatibility version, and the corresponding behavioral tests together.

### Program structure and order

- Introduce one **Program** root containing the sequential startup statements. It emits module-level Python, not an implicit function with different scope.
- Function definitions are separate top-level blocks. Emit them before startup statements. Their order is stable and independent of screen coordinates.
- Executable statements outside the Program root or a function/handler body are inactive drafts, visibly marked as such. Detached expressions do not execute just because they sit on the workspace.
- Allow at most one Program root. Function-only projects can be saved; Run requires Program or an active event handler as an entry point.
- Keep import declarations controlled by the block/library integration. User-facing arbitrary imports are outside this first subset.

Migration matters: automatically wrap the existing square's single statement stack. For older workspaces with several loose executable stacks, preserve the old workspace and provide an explicit ordering preview before conversion. Do not infer permanent program order from where the learner happened to drag blocks.

### Values, operators, and control flow

Start with Python `int`, `float`, `bool`, `str`, and `None`, then add lists and dictionaries in P3. Use dynamic values; block connection hints help construction but are not a replacement runtime type system.

| Concern | Proposed rule |
| --- | --- |
| Arithmetic | Generate Python operators, including distinct `/` and `//`, modulo, and exponentiation. Preserve precedence. |
| Numeric literals | Preserve intended integer values without silently rounding through JavaScript's number representation. Validate literal text; reject unsupported special numeric inputs clearly. |
| Conditions | Follow Python truthiness. `and`/`or` short-circuit and may return operands; do not promise they always produce Boolean values. |
| Conversion | Provide explicit `int`, `float`, `str`, and `bool` blocks. String concatenation does not silently turn arbitrary values into text. |
| Convenience text joining | If retained, label conversion in the block, for example “join as text,” and show the corresponding `str(...)` operations. |
| Repeat | Emit `for ... in range(count)` without hidden `int(count)`. A float count raises the Python error unless the learner explicitly converts it. |
| Range | Use start-inclusive, stop-exclusive bounds; support a step. Label the stop bound accordingly. |
| Other loops | Support `while`, `for each`, `break`, and `continue`. “Until” may remain a visible shorthand for `while not ...`. |
| Empty bodies | Emit `pass` for an intentionally empty statement body. |
| Missing values | A disconnected required input is a preflight error. A visible shadow/default block is an actual value, not a hidden fallback. |
| Invalid operations | Preserve Python error types and explain them. Do not quietly replace division by zero, invalid conversion, or invalid indexing with a default. |

The compatibility reference is Python's documented [expressions](https://docs.python.org/3/reference/expressions.html) and [control flow](https://docs.python.org/3/tutorial/controlflow.html). The editor subset is narrower than Python; it should not redefine operations it does expose.

### Variables and scope

Use stable symbol IDs internally and human-readable Python identifiers in code. Names shown on blocks should match emitted names; offer an explicit correction for an invalid name rather than silently changing it during generation. Prevent collisions with Python keywords and reserved runtime/helper names.

The initial scope model has **module variables, function parameters, and function-local variables**. Conditionals and loops do not introduce a new scope. Nested function definitions and `nonlocal` can wait for advanced work.

- Creating a variable in the editor does not initialize it. Assignment blocks supply values; remove synthetic `name = None` declarations for learner variables.
- A function's ordinary assignment creates or updates a local. Reading an unshadowed module variable is allowed.
- An explicit “set project variable” action emits a `global` declaration only where rebinding requires it. Mutating an existing list/dictionary does not itself require `global`.
- A local and a module variable may have the same spelling in different scopes. Within a function, reject a selection that would require both meanings of that spelling to be accessible simultaneously; offer renaming. Do not generate code that contradicts Python name resolution.
- Analyze obvious unbound reads, but do not claim a complete static type or definite-assignment checker. Runtime errors remain authoritative for paths the analyzer cannot prove.

These choices follow Python's [binding and scope rules](https://docs.python.org/3/reference/executionmodel.html). A scope-aware variable picker and symbol model are essential editor dependencies for C06.

### Named functions, parameters, returns, and recursion

Implement top-level `def`, positional parameters, calls, `return value`, and bare `return`. Defer defaults, keyword-only parameters, variadic arguments, decorators, and type annotations from the initial palette.

A command call is a statement; a value call is an expression. Both invoke ordinary Python functions. A function that falls through returns `None`; the editor can warn about a missing return path without inventing a different runtime rule. Predicate functions are ordinary functions whose intended result is Boolean, not a separate execution mechanism.

Each function and parameter needs an identity independent of its name and position. Signature edits must preserve call arguments by parameter ID. Removing a parameter must leave disconnected argument blocks recoverable, group the edit into one undo action, and never delete learner work silently. Deleting a definition leaves affected calls visibly unresolved until repaired or undone.

Recursion should work through normal Python calls, including mutual recursion between top-level definitions. Do not raise the interpreter's recursion limit to conceal errors. Preserve a concise call trace and map relevant frames back to definitions/calls.

Blockly's [procedure data-model guidance](https://docs.blockly.com/guides/create-custom-blocks/procedures/creating-custom-procedure-blocks/) provides useful identity and serialization hooks. Evaluate the shareable-procedures plugin against our pinned Blockly version in P0; it does not, by itself, provide our Python scope policy. Reuse it where compatible and keep our semantic rules in an adapter.

Target generated code for the sequential milestone:

```python
def total_up_to(limit):
    total = 0
    for number in range(limit):
        total = total + number
    return total


answer = total_up_to(5)
print(answer)
```

The Program root corresponds to the final two statements. The function block corresponds to the definition. The expected output is `10`; there are no synthetic globals or variable initializers.

### Lists and dictionaries

Use native Python collections. Initial list operations: create, length, index get/set, append, remove by index, membership, and iteration. Initial dictionary operations: create, get/set/delete by key, membership, and key iteration. Support nested collections from the outset rather than storing list-like data in a second custom representation.

Use zero-based list indexing and Python's negative-index behavior. Missing indices/keys retain `IndexError`/`KeyError`; dictionary `.get(key, default)` is a separate operation. Assignment and parameter passing preserve object identity: mutation through an alias affects the same collection. Provide an explicit shallow-copy operation when introduced, and explain nested sharing. [Python data structures](https://docs.python.org/3/tutorial/datastructures.html)

Do not turn arbitrary runtime objects into project JSON. Saving preserves blocks, symbols, and literal content; it does not snapshot a live Python heap.

## 5. Events and concurrency: a separate implementation gate

**Decision verified through Batch 4b:** use cooperative Python `async`/`await` for activities that wait, while ordinary calculations remain synchronous. The [event contract](event-runtime-prototype.md) passes manual-clock, actual Pyodide/runner, and editor-level cases. Handler/async blocks, compiler mode selection, persistence, copy/Undo, error attribution, and host input are implemented.

Prototype with printed output, a simulated input event, and a fake clock. A sprite engine is unnecessary to test ordering, fairness, and cancellation.

| Concern | Proposed first contract |
| --- | --- |
| Session start | Load definitions and initialize module state; register handlers; then enqueue one start event. Startup emissions retain their earlier FIFO position. Registrations must have saved order independent of block position. |
| Event dispatch | Queue events in arrival order and enqueue matching handlers in registration order. Completion order is not guaranteed when handlers wait. |
| Repeated events | Each delivery can create a new handler task. Bound active tasks and queued events; report overload instead of silently dropping work. |
| Messages | First support named, fire-and-forget emission. An emit queues work; it does not synchronously call every receiver or implicitly yield. |
| Payloads | Initially use bounded JSON-compatible values, with a separate snapshot for each receiver. Reject unsupported payloads explicitly. This is an event boundary rule, not a restriction on all Python values. |
| Wait | `await events.wait(seconds)` yields; zero seconds also yields. Reject negative/nonfinite durations. No blocking sleep in generated event code. |
| Custom functions that wait | Mark them explicitly asynchronous and emit `await` at their call sites. Diagnose calls from synchronous contexts; do not silently rewrite an entire program. |
| Loops | No invisible yield inserted into every ordinary loop. An interactive indefinite activity must explicitly wait/yield; a non-yielding loop can be terminated. |
| Shared state | Handler locals are independent; module variables are shared. State can change while a handler is suspended. No thread-style parallel execution is promised. |
| Handler error | Fail the session, report the mapped error, and stop remaining tasks. Do not let a failed handler disappear silently. |
| Stop/restart | Hard worker termination remains the reliable fallback. Restart creates a fresh interpreter; old events cannot affect the new run. Cleanup code is not guaranteed after a hard stop. |
| Session lifetime | Sequential programs finish when their body ends. Event sessions stay active until Stop or a fatal error, including while waiting for input. |

Example module fragment generated by handler and wait blocks:

```python
from playground import events


async def announce_start(payload):
    print("ready")
    await events.wait(0.1)
    print("go")


events.on("start", announce_start)
```

The browser host loads this module and awaits a runtime session entry point separately. Do not put `asyncio.run()` inside a running browser event loop or describe a fragment as a standalone executable. A later portable export includes an appropriate launcher. Validate the bridge against [Pyodide's event loop](https://pyodide.org/en/stable/usage/api/python-api/webloop.html) and Python's [task semantics](https://docs.python.org/3/library/asyncio-task.html).

The runtime separates sequential ten-second deadlines from event sessions, with explicit readiness, heartbeat checks, and bounded output/tasks/events. Initial limits are recorded in the [event contract](event-runtime-prototype.md#initial-limits). The editor selects this lifecycle from the compilation artifact; healthy waiting, blocked execution, overload, and restart pass through the actual user flow.

Broadcast-and-wait, per-task cancellation controls, async function values, and automatic scheduling transformations are subsequent refinements. If cooperative execution produces unreadable code or cannot keep the browser bridge responsive, compare a callback/update approach in the same fixtures and record the decision before committing to the public API.

## 6. Reuse and advanced function values

### C16: locally reusable modules

Begin with export/import of **locally authored function modules**, including definition bodies and their dependency closure. Use a manifest with format/language versions, module identity, exported function identities/signatures, and pinned dependencies. Callers use qualified names where needed to avoid collisions.

Require the first module format to avoid hidden dependencies on the importing project's globals. Pass data through parameters or declare an explicit module dependency. Begin with acyclic module dependencies; reject unresolved/cyclic imports with a useful explanation. Keep importing a module separate from executing a project's startup program.

Import a versioned copy, never silently replace it when another project changes. Copy/paste, duplicate import, rename, missing dependency, and signature mismatch are required cases. Public package discovery, arbitrary pip installation, and untrusted shared code belong to later platform/isolation work described in the [architecture](architecture.md).

### C13: function values after ordinary functions are solid

Expose references to named functions as values, assignment/pass/return of those values, and an explicit dynamic-call block. Then add expression-bodied anonymous functions that map cleanly to Python `lambda`. A multi-statement anonymous function needs a different visual representation and is not part of the first increment.

Start with synchronous functions. Calls through variables retain Python's runtime argument checking. Save the source/blocks that construct functions, not live function objects or closures. Nested definitions and closure capture require a separate scope extension with lifetime and serialization examples before exposure.

This sequencing completes the survey's advanced category incrementally without making it a prerequisite for beginner functions.

## 7. Compiler, diagnostics, and project contracts

### One compilation result for preview, execution, and export

Use one compilation result containing the following fields, extending the existing artifact as later phases arrive:

| Field | Purpose |
| --- | --- |
| `source` | Generated main Python module, or no runnable source when structural errors prevent compilation. |
| `files`, `moduleSources` | Generated imported-module files and their pinned identities. |
| `diagnostics` | Stable diagnostic code, severity, explanation, block ID, and optional input/symbol ID. |
| `sourceMap` | Python file/line spans mapped to statement blocks; expression spans where available. Include hoisted definitions and imported modules. |
| `revision` | Identity of the immutable project snapshot that was compiled. |
| `languageVersion` | The supported semantics and migration version. |
| `executionMode` | Sequential or persistent event session, selected from active entry roots. |

Run the exact artifact shown in the preview. Capture its source map with the run so edits cannot cause an old error to highlight an unrelated new block. If the project has changed, show that the error belongs to an earlier revision.

Use preflight errors for malformed structure, unresolved symbols, unsupported blocks, missing required inputs, and invalid call contexts. Use warnings for plausible but unproven issues. Incomplete drafts remain editable and saveable; they cannot launch a stale previously valid program by accident.

Return structured Python exception type, message, and frames from the worker. Map to the narrowest reliable block span, falling back to the containing statement or Python line. Preserve technical details in an expandable view. A language-level failure should never be presented as success.

### Reuse Blockly without inheriting every semantic default

Keep its rendering, connections, serialization, and useful expression-generation machinery. Place scope resolution, entry ordering, validation, and necessary generator overrides in project-owned modules. Introduce a small resolved program description only where those responsibilities need it; a general Python parser or second interpreter is unnecessary at this stage.

Source mapping must survive indentation, helpers, definitions moved before startup, and repeated expressions. Record source spans during emission rather than trying to recover block identity by searching the final source for matching text.

Suggested module boundaries, created incrementally:

| Path | Responsibility |
| --- | --- |
| `src/blocks/core/` | Core block definitions, fields, mutators, and toolbox categories. |
| `src/language/` | Capability registry, symbols/scopes, validation, compilation, diagnostics, and source mapping. |
| `src/project/` | Versioned project envelope, serializer adapters, migration, and local save/load. |
| Existing `src/runtime/` | Structured execution results, cancellation, and later event-session support. |
| `tests/fixtures/language/` | Saved workspaces with expected behavior and error locations. |

These are the intended module boundaries. Consult the progress document for the current implementation.

### Project durability is a prerequisite, not a full platform project

Use a versioned envelope around Blockly JSON containing format version, language version, workspace state, and any scope/procedure state not already owned by registered serializers. Keep one authoritative representation of each symbol; avoid duplicate registries that can drift apart.

Blockly recommends JSON serialization and supports registered serializers for additional models. Its load ordering must be respected when blocks refer to variables/procedures. [Serialization documentation](https://docs.blockly.com/guides/configure/serialization/)

Provide basic local save/load before complex signature editing ships. Preserve unknown-version input for recovery; do not partially load a project and overwrite the original. Full asset bundles, cloud saving, and text-to-block conversion remain outside this core milestone.

## 8. Implementation increments and acceptance gates

| Phase | Work package | Depends on | Exit gate |
| --- | --- | --- | --- |
| **P0 — Contract and foundation** | Characterize current generator behavior; establish capability/version registry, compile result, project envelope, basic statement source maps, and procedure-model compatibility spike. | Existing scaffold | Starter behavior preserved; snapshot reloads; a deliberate runtime error identifies its statement; proposed semantic changes have executable fixtures. |
| **P1 — Sequential foundation** | Program root, values/operators, variables, branching, range/iteration, break/continue, explicit conversions, missing-input validation. | P0 | All exposed sequential blocks follow the contract; layout changes do not change behavior; Run never uses stale valid source. |
| **P2 — Functions and scope** | Scoped symbols/pickers, named definitions/calls, parameter identities, returns, recursion, selective project-variable rebinding, signature editing/undo. | P1 | Local isolation, recursion, rename/reorder/delete/undo, and save/reload pass; no broad synthetic globals remain. |
| **P3 — Collections** | Native lists/dictionaries, mutation, lookup, iteration, aliases, and nested values. | P2 | Collection fixtures and error mapping pass in native Python and real Pyodide. This completes the first sequential-language milestone. |
| **P4 — Event prototype, then implementation** | Validate the proposed scheduling/API contract; implement handlers, waits, event queue, async calls, persistent session lifecycle, and watchdog. | P2; use P3 for payloads | Deterministic fake-clock cases plus real browser responsiveness, overload, non-yielding Stop, and clean restart pass before declaring the API stable. |
| **P5 — Reusable function modules** | Manifest, dependency closure, qualified calls, local module import/export, and migrations. | P2–P3 | A module moves between projects with the same behavior; conflicts and unavailable dependencies are recoverable. |
| **P6 — Advanced function values** | Function references, dynamic calls, higher-order use, then simple lambdas. | P2–P3; integrate P5 format | Pass/return/call functions correctly; invalid calls map to blocks; saved programs reconstruct behavior. |

P5 and P6 do not require a sprite library. P5 now uses P4's explicit async contract and ships a pinned module format; P6 extends that format's dependency closure and identity checks for function references and lambdas.

Each implementation increment should deliver its blocks, semantics, diagnostics, project compatibility, and focused tests together. A growing toolbox without these pieces does not count as progress toward a complete language.

## 9. Verification plan

Use behavioral fixtures, not only string snapshots of generated code. A fixture supplies workspace/project JSON, expected output or exception, and expected source/block attribution. Execute generated code and small hand-written reference programs under the supported Python versions. Seed or isolate randomness when testing it; random-number helpers belong to a library, not the core semantic contract.

| Scenario | Required observation |
| --- | --- |
| Reposition top-level blocks | Same source and effects, apart from editor metadata. |
| Arithmetic and Boolean expressions | Correct precedence; a short-circuited operand with side effects is not evaluated. |
| Repeat/range | Zero/negative counts, positive/negative steps, float count, and zero step behave as documented. |
| Variable used before assignment | Python error preserved; no silent initialization masks it. |
| Two calls using the same local name | Independent state; explicit project rebinding works separately. |
| Signature changed with connected arguments | Rename/reorder preserve identity; removal preserves detached work; undo/reload restores the relationship. |
| Returns and recursion | Nested calls and factorial work; missing return yields `None`; excessive recursion is explained. |
| Aliased/nested collections | Mutation matches Python object identity; shallow copy is not described as deep copy. |
| Invalid collection access | Correct exception type and block attribution. |
| Error after editing during a run | Error remains associated with the compiled revision. |
| Two timed handlers | Both progress at yield points; same-event enqueue order is stable. |
| Event overload and handler failure | Bounded behavior, clear diagnostic, no silent partial session. |
| Non-yielding code and restart | Real browser Stop terminates it; a fresh run receives no stale events. |
| Save/load and module import | Same behavior and identities; incompatible data is preserved for recovery. |

Use TypeScript unit tests for model edits, validation, source maps, and runner state; native Python execution for fast semantic checks; and a focused browser suite for actual Pyodide behavior and editing interactions. Pin the conformance interpreter version in CI to match the supported runtime; broader-version compatibility is a separate promise. The existing native CI Python version alone should not define browser compatibility.

Run the existing `pnpm check` and `pnpm test:e2e` commands for implementation changes, extending their suites as features arrive.

## 10. Final implementation batch: function values and lambdas

Batch 6a delivered named function values and dynamic calls; Batch 6b delivered expression lambdas, scope editing, persistence, and the final audit. All seven steps below are implemented and covered by the [completion audit](core-language-completion-audit.md). The delivered behavior is in [Function values](function-values.md). P5's delivered format and workflow are recorded in the [module contract](reusable-modules.md). P6 completes C13 while retaining Python semantics, stable references, and the existing module/scope guarantees. The table retains the full P6 scope.

| Step | Concrete deliverable | Acceptance case |
| --- | --- | --- |
| 1. Reference named functions | Value blocks for local and imported synchronous functions, bound to stable function/pin identities. Show names without calling the function. | Assign a function to a variable; rename its definition or module namespace; the value still targets the same function. Async/handler references are explicitly excluded from this first increment. |
| 2. Call function values | Dynamic statement/value call blocks with a callable input and positional argument list. Argument editing preserves removed expressions and supports Undo. | Call a function stored in a variable. Wrong arity and non-callable values retain native Python errors and identify the call statement. |
| 3. Prove higher-order behavior | Pass and return functions using existing parameters/returns; preserve function values in ordinary collections. | A helper takes an operation and applies it; another returns an operation; an imported function works in both cases. No hidden callable wrapper changes identity or evaluation order. |
| 4. Extend dependency and scope analysis | Export follows named function references as well as direct calls. Qualified references preserve module pins and respect namespace/local shadowing. | Export a higher-order module whose public function returns a private helper. Transfer it to a fresh project and call the returned function. Missing targets remain diagnosable. |
| 5. Add expression lambdas | A value block mapping to Python `lambda`, with stable parameter IDs, a scoped parameter editor, and an expression body. | Construct, pass, and call a lambda; rename/reorder parameters, copy it, Undo, save, and reload without changing bindings. Reject unsupported capture instead of accidentally introducing closures. |
| 6. Finish persistence and diagnostics | Version/migrate new block metadata and supported module versions; reconstruct function objects by running saved code. Preserve captured-revision error attribution. | Save/reload local, imported, returned, and anonymous function values. Invalid call/scope fixtures fail at useful locations in native Python and real Pyodide. |
| 7. Audit C01–C16 | Review every phase against current code, examples, tests, and actual editor behavior. | All required gates pass; no remaining language feature is counted complete merely because CPython supports it internally. |

Keep the first function-value model synchronous. Do not silently schedule coroutine values. Nested definitions, multi-statement anonymous functions, and lexical closure capture remain a separate scope extension. P6 must make these exclusions visible through validation and the editor's available symbols.

Project files preserve blocks, symbols, and literal data. They do not serialize a live function, module object, closure, or Python heap. Language version 6 introduced references/dynamic calls; version 7 adds lambda scope and parameter metadata. Older project versions and pinned version-5/6 module contents remain readable.

### Function value block and scope design

The proposed blocks expose ordinary Python function objects. Python defines calls, expression lambdas, and left-to-right expression evaluation; generation must preserve these behaviors. [Calls](https://docs.python.org/3/reference/expressions.html#calls), [lambdas](https://docs.python.org/3/reference/expressions.html#lambdas), and [evaluation order](https://docs.python.org/3/reference/expressions.html#evaluation-order).

| Block | Saved model | Generated form and editor behavior |
| --- | --- | --- |
| Named function reference | Function ID; cached signature for unresolved references | `double`; a value block without argument sockets. Renaming refreshes its label. Deletion leaves an unresolved reference. |
| Imported function reference | Import binding ID, module/revision pin, exported function ID | `helpers.double`; retains P5's namespace and dependency rules. |
| Call a function value | Callable input plus an ordered list of argument inputs | `(operation)(value)`; statement and expression forms. Arguments stay positional when a target's signature changes. Removing an input leaves its expression recoverable. |
| Lambda | Anonymous scope ID, ordered parameter IDs/names, one expression body | `lambda value: value * 2`; parameter editing preserves body references by ID. Each duplicate gets fresh scope and parameter IDs. |

For the initial lambda subset, the variable picker exposes only that lambda's parameters. Reject reads of enclosing parameters, enclosing locals, and project variables. Explicit references and calls to synchronous top-level functions or imported functions are allowed, provided no intervening binding shadows their emitted names. These are restrictions of our first palette; Python itself supports broader name access and closures. Validation must inspect enclosing scopes because Python resolves names through them. [Python name resolution](https://docs.python.org/3/reference/executionmodel.html#resolution-of-names).

A lambda has no statement body, local-variable declarations, or implicit async behavior. Putting it inside an async function does not make its body an async context. Unsupported captures and async references must be diagnosed before Run, including when introduced by project import or copy/paste.

### P6 implementation work packages

| Order | Owning area | Deliverable |
| --- | --- | --- |
| 1 | `src/language/functions.ts` and `src/blocks/core/` | Reference blocks, dynamic-call argument editing, lambda identities and parameter model. Keep anonymous scopes separate from the named-function palette. |
| 2 | `src/language/compiler.ts` | Native expressions/calls, required-input checks, lambda scope validation, shadowing checks, and mapped dynamic-call failures. Evaluate the callable and each argument once. |
| 3 | `src/language/clipboard.ts` and language editor modules | Rename, parameter editing, argument reorder/removal, atomic Undo, duplication, and scope-aware pickers. Repeated creation from the toolbox must allocate distinct lambda identities. |
| 4 | `src/language/module-format.ts`, `modules.ts`, and `src/project/` | Follow references when collecting exported helpers/dependencies. Version 6 introduced references and dynamic calls; version 7 adds lambda metadata. Continue to read projects 1–6 and pinned version-5/6 modules. Preserve existing pins and reject unsupported input transactionally. |
| 5 | Unit, native Python, and browser tests | Exercise behavior and editing together, then run the complete core-language acceptance audit. |

Each package should stay small enough to review independently, but P6 ships only after they work together. No new interpreter or callable wrapper is required. Existing runtime error transport should suffice unless browser verification exposes a missing case.

Use this as the smallest end-to-end acceptance example:

```python
def double(value):
    return value * 2


def apply(operation, value):
    return operation(value)


operation = double
print(apply(operation, 3))
print(apply(lambda value: value + 1, 3))
```

Expected output is `6` followed by `4`. Build it in blocks, rename `double`, duplicate the lambda, change and undo its parameter name, then save/reload and run again. Add separate failure fixtures for wrong argument counts, a non-callable value, an unavailable reference, and a forbidden capture. Finally, export a public function that returns a private helper by reference, import it into a fresh project, and call the returned function. This checks the dependency path that direct-call-only export analysis would miss.

### Identity guarantees carried forward from P2

- A function reference binds to a function ID; a direct named-call argument binds to a parameter ID. Neither uses the displayed name or ordinal position as identity. A dynamic call has an unknown target and preserves an ordered positional argument list instead.
- Parameters and locals belong to a function ID. Renaming the function does not change ownership. Variables selected outside their scope stay visibly unresolved rather than switching to a same-named variable.
- Duplicating a function creates new function, parameter, local, and block IDs, and remaps its internal references, including self-recursive calls. External references retain their targets when available; otherwise they remain unresolved. Copying a call within the same project preserves its target.
- Reordering parameters preserves the argument-to-parameter relationship, but Python still evaluates argument expressions left to right in the newly displayed order. This is not a promise that reordering is behavior-neutral for every program.
- Saving preserves IDs and references. Exporting/importing reusable definitions follows P5's dependency rules rather than silently binding to similarly named functions in the destination.
- Introduce a language-version migration when new scope or execution behavior changes existing meaning. Preserve legacy bindings and synchronous behavior during conversion.

## 11. Ownership boundaries and design decisions

The feature survey's four categories still apply to implementation. Each feature has a primary owner plus the integration required to make it usable:

| Feature | Core responsibility | Supporting work |
| --- | --- | --- |
| Named function | Definition/call semantics, parameters, scope, returns | Editor: signature UI, call palette, rename/navigation, undo. Project: identity and serialization. |
| Lists and dictionaries | Native values, indexing, mutation, iteration | Editor: item/key inputs and error location. No asset tool required. |
| Event handler | Dispatch, payload, ordering, yielding, failure policy | Runtime library: event bridge. Editor: handler roots and async call feedback. Device/sprite event sources arrive with those libraries. |
| Control a sprite | Use ordinary calls and values; add no sprite-specific language semantics initially | Library: sprite state/methods. Editor: sprite picker, authored placement and properties. Tools: costumes. |
| Play or create sound | Ordinary library calls; waiting playback must follow the P4 async contract | Library: playback. Tools: recording/editing/composition. Editor: asset selection. |
| Place a stage object or level | Core consumes references and structured values | Tools: scene/map authoring. Editor: placement and inspection. Library: loading and runtime behavior. |

The delivered core follows these decisions. Text editing remains a separate workstream:

| Decision | Proposed default | Resolve before |
| --- | --- | --- |
| Beginner semantics | Python truthiness, explicit conversion, zero-based indexing, native exceptions | Every sequential feature's acceptance test; keep examples consistent. |
| Procedure infrastructure | Reuse the installed plugin's model/events where compatible; adapt Python scope | P2 UI implementation, after the executable spike. |
| Calls and return shapes | Statement and expression call blocks; one Python function model | P2 editing tests, including changes to return behavior. |
| Event scheduling | Explicit cooperative `async`/`await`, bounded tasks/events, fail session on handler error | P4 prototype exit; measure queue limits and watchdog policy there. |
| Reuse | Local, versioned module copies with explicit dependencies | P5 file format and migration fixtures. |
| Text editing | Read-only Python during these milestones | A separate supported-subset and round-trip design. |

P0–P3 deliver the sequential milestone; P4 delivers cooperative events; P5–P6 deliver local reuse and function values, including lambdas. The [completion audit](core-language-completion-audit.md) records verification and the explicit limits of this supported subset. Sprite, sound, scene-authoring, and broader editor work remain separate from this core language plan.
