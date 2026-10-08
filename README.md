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
- Live generated Python plus an editable main-file draft, validated conversion back to blocks, Apply/Undo and saved source recovery.
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
- Authored 2D sprites, a stage inspector, drag placement, built-in/imported costumes, keyboard/click input, timed movement, cloning, and overlap queries.
- Motion/sensing blocks, edge bounce, rotation styles, speech/thought bubbles, and pointer position/button state.
- Bitmap painting, costume/backdrop management, ordered animation frames, preview, and programmable backdrop events.
- Independent sprite pens, shared trails/stamps, and seven graphic effects for sprites and the stage background.
- Per-instance behaviors/data, clone initialization, update/contact events, cancellation and visible-pixel click/sensing queries.
- Velocity, acceleration/gravity, drag, controllers/jumping, projectiles/lifetime, kinds and swept solid-wall collision response.
- Named worlds, tilemap painting and wall flags, local/global sprite placement, scrolling cameras, tile queries/events and runtime map edits.
- Score, lives, countdown, fixed HUD, win/loss/replay and bounded game effects.
- Imported/recorded audio, waveform editing, a layered melody/drum grid, sound blocks and sprite-owned playback.
- Queued questions/answers, an elapsed timer, configurable multi-touch controls and rendered color contact.
- Focused scene palettes, sprite thumbnails/search, artwork/script shortcuts, saved live watchers and a larger play view.
- Square, keyboard-controlled sprites, pointer-following/bouncing and animated-story examples, with Python source and scene-asset export.
- Portable playable ZIPs with a local launcher, browser host, Python runtime, captured assets, source and editable blocks; see [portable playback](docs/portable-playback.md).

Use **Sounds & music** below the stage to import or record audio, edit waveforms, or compose a song. **Music example** plays a melody with drums; Space adds a chime. See the [sound/music guide](docs/sound-and-music.md) for playback, microphone handling and limits.

Choose **Input & color example** to answer a question and use arrows or **Touch controls** to find the red square. The **Sensing & input** palette includes timers, questions and color contact. See the [input guide](docs/questions-timers-and-touch.md) for cancellation, button mapping, camera-space color sampling and limits.

**Prototype limits:** Python is not editable in the UI; artwork uses bitmap frames without a full timeline or vector layers; lexical closure capture and async function values are future work. Cross-project clipboard references to unavailable functions, variables, or module pins remain unresolved; copying does not import their dependencies. Source-only exports using playground APIs require our library and host; **Export playable** includes them with a documented launcher. Project JSON preserves the blocks for reopening in this editor.

Use **Large stage** for a focused play view with Run/Stop, touch input, questions, game results and watches. **Watch sprite values** pins read-only properties/data; the sprite browser finds objects, their artwork and scripts. See the [editor/play guide](docs/editor-and-play-workflow.md).

Use **Functions & variables** above the workspace to create or edit functions, parameters, and scoped variables. Their call/get/set blocks appear in the corresponding toolbox categories. **Undo** and **Redo** below the workspace include signature edits. Open [the function example](tests/fixtures/language/functions.json) with **Open project** to try reordering arguments and see their bindings preserved.

Use **Duplicate function**, the block's **Duplicate** menu item, or copy/paste to make an independent function. Open [the collections example](tests/fixtures/language/collections.json) to try passing a list to a function, mutating an alias, and iterating dictionary keys. Collection indices start at zero; negative list indices count from the end. **Shallow copy** copies the outer collection and shares nested values. List-item and dictionary-pair editors preserve removed expressions as drafts, and Undo restores their connections.

Use **Events** above the workspace to create handlers, name their payload parameters, and set delivery order. Open [the event example](tests/fixtures/events/handlers.json), Run, then send a `message` with a JSON payload in **Send a test event**. A handler-only project can run without Program. Events stay active until Stop or a fatal error. **Wait** yields inside a handler or a function explicitly marked async; calls to async helpers display **await call**. Ordinary loops do not yield automatically. See the [event contract](docs/event-runtime-prototype.md) for payload rules and limits.

Use **Modules** to export selected functions with their private helpers, import a saved module under a namespace, and inspect its blocks/Python. Imported copies stay pinned and travel inside saved projects. **Rename namespace** updates qualified calls; **Remove import** keeps unresolved calls for recovery or Undo. Open [the module consumer](tests/fixtures/modules/consumer.json) or [dependency-chain example](tests/fixtures/modules/transitive-consumer.json) to try them. Python export includes all generated files in a ZIP when modules are present. See the [module contract](docs/reusable-modules.md).

Use the **function name** value blocks in Functions or Modules to pass or store a function. **Function values** contains dynamic statement/value calls with an editable positional argument list. Open [the higher-order example](tests/fixtures/function-values/higher-order.json) to pass and return functions. Dynamic arguments remain positional when a definition changes. The same category provides **lambda** and **Manage lambdas** for adding, renaming, reordering, or removing parameters. Open [the named and anonymous function example](tests/fixtures/lambdas/higher-order.json) to try both forms. See the [function-value contract](docs/function-values.md).

**Sprite example** below the stage loads two actors: use the arrow keys after focusing the stage while the second sprite glides independently. **Motion example** demonstrates pointer following, edge bouncing and dialogue. **Reset stage** restores the starting layout for editing. Add/import costumes, drag sprites, or use the property inspector; **Sprites**, **Motion**, **Looks**, **Physics**, **Sprite pen** and **Sensing & input** group the programming blocks, and **Input events** supplies handler shortcuts. Runtime movement never overwrites saved placement. See the [sprite, stage, and input contract](docs/sprites-stage-input.md).

**Artwork & frames** opens painting and frame tools. Save a drawing as a costume or backdrop, arrange frames and preview their animation. **Story example** animates a character and changes backdrops with Space. See the [artwork guide](docs/artwork-and-backdrops.md) for draft saving, Undo, shared assets and Python APIs.

**Star game example** provides a complete scrolling collectible game with score, lives, a countdown, win/loss screens and replay. The **Game** palette supplies the editable rules and HUD; see the [game presentation guide](docs/game-state-and-presentation.md).

**Sprite library** provides 20 costumes with previews, search and categories. **Backdrop library** offers six scenes. **Worlds & tilemaps → World library** adds Forest trail, Coral reef, City park or Space station as an editable tilemap with its artwork. Stock additions support Undo and travel with saved/playable projects; see the [artwork guide](docs/artwork-and-backdrops.md).

**Worlds example** explores a scrolling map, opens a tile gate and enters a second world. **Worlds & tilemaps** authors maps and camera settings; the sprite inspector assigns world membership. See the [worlds guide](docs/worlds-tilemaps-and-cameras.md).

**Platformer example** combines gravity, keyboard movement, jumping, projectiles, targets and a goal. **Game motion & collisions** edits presets and starting settings. See the [game motion guide](docs/game-motion-and-collisions.md).

**Behavior example** demonstrates independently moving clones. **Sprite data & behavior** edits starting values and attaches handlers to the selected sprite and its clones. See the [behavior/sensing guide](docs/sprite-behaviors-and-sensing.md).

**Drawing example** draws with two independent sprite pens and colored stamps; Space clears the marks. **Pen & graphic effects** beneath the inspector edits saved starting settings. The [pen/effects guide](docs/sprite-pen-effects.md) covers programming, compositing, persistence and limits.

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
- [Sound and music](docs/sound-and-music.md): audio recording/editing, melody authoring, playback and cancellation.
- [Editor and play workflow](docs/editor-and-play-workflow.md): focused palettes, sprite/world navigation, live property/data watches and enlarged play.
- [Questions, timers, touch and color](docs/questions-timers-and-touch.md): input workflows, cancellation, saved controls and rendered color sensing.
- [Portable playback](docs/portable-playback.md): standalone exports, launcher, captured assets and offline verification.
- [2D parity plan](docs/2d-parity-plan.md): storytelling, artwork, sound, game and editor requirements with acceptance gates.
- [2D parity completion audit](docs/2d-parity-audit.md): verified coverage of all thirteen requirements, complete creative workflows and explicit product limits.
- [Python and blocks](docs/python-and-blocks.md): edit, apply, run, diagnose errors and recover saved Python drafts.
- [Blocks and Python bridge plan](docs/blocks-python-bridge-plan.md): scope, acceptance gates and verification progress for the bridge.
- [Bridge completion audit](docs/blocks-python-bridge-audit.md): verified language, editing, recovery and independent-delivery requirements, with remaining product boundaries.
- [Learner pilot protocol](docs/python-bridge-learner-pilot.md): planned observation tasks and decision criteria; no learner sessions have been conducted yet.
- [Sprites, stage, and input](docs/sprites-stage-input.md): authoring, runtime API, input focus, assets, persistence, and limits.
- [Artwork and backdrops](docs/artwork-and-backdrops.md): bitmap tools, drafts, frame sequences, preview and backdrop events.
- [Worlds, tilemaps and cameras](docs/worlds-tilemaps-and-cameras.md): map tools, collisions, scene transitions, scoped sprites and scrolling input.
- [Game state and presentation](docs/game-state-and-presentation.md): score/lives/countdown, fixed HUD, result screens, captured replay and finite bursts.
- [Game motion and collisions](docs/game-motion-and-collisions.md): velocity, gravity, controllers, projectiles and solid surfaces.
- [Sprite behaviors and sensing](docs/sprite-behaviors-and-sensing.md): instance-owned events, data and pixel queries.
- [Sprite pen and effects](docs/sprite-pen-effects.md): independent pens, stamps, seven visual effects and shared drawing behavior.
- [Function values](docs/function-values.md): synchronous references, dynamic calls, positional arguments, lambdas, higher-order modules, and persistence.
- `src/blocks/`: block definitions, Python generators, toolbox, starter project.
- `src/runtime/`: worker lifecycle, message types, and Python drawing library.
- `src/stage.ts`: canvas rendering.
- `tests/`: TypeScript unit tests, native Python library tests, and browser integration tests.

## Licensing

The license for original project code is **not yet selected**. Public repository visibility alone does not grant an open-source license. Keep that decision explicit before accepting outside contributions or distributing a release.

Dependencies retain their own licenses: Blockly uses Apache-2.0; Pyodide uses MPL-2.0 and bundles CPython and other components with their own notices. Review bundled notices before a release. No Scratch code, characters, or branding are included.
