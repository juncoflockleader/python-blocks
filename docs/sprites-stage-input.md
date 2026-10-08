# Sprites stage and input

This module adds authored 2D scenes and a Python sprite library to the existing block language. Sprite properties, costumes, input, and timing are library operations; the existing variables, functions, handlers, and explicit async calls remain the language foundation.

## Try the example

Choose **Sprite example** below the stage, then **Run code**. Click the stage to focus it. The arrow keys move Player in steps while Friend glides independently. Clicking Player prints a greeting. The space handler demonstrates a query of the current held-key state; a very quick press may already be released when the handler runs.

**Motion example** adds pointer following, an independently bouncing ball, speech/thought bubbles and left/right rotation. Hold the primary pointer button on the stage to lead the bird; Space prints whether it is currently held. Both examples are saved projects with ordinary editable blocks.

**Story example** animates saved costume frames while Space changes the backdrop and a thought bubble reports its name. **Artwork & frames** opens bitmap painting, asset management and animation preview; see the [artwork guide](artwork-and-backdrops.md).

**Drawing example** uses two independent pens and colored stamps. **Pen & graphic effects** edits initial appearance, and the Sprite pen and Looks palettes supply runtime operations; see the [pen/effects guide](sprite-pen-effects.md).

**Behavior example** adds independently updating clones, per-instance data and contact/click behaviors. **Sprite data & behavior** edits starting values and attaches handlers; see the [behavior and sensing guide](sprite-behaviors-and-sensing.md).

**Platformer example** uses automatic motion, gravity, controllers, jumping and projectiles. **Game motion & collisions** supplies presets and saved settings; see the [game motion guide](game-motion-and-collisions.md).

**Stop** cancels all activities and leaves the final scene visible. **Reset stage** restores the saved starting layout and enables scene editing. Every new Run starts from that layout. Reloading a saved project restores its authored positions, not the last runtime positions.

## Authoring and persistence

- Add, name, duplicate, select, or delete sprites in the scene editor. Set their initial x/y, direction, size, layer, visibility, and costume. Apply records one Undo operation.
- Drag a sprite on the stage to place it. A completed drag is one Undo operation; a cancelled pointer gesture restores the prior position. Numeric fields provide a keyboard-accessible placement alternative.
- Built-in costumes are Bird, Star, Ball, and Box. **Import costume** accepts PNG, JPEG, or WebP up to 2 MB, scales it to fit 256 × 256 pixels, and embeds a PNG copy in the project. Imported costumes are selectable for any sprite. Image import and its assignment to the selected sprite are undoable together.
- Paint and edit custom costumes or backdrops in **Artwork & frames**. Assets have stable IDs; rename and pixel edits preserve references. Duplicate creates independent artwork. Sprites save an ordered frame list and duration. Select plain color, Meadow, Night, or custom artwork as the starting backdrop.
- The stage is 480 × 320 pixels. Its origin is the center, x increases right, y increases up, and zero degrees points right. Positive rotation is clockwise. Size is a percentage of the costume dimensions. Higher layers draw in front; equal layers retain creation order. Sprites outside the stage are clipped.
- Rotation style can be all-around, left/right only, or no visual rotation. It changes costume rendering and sensing bounds without changing the direction used by movement. Left/right flips horizontally when the heading points left. The property inspector saves the starting style and includes it in Undo.
- The Sprites palette contains authored references and object/data operations. Motion, Looks, Physics, Sprite pen and Sensing & input organize the other operations. References retain stable IDs across rename, Undo and reload. Deleting a sprite leaves its blocks unresolved; creating another with the same name does not repair them. Duplicate sprite creates an independent object with a fresh ID and leaves existing script references intact.
- **Input events** opens the existing handler editor, whose **Input shortcut** selects startup, key press/release, stage click, or an authored sprite click. Click handlers retain the sprite ID even when it is renamed. Deleting their sprite produces a diagnostic.

Project language version **18** adds saved watcher definitions; version **17** added questions/timers, color sensing and touch mappings; version **16** added sound/music; version **15** added game state/HUD/result blocks; version **14** added named worlds, tilemaps, camera profiles and sprite world membership after version 13 added game motion/kinds and version 12 added per-instance behavior, starting data and pixel sensing to the version-8 scene, version-9 motion/dialogue, version-10 backdrop/frame and version-11 pen/effects foundation. Versions 1–17 load with an empty scene if none was saved, and missing rotation styles default to all-around. Missing frame metadata uses the current costume and a 0.1-second duration. Missing pen/effects metadata uses an up pen and zero effects. Missing data defaults to an empty dictionary and missing handler targets remain project handlers. Module versions 5–18 remain readable. Missing watcher definitions mean no pinned values. Missing touch mappings use Space/X. Existing module pins retain their original contents.

## Python API

Generated imports use reserved `_pb_` aliases so existing learner variables named `sprites`, `scene`, or `inputs` keep their meanings. The public library objects are available from `playground`:

```python
from playground import scene, sprites, inputs

scene.load("scene.json")
player = sprites.named("Player")
player.move(20)
player.set("size", 125)
```

| Operation | Python behavior |
| --- | --- |
| Authored reference | `sprites.named(name)` selects the authored name emitted for its saved ID. Rename regenerates the name. |
| Dynamic lookup | `sprites.get(name_or_id)` accepts a name or runtime ID, including a click payload's sprite ID. Missing targets raise `KeyError`. |
| Runtime creation | `sprites.create(costume_id)` returns a new sprite at the center with size 100%, direction/layer zero, and visibility enabled. |
| Move and transform | `move(steps)`, `turn(degrees)`, `go_to(x, y)`, and `set(property, value)`. Settable properties are x, y, direction, size, and layer. |
| Relative changes and aiming | `change(property, amount)`, `point_towards(x, y)`, and `distance_to(x, y)`. Aim at another sprite or the pointer using their x/y reporters. Aiming at the same position preserves direction. |
| Read properties | `sprite.x`, `.y`, `.direction`, `.size`, `.layer`, `.visible`, `.name`, `.id`, `.width` and `.height`. Width/height are the scaled, rotated enclosing bounds. |
| Rotation and layering | `rotation_style("all" / "left-right" / "none")`; `to_layer("front" / "back")` preserves other sprites' relative order and compacts layer numbers to stay bounded. |
| Appearance | `show()`, `hide()`, and `costume(costume_id)`. The costume value block selects a stable asset ID. |
| Clone and destroy | `clone()` returns an independent copy of the current properties; assets are shared. `destroy()` removes it. Further operations on the destroyed object raise a useful error. |
| Overlap | `sprite.overlaps(other)` compares axis-aligned bounds enclosing the rotated costumes. Hidden sprites and self-comparisons return false; merely touching edges is not overlap. This does not model pixel transparency, walls, or physics. |
| Point and edge sensing | `touching_point(x, y)` uses those enclosing bounds and returns false when hidden. `touching_edge("any" / "left" / "right" / "top" / "bottom")` compares bounds to stage edges, including exact edge contact. Edge geometry remains available for hidden sprites. |
| Edge bounce | `bounce()` reflects outward motion at contacted edges and fences the sprite back inside. Corner contact reflects both components; a heading already pointing inward is preserved. An oversized sprite is centered on any axis where it cannot fit. |
| Dialogue | `say(text, "say" / "think")` displays a bubble; empty text clears it. `await say_for(text, seconds, style)` displays and waits, then clears only its own message. New dialogue supersedes the old timer; hiding/destroying a sprite hides/removes its bubble. Text is also exposed beneath the stage for assistive technology. |
| Timed movement | `await sprite.glide(seconds, x, y)` interpolates over elapsed time, yielding at up to 30 updates per second. Zero duration still yields once. |
| Costume animation | `await sprite.animate(costume_list, seconds_per_costume)` plays the supplied list once and waits for each frame. Use an ordinary loop to repeat it. |
| Saved frames | `next_costume()` advances through authored frames, including repeated IDs. `await play_animation()` plays one pass using saved timing. `.frames` returns an independent list; `.frame_seconds` and `.costume_id` report duration and current costume. |
| Keyboard state | `inputs.key_down(key)` reads the current held-key state. It requires an event session in the block editor. |
| Pointer state | `inputs.pointer_x`, `.pointer_y`, `.pointer_down`, `.pointer_inside` read the current primary pointer state in an event session. Positions use centered stage coordinates, clamped at edges while captured outside. |
| Background | `scene.background("#RRGGBB")` changes the runtime background. The editor's color field changes the authored background. |
| Backdrops | `scene.set_backdrop(id_or_none)`, `scene.next_backdrop()`, `.backdrop_id` and `.backdrop_name` select/cycle/report artwork. Changing the background color leaves the backdrop selected. |
| Sprite drawing | `pen_down()`, `pen_up()`, `set_pen(property, value)`, `change_pen(property, amount)`, `pen_value(property)` and `stamp()`. Pens draw even when hidden; stamps capture appearance. `scene.clear_pen()` clears all marks without resetting positions/settings. |
| Graphic effects | Sprites and scene provide `set_effect(name, value)`, `change_effect(name, amount)`, `get_effect(name)` and `clear_effects()`. Color, brightness, ghost, whirl, fisheye, pixelate and mosaic affect rendered pixels without editing assets. |

Sprites are ordinary Python objects: variables, lists, parameters, returns and aliases can refer to them. Runtime creation and cloning do not create saved editor objects. Motion settings and kinds are copied with a clone. Clones share their template’s owned behavior definitions and deep-copy its current data. `create()` has no authored behavior template. A new position command supersedes an older glide for that sprite; a new costume command supersedes its older animation. Destroying a sprite ends its pending timed actions. Other activities keep progressing at explicit yield points.

Timed blocks require a handler or explicitly async function and use the existing session's cancellation and watchdog rules. Wrong types, invalid ranges, missing costumes, destroyed objects and resource limits produce Python exceptions. Statement source maps identify the offending operation; editing during execution retains the earlier compilation's error attribution.

Reusable function modules may accept sprites, costume IDs and backdrop IDs through parameters, operate on them, and return them. They may use built-in artwork. Export rejects direct references to project-owned sprites or artwork: the caller must supply those dependencies explicitly.

## Input contract

Physical keyboard input is active only while the stage is focused and an event session is ready. The on-screen controller sends the same key protocol through independently held buttons; see the [input guide](questions-timers-and-touch.md). Supported keys are arrows, space, letters and digits. Letters follow the character reported by the keyboard layout, normalized to lowercase. Modifier shortcuts remain available to the browser/editor. Repeated keydown messages are suppressed until release. Switching focus, hiding the page, Stop, or restart clears held state.

| Event name | Payload |
| --- | --- |
| `key:ArrowRight`, `key:a`, `key:Space`, etc. | `{"key": "ArrowRight"}` with the selected key. One event per press. |
| `release:ArrowRight`, etc. | The same key payload, on release. Focus loss clears state without synthesizing release handlers. |
| `stage:click` | Centered `x`, `y`, and the topmost visible `sprite` ID, or `None` for empty space. |
| `click:<authored-sprite-id>` | The same click payload, also sent to the clicked authored sprite's handlers. |
| `stage:press`, `stage:release` | `x`, `y` and Boolean `inside` at a primary-pointer button transition. Release outside the stage is captured. |
| `backdrop:change`, `backdrop:<id>` | `id` (or `None`) and `name`. Actual programmatic changes queue the global event before the specific one. Startup changes are queued; initial scene loading is silent. |

Primary pointer presses support mouse, pen and touch. Hit testing selects the foremost visible costume pixel, accounting for transparency, transforms and effects. Existing bounds-based overlap queries retain their geometric contract. Stage-click delivery is queued before sprite-click delivery. Payloads describe the input event; key-state queries describe the current state when executed. Queued handlers may run after a key is released. Existing bounded input acknowledgements, event ordering, per-handler payload snapshots, failure cancellation and stale-worker filtering remain in force.

Pointer position updates are coalesced to animation frames in the editor and to the latest outstanding position under worker pressure. Button transitions are retained, and update Python state before their handlers are queued. Press precedes the existing stage-click/sprite-click delivery. Focus loss, pointer cancellation, Stop and restart clear held state; focus loss does not synthesize release handlers. The pointer is tracked over the stage even before a click focuses keyboard input.

Browser implementation references: [keyboard key and code semantics](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code), [pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture), and [image decoding](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap).

## Limits and export

- Up to 64 authored sprites, 128 live sprites including runtime copies, 24 custom costumes and 12 custom backdrops.
- Coordinates from −1,000,000 to 1,000,000; size 5–400%; layers −1000 to 1000. Coordinates and properties must be finite numbers; Boolean values do not silently become numbers.
- Glides last 0–60 seconds. Runtime animation lists contain 1–100 available costumes; authored sequences contain 1–64 frames. Timing is 0.02–10 seconds per costume.
- Dialogue supports up to 240 UTF-16 code units. Timed dialogue lasts 0–60 seconds and yields even for zero duration. Long text wraps; the canvas shows at most 12 lines, with the full text retained in the accessible caption. Speech accepts text explicitly; use the text-conversion block for numeric values.
- At most 50,000 sprite/background changes per run. Existing event, output, watchdog and project limits still apply.
- At most 10,000 sprite pen marks (segments, dots and stamps) within that scene-command budget. Erasing does not replenish the budget. Pen width is 1–1200 pixels; opacity is 0–100. See the pen/effects guide for effect bounds.
- Costume PNGs are at most 256 × 256 pixels and 350,000 data-URL characters; backdrop PNGs are at most 480 × 320 and 900,000 characters. The scene has a 12 MB UTF-8 limit and must also fit within the complete 16 MB project limit.

Scene projects export a Python source ZIP containing the captured main/module files and **scene.json**, including imported image data. Keep these together. Source archives need the playground runtime and browser host. **Export playable** bundles both with a local launcher; see [portable playback](portable-playback.md). **Save project** remains the editable format.

## Verification and further work

[Scene model/compiler tests](../tests/unit/scene.test.ts) cover stable references, rename/delete/Undo, cross-project copies, captured scenes, exports, version compatibility, malformed input, diagnostics and module boundaries. [Native Python tests](../tests/python/test_scene.py) cover transforms, overlap, aliases/clones, lifetime, limits, input transitions and deterministic timed-action behavior. [Browser tests](../tests/e2e/scene.spec.ts) cover actual authoring, drag/Undo/reload, input, independent activity, images, source archives and recovery.

Verified on 2026-10-07 after the motion/dialogue extension: `pnpm check` passed 150 TypeScript tests, 53 native Python tests, type checking and the production build. After the final dialogue wrapping/layout fixes, the build and `pnpm test:e2e` passed all 77 Chromium/Pyodide tests. The [motion browser tests](../tests/e2e/scene-motion.spec.ts) add pointer capture/focus loss, speech replacement, rotation pixel checks, Undo/reload and long dialogue at 390 pixels. Desktop and narrow screenshots were visually inspected; scene controls and text fit without page overflow.

The [artwork guide](artwork-and-backdrops.md#implementation-and-evidence) adds bitmap/frame/backdrop evidence, and the [pen/effects guide](sprite-pen-effects.md#evidence-and-baseline) adds drawing and appearance evidence. The [behavior/sensing guide](sprite-behaviors-and-sensing.md) adds clone initialization, per-instance data/handlers, update/contact events and pixel-aware hit testing. The [game motion guide](game-motion-and-collisions.md) adds velocity, gravity, controllers, projectiles, kinds and collision response. The [worlds guide](worlds-tilemaps-and-cameras.md) adds tilemap tools, scrolling cameras, local/global sprites, tile events and named-world transitions. The [game presentation guide](game-state-and-presentation.md) adds score/lives/countdown, fixed HUD, win/loss, captured replay and finite effects. The [sound/music guide](sound-and-music.md) adds audio creation and playback. The [input guide](questions-timers-and-touch.md) adds queued questions, elapsed timers, configurable touch controls and rendered color sensing. The [editor/play guide](editor-and-play-workflow.md) adds navigation, live watches and enlarged play. The [portable player](portable-playback.md) packages the runtime, browser host, source, assets and editable project with a local launcher. The [completion audit](2d-parity-audit.md) verifies the full 2D baseline. The future AI assist mode is recorded in the [roadmap](roadmap.md#4-ai-agent-assist-mode): user-supplied API keys, read-only help, and a hard prohibition on agent authoring or edits.

Verification after the artwork/backdrop increment: 160 TypeScript tests, 58 native Python tests and all 87 Chromium/Pyodide browser tests passed, along with type checking and production build. The [artwork tests](../tests/e2e/artwork.spec.ts) add original pixels, frame ordering/preview, real animation, backdrop startup/runtime events, malformed image recovery, draft preservation and narrow layout evidence. Subsequent verification is recorded in the parity plan.

The [2D parity plan](2d-parity-plan.md) and [completion audit](2d-parity-audit.md) record the completed practical 2D baseline, its acceptance evidence and remaining product limits.
