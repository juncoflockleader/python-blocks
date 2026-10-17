# Block search and Python debugging

Use **Find blocks** (the magnifier in the workspace corner) to discover a block or locate work already in the project. Use **Debug code** to run real Python one statement at a time and inspect its values. These tools work with the existing block language, supported Python editing, functions, event handlers and pinned modules.

## Find blocks

The search bar above the workspace has two scopes:

- **Block library** searches category names, block labels, tooltips and dropdown choices. Choosing a result adds the real block with the toolbox's default inputs and current project references. Connect the new block to your program; one Undo removes the insertion. Management results open the existing function, variable, event or module tools.
- **This project** searches existing non-shadow blocks. Choosing a result selects, centers and highlights that block without changing the project.

Matching ignores case and accents, accepts partial words, and requires every word in a multiword query. For example, `sprite glide`, `random`, or a function's name narrows the library. Search includes current project functions, variables and imported module calls. Sprite defaults follow the selected sprite. Results refresh after edits and project replacement. A dropdown match can refer to another choice available on that block; change its dropdown after insertion.

Press Down or Enter in the search box to focus results. Up and Down move between results; Enter activates one. Escape returns to or clears the search box. At most 60 results are displayed at once; the count indicates when to add words to narrow the list. Search text and result selection are editor state and are not saved into project files.

## Debug a program

Choose **Debug code** in the ⋯ menu (Pro level); the debugger opens in the Output tab. The active Python draft goes through the same validation and Apply flow as Run. Debugging starts a fresh scene and pauses before the first executable statement covered by the compiler's block map.

| Control | Behavior |
| --- | --- |
| Step into | Execute to the next mapped statement, including statements in called functions and imported project modules. |
| Step over | Execute to the next mapped statement at the current or a shallower generated-Python call depth, skipping deeper calls. |
| Step out | Continue to a mapped statement at a shallower call depth. Available when a generated caller is on the stack. |
| Resume | Continue execution until Pause, Stop, completion or an error. |
| Pause | Request a pause at the next mapped statement. An idle event session can also pause between handlers. |
| Stop | Terminate the worker and release its audio, questions and input state, including while paused. |

The highlighted source line and block identify the **next** statement, before it executes. A loop header can be visited repeatedly. Function definitions and handler registration are real Python statements and can appear during startup. Expressions and library internals execute as part of their containing statement; this is statement stepping, not expression stepping.

The debugger shows captured source, the generated-Python call stack, local values and global values. Select a caller in the stack to inspect that frame. Imported modules show their captured filename, source and module name; the main workspace highlights the caller because module blocks belong to the pinned module. Values are read-only, with up to 40 names per scope, 20 frames and bounded previews. Internal names are omitted, long collections/text are abbreviated, and objects are shown without calling user-defined representation methods.

All event handlers share one paused worker. Resume or a step lets the cooperative scheduler run again; after an `await`, another handler may supply the next eligible statement. Pause between handlers shows no current line. Step into from there waits for the next eligible statement; resume execution to send keyboard, pointer or test-event input. Queued input from before the pause can still be delivered. Held stage input is released on resumption.

Intentional pauses do not consume the runtime watchdog. Runtime elapsed time, waits, motion/countdowns, audio playback and cosmetic stage bursts stop advancing while paused. Each uninterrupted sequential execution interval remains bounded to ten seconds; event execution retains its responsiveness watchdog. Stop and runtime errors keep the ordinary cleanup guarantees.

Editing blocks or Python while paused leaves the captured run unchanged. The debugger labels the mismatch and stops highlighting blocks against that newer project. Stop and choose Debug code again to inspect the edited version. Debug state is not saved or exported; Run and the standalone player continue to use the ordinary execution path.

## Hosting requirements

Debugging uses CPython tracing and shared-memory worker controls. This lets Pause interrupt synchronous loops and freezes the whole worker while values are inspected, without transforming the learner's program. The browser must support `SharedArrayBuffer` and serve the editor in a secure, cross-origin-isolated context. Loopback development and preview servers include these response headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

A production host must provide equivalent headers for the editor and its worker responses, over HTTPS. Pyodide and Blockly assets are served locally. On an unsupported/non-isolated page, Debug code is disabled with a hosting hint; Run and search remain available. The portable player does not expose the debugger or require these headers. Isolation is a browser capability requirement, not a security boundary for hostile Python; public untrusted-code hosting remains separate release work.

## Verification

The browser suite exercises search insertion/Undo, current-project navigation, keyboard operation and project-specific references. Debugger checks execute actual browser CPython through sequential loops, nested functions, imported modules, idle events, paused timers, Stop and edited-project snapshots. Native tests verify trace order, call depth, read-only value previews and logical-clock accounting. Runner tests verify shared commands, stale-worker rejection and watchdog behavior during pauses.

See [browser search checks](../tests/e2e/block-search.spec.ts), [browser debugger checks](../tests/e2e/debugger.spec.ts), [native debugger checks](../tests/python/test_debugger.py) and [runner checks](../tests/unit/runner.test.ts).

Verified on 2026-10-08: `pnpm check` passes type checking, 696 TypeScript tests, 128 native Python tests and both production builds. `pnpm exec playwright test --workers=2` passes all 211 Chromium browser tests, including 5 search and 9 debugger cases. Desktop debugger and 390-pixel search/debugger screenshots were inspected. Other browser engines and physical devices have not been certified by this run.
