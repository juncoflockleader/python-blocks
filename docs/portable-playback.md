# Portable playback

Choose **Export playable** to download `python-blocks-playable.zip`. It captures the current compiled program, pinned modules, starting scene, images, sounds, worlds, input mappings and watches, plus the editable project and a standalone browser player. Editing or running the project while export is preparing does not change the capture. **Cancel export** stops preparation without changing your work.

## Run an exported project

1. Extract the entire ZIP into a folder.
2. Open a terminal in that folder and run `python3 serve.py`. On Windows with the Python launcher, use `py -3 serve.py`.
3. Open the address printed by the launcher, normally `http://127.0.0.1:8000/`, and press **Run**.
4. Click the stage for keys, or open **Touch controls**. Questions, dialogue, watches and game results appear with the stage. **Stop** ends the worker and audio; **Run** or **Play again** creates a fresh worker and restores the captured starting scene.
5. Press Ctrl+C in the terminal when finished. If the port is busy, use `python3 serve.py --port 8001`.

The launcher requires Python 3.7 or newer and binds only to the loopback interface. It uses the standard library; there are no packages to install. That desktop Python serves files; the project itself runs in the included Pyodide/CPython 3.14.2 browser runtime. No editor, Node installation, account, CDN or internet connection is needed. You can use another static HTTP server and can place the entire export in a subdirectory. JavaScript modules and WebAssembly need HTTP: opening `index.html` directly as a file shows instructions to start the launcher.

Use a modern browser with module Workers, WebAssembly, OffscreenCanvas and Web Audio. Current automated coverage uses Chromium. Audio starts from the Run gesture; **Enable audio** lets the learner resume it if the browser suspended playback. **Mute** preserves playback timing. On-screen buttons use the captured A/B mappings, combine with physical held keys, and release on cancellation or focus loss. Runtime limits, event queues, input coalescing and the unresponsive-worker watchdog are shared with the editor.

## Contents and recovery

| File or folder | Purpose |
| --- | --- |
| `index.html`, `assets/` | Standalone play UI, renderer, input/audio/question hosts and Python worker. No Blockly/editor dependency. |
| `pyodide/` | Pinned runtime, WebAssembly and Python standard library. |
| `serve.py`, `README.txt` | Local launcher and instructions. |
| `project.python-blocks.json` | Editable blocks, module pins and authored assets. Use **Open project** in Python Blocks to continue creating. |
| `program.py`, `_pb_module_*.py` | Exact compiled sources used by the player, loaded as text without being inserted into HTML. |
| `scene.json` | Captured starting scene and embedded images/audio, when present. |
| `player.json` | Versioned execution mode and generated-module filename list. |
| `modules.json`, `source-map.json` | Module pin identities and generated-line-to-block mapping. Errors retain their Python traceback. |
| `runtime-source/` | Python library sources used by the bundled worker. |
| `bundle.json` | Player resource sizes and SHA-256 digests used while packaging. |
| `THIRD-PARTY-NOTICES.txt`, `licenses/` | Runtime attribution, corresponding source links and license texts. |

The player displays output and error details but has no authoring controls or autosave. Its **Editable project** link downloads the original captured project. Keep all files and relative paths together. An incomplete or invalid manifest, missing source or invalid scene disables Run and shows recovery instructions. Reloading reads project files afresh. Editing a source file outside the player requires a reload; it does not update the editable blocks.

**Export Python** remains the small source-only option: one `.py` file for a simple program or a ZIP with modules/scene assets. It does not include the browser host. **Save project** remains the editable JSON option. Choose **Export playable** when the recipient needs to run the project independently.

The player bundle currently contains about 14 MB before compression. Export fetches at most four files concurrently, verifies their exact sizes and SHA-256 digests, then uses cancellable background ZIP compression. A missing file or stale/mixed build fails preparation rather than downloading an incomplete player; reload the app and retry. Preparation has a two-minute timeout. These checks catch incomplete transfers and mixed builds, not signatures from a trusted publisher.

## Build and verification

`pnpm assets` copies pinned runtime assets, builds the standalone player with a relative base URL, includes notices and Python sources, and generates its resource manifest. Both `pnpm dev` and `pnpm build` run this preparation. During development, rerun `pnpm assets` after editing player/runtime source before testing a new export; the editor's normal Vite hot reload does not rebuild the separate player. Generated player files live in ignored `public/player/` and are copied into the production app. `vite.player.config.ts` has `publicDir: false` to prevent recursively copying generated assets.

[Boundary tests](../tests/unit/playable.test.ts) cover manifest versions, unsafe paths, duplicate filenames, decompressed response bounds, exact source text and nested-path loading. [Browser tests](../tests/e2e/playable.spec.ts) download real exports, extract them, launch their actual Python HTTP server on a fresh port, and run in a fresh browser context that blocks requests outside that server. They cover touch questions/game completion/replay, saved watches, scrolling worlds and solid-tile gameplay, drawing erasure, frame animation/backdrops, measured Web Audio output, transitive modules, tracebacks, watchdog recovery, cancellation, immutable capture, damaged resources and missing data. The captured editable project reopens in the editor. Root and nested export paths are tested.

Runtime dependency versions and source links are recorded in [the included notices](../src/player/THIRD-PARTY-NOTICES.txt). License texts are retained from [Pyodide 314.0.7](https://github.com/pyodide/pyodide/blob/314.0.7/LICENSE), [CPython 3.14.2](https://github.com/python/cpython/blob/v3.14.2/LICENSE), [Emscripten 5.0.3](https://github.com/emscripten-core/emscripten/blob/5.0.3/LICENSE), and the installed fflate distribution. Changing runtime versions requires updating those notices and verifying the new player together.
