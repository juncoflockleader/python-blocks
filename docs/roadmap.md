# Roadmap

## 0. Repository scaffold

- [x] Record product intent, architecture, and open decisions.
- [x] Build a Blockly workspace and live Python preview.
- [x] Execute generated Python in a worker with a pen drawing library.
- [x] Provide Run, Stop, reset, source download, output, and bounded execution.
- [x] Add type checks, compiler/lifecycle tests, Python library tests, and browser tests.

## 1. Make projects durable and understandable

- Versioned save/load format with Blockly state and future assets.
- Local autosave with visible save state and recovery from invalid data.
- Python line-to-block mapping and concise learner-facing errors.
- Portable export with its library and a working host — implemented as **Export playable**; see [portable playback](portable-playback.md).
- Accessibility review: keyboard navigation, focus, zoom, contrast, and touch targets.

Acceptance: a learner can save a drawing, reload it, understand a deliberate error, and run an exported project using its documented instructions.

## 2. Add sprites, stage, and input

Delivered in the initial sprite module. The saved scene and Python runtime build on the implemented core language and cooperative event runtime; see the [sprite contract and verification](sprites-stage-input.md) and [core audit](core-language-completion-audit.md).

1. Authored sprites and stage: built-in costumes, image import, sprite list, property inspector, direct placement, stable references, Undo, and project persistence.
2. Programming and interaction: transforms, visibility/costumes, keyboard and pointer events, key-state queries, and explicit awaited movement.
3. Game behavior: overlap queries, runtime creation/cloning/destruction, and simple costume animation.

Saved starting state stays separate from runtime state. Every Run reconstructs the scene; Stop cancels its activities. Input follows the existing bounded cooperative event contract.

Acceptance verified: place two sprites, control one with the keyboard while the other animates independently, then Stop, rerun, and reopen the saved project with consistent starting state. Browser tests also cover input focus, image persistence, malformed-file recovery, and useful errors.

The **mainstream 2D creation parity** follow-through is complete under the [2D parity plan](2d-parity-plan.md), verified in the [completion audit](2d-parity-audit.md). Motion, dialogue, pointer sensing, bitmap painting, asset management, saved animation frames, backdrop events, independent sprite pens/stamps, graphic effects, per-instance behaviors/data and visible-pixel sensing extend the first module. See the [artwork guide](artwork-and-backdrops.md) and [pen/effects guide](sprite-pen-effects.md). See the [behavior/sensing guide](sprite-behaviors-and-sensing.md) for clone initialization, update/contact events and cancellation. The [game motion guide](game-motion-and-collisions.md) adds velocities, gravity, controllers, projectiles, kinds and swept solid-wall collisions, with an editable platformer. The [worlds guide](worlds-tilemaps-and-cameras.md) adds named scenes, tilemap painting, solid tiles, local/global sprites, scrolling cameras and transitions. The [game presentation guide](game-state-and-presentation.md) adds score/lives/countdown, a fixed HUD, terminal win/loss, captured replay and finite bursts, with a complete collectible game. The [sound/music guide](sound-and-music.md) adds imported/recorded clips, waveform editing, a layered note grid, sound blocks and owned playback. The [input guide](questions-timers-and-touch.md) adds queued questions/answers, elapsed timers, configurable multi-touch and rendered color contact, with a playable color-finding example. The [editor/play guide](editor-and-play-workflow.md) adds focused palettes, sprite/world navigation, artwork/script shortcuts, live property/data watchers and an enlarged play view. The [portable player](portable-playback.md) includes a runnable browser host, Python runtime, captured assets and a local launcher. All thirteen capability gates and the representative story/drawing/platformer/action-game workflows pass. The audit records exact scope and browser/device limitations; broader product and release work remains below.

## 3. Bridge to written Python

The implementation is complete under the [blocks and Python bridge plan](blocks-python-bridge-plan.md), verified in the [completion audit](blocks-python-bridge-audit.md). The non-executing parser, core expressions/control flow, scoped functions, function values, project/sprite/kind events, pinned modules and all current creative-library blocks convert with authored assets and inactive work preserved. The app provides [saved Python drafts, atomic Apply/Undo, recovery and separate generated-file inspection](python-and-blocks.md). Run and exports validate the active draft; replay cannot bypass changed text. All 185 browser regressions pass, including independent edited-project exports. The human learner pilot remains the next validation step.

- [x] Specify the first round-trip subset: assignments, expressions, conditionals, loops, functions, and curated library calls.
- [x] Add text editing with explicit handling of unsupported Python and syntax errors.
- [x] Preserve project behavior through supported blocks → text → blocks transformations.
- [x] Implement the six-task pilot workflow, starter projects, local observation records, timing, and project checkpoints.
- [ ] Run a learner pilot around prediction, code recognition, and small text edits using the [prepared protocol](python-bridge-learner-pilot.md).

Acceptance: switching views never silently loses learner work; pilot results inform whether and how to expand text editing.

## 4. AI agent assist mode

Implemented as an optional, read-only helper using the learner's own API key. See the [AI assist contract](ai-assist.md) for the connection, response catalog, privacy and verification limits. The pilot workflow was implemented first; actual human pilot sessions remain pending. The learner remains the sole author.

**Hard boundary: assistance only, no authoring.** The agent may explain selected blocks or Python, ask guiding questions, offer conceptual hints, and help diagnose a reported error. It may not create or edit blocks, Python, sprites, scenes, assets, or project files; generate complete solutions or replacement code; or apply fixes on the learner's behalf. It must not execute the project or send input automatically. Implement this boundary through read-only capabilities and response checks, not a prompt alone.

- The learner explicitly chooses what project context to share. Explain that the chosen provider receives it.
- Require a user-supplied API key; show provider/model selection, usage/cost information, cancellation, and clear unavailable/rate-limit errors.
- Keep keys out of project files, exports, source control, logs, and model context. Decide session-only storage versus an explicit secure persistence option before implementation.
- Design age-appropriate help that encourages prediction and experimentation without taking over. Provider support, browser/API connection architecture, privacy, and cost controls need a separate design.

Implementation decisions: session-only key memory; OpenAI as the initial provider with a selectable model ID; explicit context snapshot/review/send; fixed endpoint with no tools; strict catalog IDs rather than unrestricted generated prose; bounded requests and response size; cancellation, rate-limit errors and user-rate cost estimates. AI assist is disabled and its key cleared during pilot sessions. Other providers, free-form tutoring, secure persistence, and production hosting are not included. A paid live-provider check and human assessment of the help remain pending.

Acceptance: the helper can explain a failing program and suggest a debugging strategy, but requests to write code, add blocks, draw assets, edit files, or solve the project automatically leave the project unchanged. Users can disable the helper and clear their key at any time.

## 5. Make programs easier to find and debug

- [x] Search the block library and existing project blocks, including current functions, variables, modules and sprite defaults; keyboard insertion and Undo.
- [x] Pause, step into/over/out and resume real Python, with captured source, block highlighting, call stacks and bounded local/global values.

See [block search and Python debugging](debugging-and-search.md) for event scheduling, paused clocks, hosting requirements and verification. Expression-level stepping, breakpoints and value editing remain later extensions.

## 6. Prepare a release

- Owner chooses project license and confirms product name.
- Audit dependency and runtime notices.
- Define target devices and startup/memory budgets.
- Design untrusted-code isolation before any shared-project import or public gallery.
- Choose hosting and privacy requirements before accounts or analytics.

## 7. Learner experience: one-screen editor, guidance, academy, assets

Track A (the one-screen editor: shell, Starter/Builder/Pro levels, sprite tray and inspector, hat-block events and make-buttons, tablet pass) is implemented; its physical-iPad measurements are deferred, with a desktop baseline recorded (see the [implementation record](learner-experience-plan.md#210-implementation-record)). Track B (guidance: 55 reviewed recipes with test-rendered previews, a local wish matcher, an example gallery, six checked guided builds, Help-tab nudges, and AI assist that may only route to a reviewed recipe ID) is implemented and accepted; timed sessions with new testers for the guided builds are deferred to the pilot (see the [Track B record](learner-experience-plan.md#38-implementation-record)). **Stage view** (a large stage that pans and zooms across worlds sized in screens, with a minimap and Add screen) is implemented (see [section 2.11](learner-experience-plan.md#211-stage-view-and-big-worlds)). Tracks C and D are proposed, not started; the [creative tools and art plan](creative-tools-and-art-plan.md) proposes the next steps for D: a full-screen Paint editor, a Sound editor with voice effects, sharp stage rendering, and a redrawn, animated cast for the examples. The [learner experience plan](learner-experience-plan.md) measures the current page (about three tablet screens tall, 21 flat palette categories, dialog-only handler creation) and sequences four tracks: a fixed one-screen shell with Starter/Builder/Pro levels and hat-block events; intent recipes, an example gallery, guided game builds and recipe-routing AI assist; a Beast-Academy-style course taught through game building from events and loops to recursion and algorithms, with automatic checking; and referenced stock assets with animated characters, tilesets, a sound-effect generator and music loops. The learner pilot above should run against the new shell.

Each phase can change based on learner feedback. This is sequencing, not a delivery-date commitment.
