# 2D creation parity completion audit

**Verified 2026-10-07.** Python Blocks meets all thirteen requirements in the [2D parity plan](2d-parity-plan.md). Learners can create animated stories, drawing projects, platformers and scrolling action games with original artwork and audio; program them with blocks backed by Python; inspect their state; save and reopen them; and run captured exports independently of the editor.

The baseline established before these increments combines Scratch's storytelling and animation workflow with MakeCode Arcade's game workflow. The [feature survey](research/block-programming-feature-survey.md) also informed artwork, watchers, scene navigation and creation tools. Its 68 entries are a planning vocabulary, not 68 commitments. The scope remains library behavior, content creation and editor integration together. Hardware, 3D, cloud communities and reversible text editing remain separate roadmap work.

## Verification

The final working tree passed these commands after the palette and save-file fixes described below:

| Command | Result and coverage |
| --- | --- |
| `pnpm check` | Type checking, **201 TypeScript tests**, **110 native Python tests**, standalone-player packaging and the production build passed. |
| `pnpm test:e2e` | **157 Chromium/Pyodide tests passed** against that production build, including all existing core-language regressions and nine independent playable-export tests. |
| `git diff --check` | Passed. |

Local Markdown link targets and all ten scene example JSON files were checked successfully.

The browser tests execute generated programs in bundled CPython 3.14.2. Native tests cover deterministic geometry, scheduling, ownership and validation; browser tests add authoring, actual input, canvas pixels, audio output, persistence and complete playthroughs. Test assertions were inspected against the individual requirements below. Counts alone are not the acceptance criterion.

Final screenshots were inspected for desktop story animation, the completed platformer, waveform editing, enlarged play at 390 pixels and the independent touch-game player. The running development editor was also inspected in the app browser. Earlier increment evidence records artwork, tilemap, music, input and watcher visual checks. Keyboard/focus and simulated multi-touch coverage is in Chromium; physical touch devices, screen readers, OS microphone dialogs and other browser engines are not certified by these checks.

## Requirement evidence

### D01 Sprite authoring and persistence

**Verified:** create, duplicate, delete, rename, place and inspect authored sprites with stable IDs. Duplication gives the new object its own identity. Stage dragging and property forms change saved starting state; runtime movement leaves it intact. Undo/Redo and save/load preserve scenes and embedded images. Deleting a referenced sprite produces a recoverable diagnostic, and Undo restores the reference.

Implementation: [scene editor](../src/scene/editor.ts), [scene state and Undo](../src/scene/state.ts), [model validation](../src/scene/model.ts). The [scene browser suite](../tests/e2e/scene.spec.ts) creates and duplicates a sprite, drags it, checks Undo/Redo/reload, verifies imported pixel colors after reopening, and checks rename/delete recovery and captured exports. The [artwork suite](../tests/e2e/artwork.spec.ts) verifies pixel replacement under a stable asset ID. Invalid imports preserve the open work.

### D02 Motion and spatial operations

**Verified:** position/direction/size/layer properties, change-by operations, move/turn, aiming, distance, glides, edge queries/bounce, three rotation styles and front/back ordering. Input and timed actions work alongside independent activities. Zero-distance aiming, corners, oversized actors and inward bounce are defined by the [motion contract](sprites-stage-input.md).

The [Python scene library](../src/runtime/scene.py) implements these operations; [scene blocks](../src/blocks/scene.ts) and the [compiler](../src/language/compiler.ts) expose them. [Native scene tests](../tests/python/test_scene.py) assert geometry, movement endpoints, cancellation and ordering. [Motion browser tests](../tests/e2e/scene-motion.spec.ts) exercise real pointer following, held keys, independent bounce, timed movement, persisted rotation styles and orientation pixels. [Compiler tests](../tests/unit/scene.test.ts) verify generated calls and source maps.

### D03 Looks and storytelling

**Verified:** immediate and awaited say/think, readable long dialogue, hide/show, saved costume sequences and timing, seven graphic effects and clearing, background/backdrop selection and backdrop-change events. A completed old speech timer cannot erase newer dialogue. Hidden/destroyed sprites remove their bubbles. Sprite and stage effects remain separate.

Evidence: [motion/dialogue tests](../tests/e2e/scene-motion.spec.ts), [artwork/story tests](../tests/e2e/artwork.spec.ts), [effect pixel tests](../tests/e2e/pen-effects.spec.ts), and [native animation/backdrop tests](../tests/python/test_scene.py). The original [Story example](../src/scene/story-example.json) animates saved frames while independent handlers change the backdrop and dialogue. [Portable story tests](../tests/e2e/playable.spec.ts) verify the same captured frames/backdrops outside the editor.

### D04 Sensing and input

**Verified:** key press/release and held state; pointer position, button, clicks and capture; rectangular, visible-pixel, point and edge sensing; rendered color and own-color contact with tolerance; elapsed timer/reset; queued ask/answer; and configurable touch controls. Typing in forms does not send stage keys. Blur/cancel releases input, and multiple physical/virtual sources aggregate without releasing another held source.

The [input guide](questions-timers-and-touch.md) defines these contracts. [Scene motion tests](../tests/e2e/scene-motion.spec.ts) verify pointer capture, release and focus. [Input browser tests](../tests/e2e/input-tools.spec.ts) verify FIFO questions, draft preservation, returned answers, literal Unicode text, cancellation on destroy/finish/Stop/replay, timer continuity, actual browser multi-touch and saved mappings. Color assertions cover immediate drawing/erasure, transformed transparent masks, layers, effects, translucent occluders, tiles, cameras and world transitions. The narrow example wins and replays using touch. [Pixel unit tests](../tests/unit/sensing.test.ts) and [native input tests](../tests/python/test_input_tools.py) cover geometry, clock control and bounds.

### D05 Instance behavior and lifetime

**Verified:** runtime creation/cloning/destruction, queued clone initialization, independent nested data, instance-owned handlers, broadcasts, coalesced update events, contact start/end and cancellation. Original/clone identity is explicit. Destroying an instance cancels its own waiting work; other instances continue. Stop/error clears services and handlers, and Run starts a fresh session.

Implementation: [behaviors](../src/runtime/behaviors.py), [events](../src/runtime/events.py), [data authoring](../src/scene/data-editor.ts), [event editor](../src/language/event-editor.ts). [Native behavior tests](../tests/python/test_behaviors.py) verify deep-copy isolation, context across waits, delivery order, payload snapshots, update coalescing, separation and atomic fanout limits. [Browser behavior tests](../tests/e2e/behaviors.spec.ts) exercise independently changing clones, owner cancellation, transparent-hole contact, saved typed data, behavior targeting, rename/Undo and errors after an await.

### D06 Sprite drawing

**Verified:** independent pen state, configurable color/width/opacity, drawing through movement/glides, clear and transformed stamps. Hidden sprites can draw/stamp. Stamps retain captured appearance after the source sprite changes or is destroyed. World ink stays anchored while cameras pan; reset/world restart follows the documented lifetime.

[Native scene tests](../tests/python/test_scene.py) verify trails, cancellation, copied pen state, validation and budgets. [Browser pen tests](../tests/e2e/pen-effects.spec.ts) assert actual trail and stamp pixels with scale, rotation and effects; clearing also erases turtle marks. [World tests](../tests/e2e/worlds.spec.ts) verify panning and restart. The [Drawing example](../src/scene/drawing-example.json) also runs from an independent export, where its rendered ink is checked before and after erasure in the [portable suite](../tests/e2e/playable.spec.ts).

### D07 Artwork and animation tools

**Verified:** in-app bitmap painting, erasing, connected fill, line/rectangle/ellipse shapes, selection movement, flip/rotation, crop/scale, import, asset naming/duplication/deletion, ordered animation frames, speed and preview. Costumes and backdrops retain stable references. Draft edits and saved project changes have distinct Undo behavior; stale drafts cannot silently overwrite newer artwork.

Implementation: [art editor](../src/scene/art-editor.ts), [raster operations](../src/scene/raster.ts), [asset management](../src/scene/assets.ts). [Raster tests](../tests/unit/artwork.test.ts) assert operation pixels, selection overlap, independent copies and deletion fallbacks. [Browser artwork tests](../tests/e2e/artwork.spec.ts) paint original pixels, transform selections, save/reload, manage assets, reorder/preview/play frames, edit backdrops, protect drafts and exercise narrow layouts. The [artwork guide](artwork-and-backdrops.md) records bitmap limits; vector paths/layers and a general timeline are not implemented.

### D08 Audio creation and playback

**Verified:** imported/recorded clips, waveform display and selection, trim, reverse/fades/gain/normalize, preview, asset management and saved layered melody/rhythm scores. Runtime sound blocks support volume/pan/pitch, overlap, completion-driven play-and-wait, stop, notes, instruments, rests and tempo. Channels belong to the stage or sprite; destruction, world changes, Stop and finish release the appropriate playback.

Implementation: [sound editor](../src/scene/sound-editor.ts), [sound assets/synthesis](../src/scene/sound.ts), [audio host](../src/runtime/audio.ts), [Python sound library](../src/runtime/sounds.py). [Browser tests](../tests/e2e/sounds.spec.ts) author and reload clips/songs, import WAV, record/decode with actual MediaRecorder, verify released tracks and denied/late permission recovery, and measure real audio, stereo pan, mute, overlap and completion. Recording uses a generated browser stream, not physical microphone hardware. [Native sound tests](../tests/python/test_sounds.py) verify ownership, waits, tempo capture, error origin and limits. [Portable tests](../tests/e2e/playable.spec.ts) measure output from exported music.

### D09 Arcade movement and collision response

**Verified:** velocity, acceleration/gravity, drag, controllers, grounded jumping, projectiles, lifetime/cleanup, sprite kinds, creation/collision events and slide/stop/bounce/destroy responses. Inspector presets, blocks, saved profiles and Python agree. Fixed-step swept collision catches thin static walls at maximum supported speed.

Implementation: [physics library](../src/runtime/physics.py) and [motion inspector](../src/scene/motion-editor.ts). [Native physics tests](../tests/python/test_physics.py) assert partition-independent integration, grounding, one-pixel walls in both directions, corners, oversized actors, controllers, projectiles and cancellation. [Browser physics tests](../tests/e2e/physics.spec.ts) verify authoring/Undo/export, kinds and errors, then shoot the platformer target, jump across its ledges to the goal and restart. The [motion guide](game-motion-and-collisions.md) explicitly defines the static arcade wall model and sampled non-solid overlap behavior.

### D10 Worlds and level authoring

**Verified:** named worlds, per-world backdrop/background/camera, local/global sprites, tile painting/erase/fill/rectangles, separate wall flags, resize/duplicate/remove, keyboard editing, overview placement, tile queries/events/runtime edits, camera position/follow/clamping and world transitions/restart. Sprites can be placed beyond the first viewport. Transitions retain global identities, reconstruct local state and discard stale local deliveries.

Implementation: [world editor](../src/scene/world-editor.ts), [world model](../src/scene/world.ts), [runtime worlds](../src/runtime/worlds.py). [Native world tests](../tests/python/test_worlds.py) cover coordinate boundaries, atomic edits, swept tile walls, camera/pointer transforms and transition ownership. [Browser world tests](../tests/e2e/worlds.spec.ts) author maps with grouped Undo/reload, place distant sprites, play the gate/portal adventure through both worlds, check world-coordinate clicks and runtime tile pixels, and recover from invalid data. The same adventure runs through the [portable player tests](../tests/e2e/playable.spec.ts).

### D11 Game presentation

**Verified:** score, lives, countdown, visibility controls, fixed instructions/HUD, custom expiry/zero-life events, win/loss, captured replay and finite confetti/sparkle/ring effects. HUD position is independent of the world camera. Finish cancels current, sibling and queued work. Play again restores the captured run; a new Run uses current edits.

Implementation: [Python game state](../src/runtime/game.py), [game presentation](../src/scene/game.ts), [stage](../src/stage.ts). [Native game tests](../tests/python/test_game.py) verify values, timer replacement/stop/expiry, terminal cancellation and reset. [Browser game tests](../tests/e2e/game.spec.ts) play the Star game through win, hazard loss and timeout, verify fixed HUD and literal text, and distinguish captured replay from edited code. Narrow/keyboard results and effects are covered. The [game guide](game-state-and-presentation.md) documents single-player counters and finite effects.

### D12 Editor and play workflow

**Verified:** focused palettes, selected-sprite defaults, searchable sprite thumbnails, world navigation/framing, costume/script shortcuts, saved property/data watches, enlarged stage, input help, source-linked errors and keyboard/focus controls. Enlarged play retains the live worker and keeps Run/Stop, questions, touch, audio, results and errors accessible. Read-only watches bound nested previews and do not call learner representation hooks.

Implementation: [palettes](../src/scene/palette.ts), [navigation](../src/scene/navigation.ts), [watches](../src/scene/watchers.ts), [play view](../src/scene/play-view.ts), [Python watch previews](../src/runtime/watchers.py). [Unit tests](../tests/unit/editor-workflow.test.ts) enumerate every scene/input block in the palette and check every sprite/other-sprite default. [Native watcher tests](../tests/python/test_watchers.py) verify real mutations and safe previews. [Editor browser tests](../tests/e2e/editor-workflow.spec.ts) verify navigation, references, Undo/reload, nested values, final sequential values, pointer scaling, preserved worker/drafts, focus return and a narrow touch win/replay. The [editor guide](editor-and-play-workflow.md) states accessibility coverage precisely.

### D13 Durability and portable delivery

**Verified:** versioned projects and module pins, asset capture, recovery, bounded execution, discoverable examples and guides, source export and independently runnable export. Current language version is 18; [project loading](../src/project/index.ts) accepts versions 1–18 and [module validation](../src/language/modules.ts) accepts 5–18. Migration assertions span the increment suites and existing core tests. Imports validate before replacing work. Authored state stays separate from runtime state throughout.

[Playable export](../src/project/playable-export.ts) captures editable blocks, exact main/module source, scene/assets, module metadata and source maps before asynchronous downloads. It validates paths, size limits and digests, then packages the [standalone host](../src/player/main.ts), local runtime, source/notices and [actual launcher](../scripts/serve-player.py). The [portable browser suite](../tests/e2e/playable.spec.ts) extracts real ZIPs, starts that launcher on a fresh port and blocks requests outside the export origin. Root and nested exports play stories, drawings, worlds, music and a touch/question game; editable capture reopens in the editor. Tests also verify transitive modules, traceback, immutable capture, cancellation, corrupted/missing files and watchdog recovery. [Boundary tests](../tests/unit/playable.test.ts) enforce path/manifest/stream limits.

The [near-limit project test](../tests/e2e/project-durability.spec.ts) imports a 15.85 MB project containing three 60-second clips, eight 64 × 64 tilemaps and an inactive text draft. Save produces a file under the 16 MB import limit, the saved assets/draft match exactly, reopening succeeds, and its Python program runs and stops. The [event runtime tests](../tests/e2e/event-runtime.spec.ts), [runner tests](../tests/unit/runner.test.ts) and native suites retain cancellation, overload, worker replacement and non-yielding-loop bounds. These are execution controls, not a claim of hostile-code security isolation.

## Representative projects and plan gates

The six implementation steps in the plan are covered by D01–D13 above. Step six additionally required representative projects and complete browser walkthroughs:

| Editable project | Verified creative workflow |
| --- | --- |
| [Story](../src/scene/story-example.json) | Saved costume frames, independent animation, timed dialogue and backdrop events; editor and portable playback. |
| [Drawing](../src/scene/drawing-example.json) | Independent pens, trails and transformed stamps; keyboard erasure and fresh restart; editor and portable playback. |
| [Platformer](../src/scene/game-example.json) | Controller movement, gravity, grounded jumps, projectile target and ledge-to-goal playthrough; restart restores the course. |
| [Star game](../src/scene/star-game-example.json) | Scrolling collection/hazards, score/lives/countdown, win/loss and captured replay. |
| [Worlds](../src/scene/world-example.json) | Tile switch opens a solid gate, camera follows to a portal, second world initializes, restart restores authored state; portable playback. |
| [Music](../src/scene/sound-example.json) | Editable melody/drums plus independent key-triggered audio, measured playback and Stop; portable playback. |
| [Input and color](../src/scene/input-example.json) | Ask/answer, elapsed time, color sensing and touch movement through win/replay, including enlarged and portable play. |

Sprite, Motion and Behavior examples supply focused introductions. All ten scene example JSON files are present and linked to visible example controls. The [README](../README.md), implementation guides and [portable instructions](portable-playback.md) explain how to run, edit, save and export them.

## Survey coverage and remaining product scope

The completion claim is practical 2D creation parity under the original plan. The following mapping keeps broader survey capabilities and documented differences visible:

| Survey group | Coverage and boundary |
| --- | --- |
| C01–C16 language | Existing Python foundation retained, with its [core completion audit](core-language-completion-audit.md) and full regression. Cooperative async and native Python values remain intentional. |
| L01–L07, L09–L14, L22 | Drawing, sprite lifecycle/appearance/animation, sensing/collisions, movement, worlds/camera, keyboard/touch, sound/music, HUD and transitions are covered above. Device-specific portions of L11 remain outside this browser 2D module. |
| L08 | Static arcade walls/tiles and acceleration/gravity are supported. General rigid-body forces, momentum exchange and moving-platform conveyors are a separate physics scope. Sampled non-solid overlap can miss extremely fast crossings. |
| L15–L21 | General app UI, persistent app databases, hardware, connectivity, data logging/charts, external recognition services and 3D remain separate product areas. |
| T01–T07, T09 | Bitmap art, pixel tools, frames, recording, waveform edits, songs, tilemaps and image/audio import are covered. Vector paths/layers, a general timeline and multiple tile/parallax layers are not implemented. Sprites have independent depth and world membership. |
| T08, T10 | 3D construction and a general screen/component designer are separate. |
| E01–E08, E10–E13, E17–E19 | Connected blocks, organized palettes, procedure/reference editing, scene/asset navigation, placement, Run/Stop/replay, sprite property/data watches, code preview, save/recovery/export, Undo and examples are available. E02 has focused palettes and sprite search, without a general block-search command. E10 watches sprite state/data rather than arbitrary Python locals. E11 provides generated code preview; text round-tripping is the next language roadmap phase. E18 evidence is the keyboard/focus/layout coverage stated above. |
| E09, E14–E16, E20 | General pause/step debugging, device deployment, an extension marketplace, guided curriculum and cloud sharing/source-control UI are separate. Portable ZIPs and editable project files support local handoff. |

The game HUD provides single-player counters; multiplayer counters, persistent high scores and a general HUD layout tool remain extensions. The editor remains a prototype, with resource limits documented per library and a build warning for its large main JavaScript chunk. Full browser/device compatibility, performance targets, license/name decisions, public hosting and hostile-project isolation belong to release preparation.

The roadmap preserves the future **BYO API key, assistance-only AI helper**: no block/code/asset authoring or edits, no complete replacement solutions, no automatic execution or input. No AI integration is part of this delivery.

## Audit fixes and disposition

The audit corrected selected-sprite defaults in the Worlds and sensing palettes, including choosing a different sprite for binary contact queries when one is available. It also changed Save project to compact JSON: pretty-printing a large valid project could previously create an export above the loader's size limit. The corresponding unit and browser assertions pass. Older guides now describe the implemented sound, sensing, game and portable features and current format compatibility.

All D01–D13 acceptance gates, representative-project gates and final regression gates are satisfied. No required 2D parity item remains open. The separate roadmap phases and the explicit limits above remain visible without changing the completed baseline.
