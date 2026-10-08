# Editor navigation, watchers and large-stage play

This increment addresses D12 in the [2D parity plan](2d-parity-plan.md). It builds on the existing artwork, world, sound, input and mapped-error tools. Saved authoring data remains separate from runtime output.

## Find blocks and sprites

The former long Sprites palette is split into smaller categories:

| Category | Contents |
| --- | --- |
| Sprites | Object references, lookup/create/clone/destroy, instance data and kinds. |
| Motion | Move/turn, coordinates, change-by, aiming, glide, bounce and rotation style. |
| Looks | Costume/frame animation, dialogue, visibility/layers, backdrops and graphic effects. |
| Physics | Velocity/acceleration, controllers, grounded jumping, collisions and projectiles. |
| Sprite pen | Independent pens, line settings, stamps and erasure. |
| Sensing & input | Property/key/pointer reporters, distance/contact/color, timers and questions. |
| Worlds | World transitions, camera and tile operations. |
| Sounds / Game | Audio/music and HUD/game-flow operations. |

Sprite inputs in newly opened palettes default to the selected authored sprite. Object/world reference blocks use dropdowns, so a large project does not create dozens of duplicate palette entries. Every existing block remains supported; saved programs do not change during palette navigation.

The scene inspector includes a thumbnail browser. **Find sprite** filters by name, kind or world. Cards and the existing Sprite dropdown select the same stable object. **Edit costume** opens that sprite's current artwork, even if the artwork editor previously showed a backdrop or another costume. An unfinished artwork draft is preserved with an explanatory message; selecting another sprite does not discard it.

**Starting world** changes the authored starting world and participates in Undo/save. **Find on stage** switches to a selected sprite's owning world if necessary, then temporarily centers the camera on it within map bounds. World selection is saved; the framing itself does not change the saved camera profile. Reset stage or another scene refresh restores that profile. The operation never changes sprite coordinates. Global sprites can be framed in the current world.

**Scripts for sprite** lists its direct handlers, matching kind handlers and shared project handlers. **Go to script** highlights and centers the selected handler in the blocks workspace. Existing Events tools still create/edit handler ownership and order. The scene inspector scrolls independently and the blocks workspace has a bounded height, keeping controls usable as projects and library tools grow.

## Watch live values

Open **Watch sprite values**, choose an authored sprite and a property, and select **Add watcher**. Supported properties are x, y, direction, size, visibility, costume ID, kind, layer, horizontal/vertical velocity, grounded state, and a named data key. Up to 12 watches can be pinned. Remove a watcher in the same panel; both addition and removal participate in project Undo. Watch definitions save with the project, preserve sprite IDs across rename and are included in captured source exports.

| Phase | Display |
| --- | --- |
| Starting values | Saved authoring values. Grounded state requires a Run. Missing data keys and deleted references have explicit labels. |
| Live values | Read-only values from actual Python objects, refreshed at most every 100 ms. Unchanged results are not resent. |
| Last run values | Last received values after Stop/error; normal completion also publishes a final snapshot. Reset stage restores starting values. |

Nested data mutations are visible even when they occur through aliases or ordinary collection blocks. Lists/tuples/dictionaries have bounded previews: up to four items per container, three levels and 120 Unicode code points overall. Long text and very large integers are abbreviated. Other objects display `<object>` without invoking learner-defined representation methods. Exact Python numeric text is retained when it fits. Non-yielding code can delay live updates; the existing responsiveness watchdog remains in force.

An inactive world-local sprite or destroyed sprite displays **Sprite not active**, and a missing data key displays **Key not set**. A deleted authored reference stays recoverable through Undo instead of silently attaching to a new sprite of the same name. Watches target authored sprite identities; they do not automatically follow clones. Runtime values are never saved back into the starting scene. Watch configuration is read-only during a run and its captured result; Reset stage enables changes. Replay uses the captured definitions.

Watch outputs use literal text, wrap long previews and avoid announcing ten updates per second to assistive technology. The current values remain readable in the accessibility tree. They do not consume the project's drawing/scene-command budget, dispatch learner events or edit project data.

## Play on a larger stage

**Large stage** opens a modal play view containing the existing canvas, HUD/results, touch controller, questions, watches, dialogue and audio controls. It moves those same live elements, preserving the worker and its state. Logical coordinates remain 480 × 320; pointer input scales to the displayed rectangle and still accounts for the world camera.

The play header provides Run code, Stop and **Return to editor**. Keyboard focus remains in the modal. Escape on the stage returns to the editor; Escape inside a question first cancels that question, following its input contract. Entering/leaving the view releases held input to prevent stuck movement. Closing it restores the elements to their previous editor locations and returns focus to Large stage. Run and captured **Play again** retain their existing distinction.

Runtime errors remain visible in the play view and the editor's mapped block/traceback diagnostics remain available after returning. Touch and keyboard gameplay, questions, win/loss/replay and Stop work at narrow widths. This is a browser modal with an enlarged stage, not an operating-system fullscreen request. Existing [input help](questions-timers-and-touch.md), keyboard-operable artwork/world/music tools, literal text rendering and focus-reset rules continue to apply.

## Format and evidence

Language version 18 adds optional `scene.watchers`. Earlier projects and pinned modules remain readable, with no watches by default. There are no new language semantics or authoring APIs for the readout UI.

- [Editor model/compiler tests](../tests/unit/editor-workflow.test.ts) verify complete, nonduplicated scene/input palette coverage, selected-sprite defaults, watcher validation/bounds, missing-reference recovery, version-17 migration and captured export.
- [Native watcher tests](../tests/python/test_watchers.py) cover real object/data mutation, missing/inactive states, grounded queries, recursive/large values and previews that never invoke custom representation or collection overrides.
- [Editor browser tests](../tests/e2e/editor-workflow.spec.ts) cover palette navigation, costume/script shortcuts, world selection/Undo, watcher authoring/rename/reload/nested mutations/destruction/reset, malformed imports, final sequential values, preservation of a live worker, scaled pointer coordinates, question/error controls and narrow keyboard/touch authoring and play. Desktop navigation/watch/play and narrow watch/play screenshots are inspected.

The automated accessibility evidence covers native labels, focus, keyboard activation, modal containment and narrow layouts in Chromium. It does not claim a physical device or screen-reader certification. The [portable player](portable-playback.md) carries this play workflow into independent exports. The [completion audit](2d-parity-audit.md) verifies the complete practical 2D baseline and records remaining product limits.
