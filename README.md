# Python Blocks

A creative coding playground where visual blocks generate readable Python and run on a real Python interpreter.

This repository contains the initial product design and a working browser scaffold. It is a new Blockly-based application, not a fork of the Scratch editor.

## Try it locally

Requirements: Node.js 24 (see `.nvmrc`), pnpm 11.19.0, and Python 3.10+ for the Python unit tests.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. Click **Run code** to draw a square, change the repeat count or a distance block, and run again. **Stop** terminates the Python worker immediately. Each run starts with fresh Python state.

The development and build commands copy the pinned Pyodide distribution and Blockly media from `node_modules` into ignored `public/` directories. Runtime assets are served locally; executing a drawing does not require a third-party Python service or CDN.

## What works today

- Blockly workspace with drawing, loops, logic, numbers, text, variables, and functions.
- Live, read-only Python generated from the workspace.
- Actual CPython execution through Pyodide in a dedicated Web Worker.
- A small `playground.pen` library and a canvas drawing stage.
- Printed output, Python error output, Stop, and execution/output/drawing limits.
- A square starter project and Python source download.

**Prototype limits:** projects are held in memory and reset on reload; Python is not editable in the UI; drawing is rendered as commands arrive, with no timed animation; sprites, keyboard events, block-level error highlighting, and project import/export are future work. The downloaded `.py` file requires our `playground.py` library and browser host. It is a source export, not yet a standalone desktop application.

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
- `src/blocks/`: block definitions, Python generators, toolbox, starter project.
- `src/runtime/`: worker lifecycle, message types, and Python drawing library.
- `src/stage.ts`: canvas rendering.
- `tests/`: TypeScript unit tests, native Python library tests, and browser integration tests.

## Licensing

The license for original project code is **not yet selected**. Public repository visibility alone does not grant an open-source license. Keep that decision explicit before accepting outside contributions or distributing a release.

Dependencies retain their own licenses: Blockly uses Apache-2.0; Pyodide uses MPL-2.0 and bundles CPython and other components with their own notices. Review bundled notices before a release. No Scratch code, characters, or branding are included.
