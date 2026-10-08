# Blocks and Python bridge completion audit

**Verified 2026-10-07.** All B01–B08 implementation gates in the [bridge plan](blocks-python-bridge-plan.md) are satisfied. Learners can edit supported Python, apply it to ordinary blocks, retain exact drafts and recovery, and run or export the accepted program with its original assets. This audit does not claim human learner testing; the [pilot protocol](python-bridge-learner-pilot.md) is ready for future sessions.

## Requirement evidence

| Gate | Delivered behavior | Implementation and evidence |
| --- | --- | --- |
| B01 — inspect without execution | Separate pinned CPython parser, syntax/context errors, exact numeric text and Unicode spans, bounded results, cancellation and recovery. Learner imports and statements never execute during parsing. | [Parser](../src/bridge/parse_python.py), [worker/client](../src/bridge/parser.ts), [native tests](../tests/python/test_bridge_parser.py), [client tests](../tests/unit/bridge-parser.test.ts), [real browser parser](../tests/e2e/bridge-parser.spec.ts). |
| B02 — faithful core blocks | Exact literals, Python operators, lists/dicts, mutation, assignments and control flow become editable blocks. Evaluation order, operand-returning Boolean operations and aliasing remain Python semantics. Unsupported rewrites receive positions instead of partial conversion. | [Core converter](../src/bridge/core-converter.ts), [semantic comparison](../src/bridge/ast.ts), [50 converter tests](../tests/unit/bridge-converter.test.ts), [browser execution](../tests/e2e/bridge-converter.spec.ts). |
| B03 — scopes, functions, events and modules | Positional named functions, recursion, explicit await, supported function values/lambdas, project/sprite/kind handlers and pinned module calls. Scope/parameter/registration identities survive supported edits. Imported definitions are immutable. | [Language converter](../src/bridge/language-converter.ts), [reconciliation](../src/bridge/reconcile.ts), [49 function tests](../tests/unit/bridge-functions.test.ts), [converter browser tests](../tests/e2e/bridge-converter.spec.ts), [module delivery tests](../tests/e2e/bridge-delivery.spec.ts). |
| B04 — creative libraries and authored assets | All 124 current library block types and their non-default modes convert. Sprite/image/frame/world/tile/sound/control/watch metadata retains stable identities. Managed scene startup and explicit waits are preserved. | [Library catalogue](../src/bridge/library-catalog.ts), [library converter](../src/bridge/library-converter.ts), [340 library tests](../tests/unit/bridge-libraries.test.ts), [eight edited creative workflows](../tests/e2e/bridge-libraries.spec.ts). |
| B05 — durable and atomic editing | Exact invalid drafts, accepted checkpoints and recovery survive autosave/save/reload. Conflicts preserve both sides. Candidate installation is one Undo step with rollback; later typing survives Undo/Redo. History/size limits stop before eviction or truncation. | [Draft state](../src/bridge/draft-state.ts), [controller](../src/bridge/controller.ts), [transaction](../src/bridge/transaction.ts), [24 durability tests](../tests/unit/bridge-drafts.test.ts), [browser editing/recovery](../tests/e2e/bridge-editor.spec.ts). |
| B06 — usable editing workflow | Editable main file, separate read-only module inspection, positioned errors, Apply/Cancel/recovery/download, normal Tab navigation, keyboard Apply, narrow layout and captured-revision runtime errors. | [Editor](../src/bridge/editor.ts), [eight UI browser tests](../tests/e2e/bridge-editor.spec.ts), [learner guide](python-and-blocks.md). |
| B07 — execution and delivery | Active drafts validate before Run/export. Replay uses its validated capture and blocks changed drafts. Generated-source exports preserve modules/assets; playable ZIPs also retain exact draft/project state. Stop and execution budgets match block programs. | [Main integration](../src/main.ts), [source export](../src/project/python-export.ts), [playable export](../src/project/playable-export.ts), [four delivery tests](../tests/e2e/bridge-delivery.spec.ts), [independent baseline playback](../tests/e2e/playable.spec.ts). |
| B08 — documentation and full regression | Learner guide, architecture, roadmap, pilot protocol, representative walkthroughs and regression across the existing language and 2D baseline. | [Guide](python-and-blocks.md), [architecture](architecture.md), [roadmap](roadmap.md), [pilot protocol](python-bridge-learner-pilot.md), verification below. |

Tests use ordinary Blockly models and the actual compiler. Native parser tests exercise CPython; browser tests use the bundled Pyodide interpreter. The creative workflow tests change real source and then exercise stage input, output, pixels, audio, scene transitions and exports, rather than treating syntax-tree equality alone as behavioral proof.

## Verification

- `pnpm check`: type checking, **670 TypeScript tests**, **122 native Python tests**, player packaging and production build passed.
- Targeted delivery/library/physics browser run: **19 passed**, including the converted platformer and the original complete platformer playthrough.
- Complete production-build browser regression: **185 Chromium/Pyodide tests passed** in one run, including all 157 existing language/2D/editor/portable regressions and 28 bridge tests. The build finished before browser testing; no production files changed during the run.
- Visual review: independent edited sprite player, completed platformer, converted animated story and the focused Python editor at a 390-pixel viewport inspected. Controls and messages remain readable, with no horizontal page overflow in the tested narrow workflow.
- `git diff --check` and local documentation-link checks passed (28 Markdown files).

The delivery tests extract the actual ZIP, launch its bundled Python HTTP server on a fresh port, and allow browser requests only to that server plus local blob/data resources. This verifies independence from the editor origin and external CDNs. Both root and nested paths are exercised by the combined playback suites. Reopening the embedded project retains the exact submitted Python and original assets.

All eight implementation gates are verified. No required bridge implementation or regression task remains open; learner research and the separate release/AI roadmap phases remain future work.

## Audit fixes

An invalid draft could previously be bypassed through Play again. Replay now requires an active draft and authored project to match the exact checkpoint already validated for the captured run. A changed draft receives an explanation without replacing text or executing stale blocks.

A projectile could cross a target during multiple motion steps between contact scans. A deterministic native test reproduced this with both frame endpoints outside the target. Contact detection now runs at motion substeps and retains transitions under the existing event budget; native tests cover event ordering, tile entry and overload. This is sampled contact, with the same distinction from swept solid-wall response documented in the [motion guide](game-motion-and-collisions.md).

The shared portable-player browser helper was extracted so new bridge delivery tests exercise the same actual ZIP launcher and network isolation as existing portable tests. Documentation now distinguishes project envelope version 2, block language version 19 and the unchanged module format, and describes generated sources separately from exact retained drafts.

## Boundaries and follow-through

This is a bridge for Python representable by the current blocks and curated libraries. Arbitrary imports, classes, exception handling, decorators, general comprehensions, unsupported captures, augmented assignment and chained comparisons remain positioned errors. There is no unrestricted execution route or raw-code block. The supported-subset guide and plan describe the generated text-join exception and other exact forms.

Generated formatting can differ from learner text. The exact draft remains saved and downloadable; generated source maps identify the executing block statement, while parser/conversion diagnostics select positions in the written draft. This is not arbitrary Python pretty-printing or byte-for-byte source regeneration.

Browser coverage uses Chromium with keyboard and simulated touch. Physical touch hardware, screen readers, OS microphone permission dialogs and other engines still require separate product testing. Execution budgets are not a hostile-code security boundary. The large main bundle remains a known build warning; release performance budgets, product license/name and public hosting remain separate roadmap work.

The learner pilot has not occurred. Its protocol prepares observation of prediction, code recognition, small edits and recovery; it does not claim learning results. The future BYO-key AI helper remains assistance only: no code/block/asset authoring or modification, complete solutions, automatic execution or input. No AI integration is delivered by this bridge.
