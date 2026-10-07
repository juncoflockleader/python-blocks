# Python Blocks

A creative coding playground where visual blocks generate readable Python and run on a real Python interpreter.

This repository contains the initial product design and a working browser scaffold. It is a new Blockly-based application, not a fork of the Scratch editor.

## Try it locally

Requirements: Node.js 24 (see `.nvmrc`), pnpm 11.19.0, and Python for the native tests. CI uses Python 3.14.2 to match the bundled Pyodide interpreter.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. Click **Run code** to draw a square, change the repeat count or a distance block, and run again. **Stop** terminates the Python worker immediately. Each run starts with fresh Python state.

The development and build commands copy the pinned Pyodide distribution and Blockly media from `node_modules` into ignored `public/` directories. Runtime assets are served locally; executing a drawing does not require a third-party Python service or CDN.

## What works today

- Blockly workspace with drawing, loops, logic, numbers, text, variables, functions, lists, and dictionaries.
- An explicit Program entry, inactive loose drafts, range/iteration, break/continue, exact integer literals, and explicit conversions.
- Live, read-only Python generated from the workspace.
- Actual CPython execution through Pyodide in a dedicated Web Worker.
- A small `playground.pen` library and a canvas drawing stage.
- Printed output, Python error output, Stop, and execution/output/drawing limits.
- Block-linked input diagnostics and runtime errors, with expandable Python tracebacks.
- Browser autosave, project file save/open, and recovery for incompatible saved data.
- Scoped project/local variables and parameters, named functions, statement/value calls, early returns, and recursion.
- Function and variable forms, parameter rename/reorder with undo, and migration of older project bindings.
- Function duplication and clipboard support with independent identities, preserved self-recursion, and grouped undo.
- Case-sensitive names, native collection indexing/mutation/iteration, nested values, aliases, and shallow copies.
- Event handlers with saved delivery order, scoped payloads, explicit async functions and waits, and a test-event input form.
- Persistent event sessions, bounded event queues and tasks, mapped handler failures, a responsiveness watchdog, and fresh state after restart.
- Locally reusable function modules with pinned dependencies, qualified calls, read-only inspection, namespace editing, and source archives.
- Synchronous function references and dynamic calls, including passing/returning functions using imported function values, and expression lambdas with scoped parameter editing.
- A square starter project and Python source download.

**Prototype limits:** Python is not editable in the UI; drawing has no animation timeline; sprites, lexical closure capture, and async function values are future work. Cross-project clipboard references to unavailable functions, variables, or module pins remain unresolved; copying does not import their dependencies. Projects using playground APIs require our library and host; event exports also require the host to await the event session. Project JSON preserves the blocks for reopening in this editor.

Use **Functions & variables** above the workspace to create or edit functions, parameters, and scoped variables. Their call/get/set blocks appear in the corresponding toolbox categories. **Undo** and **Redo** below the workspace include signature edits. Open [the function example](tests/fixtures/language/functions.json) with **Open project** to try reordering arguments and see their bindings preserved.

Use **Duplicate function**, the block's **Duplicate** menu item, or copy/paste to make an independent function. Open [the collections example](tests/fixtures/language/collections.json) to try passing a list to a function, mutating an alias, and iterating dictionary keys. Collection indices start at zero; negative list indices count from the end. **Shallow copy** copies the outer collection and shares nested values. List-item and dictionary-pair editors preserve removed expressions as drafts, and Undo restores their connections.

Use **Events** above the workspace to create handlers, name their payload parameters, and set delivery order. Open [the event example](tests/fixtures/events/handlers.json), Run, then send a `message` with a JSON payload in **Send a test event**. A handler-only project can run without Program. Events stay active until Stop or a fatal error. **Wait** yields inside a handler or a function explicitly marked async; calls to async helpers display **await call**. Ordinary loops do not yield automatically. See the [event contract](docs/event-runtime-prototype.md) for payload rules and limits.

Use **Modules** to export selected functions with their private helpers, import a saved module under a namespace, and inspect its blocks/Python. Imported copies stay pinned and travel inside saved projects. **Rename namespace** updates qualified calls; **Remove import** keeps unresolved calls for recovery or Undo. Open [the module consumer](tests/fixtures/modules/consumer.json) or [dependency-chain example](tests/fixtures/modules/transitive-consumer.json) to try them. Python export includes all generated files in a ZIP when modules are present. See the [module contract](docs/reusable-modules.md).

Use the **function name** value blocks in Functions or Modules to pass or store a function. **Function values** contains dynamic statement/value calls with an editable positional argument list. Open [the higher-order example](tests/fixtures/function-values/higher-order.json) to pass and return functions. Dynamic arguments remain positional when a definition changes. The same category provides **lambda** and **Manage lambdas** for adding, renaming, reordering, or removing parameters. Open [the named and anonymous function example](tests/fixtures/lambdas/higher-order.json) to try both forms. See the [function-value contract](docs/function-values.md).

Use this scaffold locally with your own projects. A worker provides responsiveness, not a security boundary for untrusted shared code. There are no accounts, cloud storage, arbitrary package installation, or public project sharing.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Prepare runtime assets and start Vite |
| `pnpm build` | Prepare assets, check types, and create `dist/` |
| `pnpm preview` | Serve the production build at port 4173 |
| `pnpm check` | TypeScript checks, compiler/runner tests, Python tests, production build |
| `pnpm exec playwright install chromium` | Install the browser used by end-to-end tests |
| `pnpm test:e2e` | Test the production app (run `pnpm build` first) |

The production host must serve the complete `dist/` directory, including `pyodide/`, from the site root, with `.wasm` files served as `application/wasm`. No deployment is configured.

## Design and source map

- [Initial design](docs/initial-design.md): educational goal, scope, tradeoffs, and validation.
- [Architecture](docs/architecture.md): compiler, runtime, library contract, and boundaries.
- [Roadmap](docs/roadmap.md): sequenced follow-up work and acceptance criteria.
- [Block programming feature survey](docs/research/block-programming-feature-survey.md): 14 environments, 68 features across language, libraries, creation tools, and editor workflows, with primary sources.
- [Core language implementation plan](docs/core-language-implementation-plan.md): C01–C16 scope, Python semantics, implementation phases, and acceptance gates.
- [Implementation progress](docs/implementation-progress.md): verification and implementation history for P0–P6.
- [Core language completion audit](docs/core-language-completion-audit.md): requirement coverage, acceptance evidence, and supported-subset limits.
- [Event runtime contract](docs/event-runtime-prototype.md): cooperative scheduling, payloads, limits, editor integration, and browser verification.
- [Reusable module contract](docs/reusable-modules.md): local bundles, pinned dependency closure, namespaces, import/export, and source identity.
- [Function values](docs/function-values.md): synchronous references, dynamic calls, positional arguments, lambdas, higher-order modules, and persistence.
- `src/blocks/`: block definitions, Python generators, toolbox, starter project.
- `src/runtime/`: worker lifecycle, message types, and Python drawing library.
- `src/stage.ts`: canvas rendering.
- `tests/`: TypeScript unit tests, native Python library tests, and browser integration tests.

## Licensing

The license for original project code is **not yet selected**. Public repository visibility alone does not grant an open-source license. Keep that decision explicit before accepting outside contributions or distributing a release.

Dependencies retain their own licenses: Blockly uses Apache-2.0; Pyodide uses MPL-2.0 and bundles CPython and other components with their own notices. Review bundled notices before a release. No Scratch code, characters, or branding are included.
