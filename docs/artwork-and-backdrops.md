# Artwork, animation frames and backdrops

The 2D editor supports original bitmap artwork, saved sprite frame sequences, and programmable backdrops. These extend the scene library and creation tools; the core language still uses ordinary Python objects, functions, loops, and explicit async calls.

## Stock library

**Sprite library** opens a visual picker with search and Characters, Objects and Tiles categories. It offers 20 costumes: Bird, Star, Ball, Box, Cat, Fox, Rabbit, Robot, Fish, Turtle, Bee, Rocket, Tree, Flower, Coin, Gem, and Grass, Stone, Sand and Metal tiles. Choosing one adds a sprite at the center of the current view, belonging to the selected world when there is one.

**Backdrop library** offers Meadow, Night, Forest, Coral reef, City park and Space. Choosing one changes the starting backdrop of the current world or base stage. **Worlds & tilemaps → World library** adds a complete editable map; see the [world guide](worlds-tilemaps-and-cameras.md).

The new stock art is original code-drawn artwork. Choosing it rasterizes a PNG into the project using the existing saved-art format; it needs no external asset service. The original six built-ins keep their existing IDs. New artwork receives a fresh ID, so a learner's asset named or identified as `cat`, for example, is never overwritten. An identical saved stock image is reused on later additions. Editing a shared image changes every sprite using it; duplicate the artwork for an independent variation.

Adding a sprite and its art is one project Undo action. Added copies remain available in **Artwork & frames**, save/reload and independent playable exports. They count toward the existing limits of 24 saved costumes and 12 saved backdrops. A limit or concurrent project edit rejects the addition without partially changing the scene.

Stock-library verification covers actual rendered thumbnails, search/category filtering, keyboard dismissal and focus return, narrow layouts, existing asset-ID preservation, image reuse, one-step Undo/Redo, save/reload and independent exported playback. See [browser coverage](../tests/e2e/stock-library.spec.ts) and [template layout checks](../tests/unit/stock-library.test.ts). World history controls remain available after undoing the only world.

## Create and edit artwork

Open **Artwork & frames** beneath the stage. Choose Costumes or Backdrops, then **New artwork**, **Import image**, or an existing asset. Built-in Bird, Star, Ball, Box, Meadow and Night provide starting points. Saving an edited built-in creates a new asset.

Brush, eraser, fill, line, rectangle, ellipse, and color picker work on transparent bitmap pixels. Shapes can be filled or outlined. Select a rectangle to move, flip, rotate or clear that area; without a selection, transforms affect the whole image. Arrow keys move a selection one pixel, Shift plus an arrow moves ten, and Delete clears it. Rotation keeps the canvas dimensions and can clip corners.

**Resize canvas** preserves pixels at the top left and crops or adds transparent space. **Scale image** resamples the entire image using nearest-neighbor scaling. Zoom changes the view only. **Download PNG** exports the current draft, excluding selection outlines and the previous-frame overlay.

Painting changes a draft. **Undo stroke** and **Redo stroke** navigate up to 30 draft snapshots. **Save artwork** commits pixels and name as one project Undo step; **Undo project edit** restores that saved edit. Asset navigation and frame changes require saving or discarding a dirty draft first. Closing the dialog retains the draft in memory, but reloading the page loses an unsaved draft. The button shows a draft indicator while one exists.

Assets are shared by stable ID. Saving an existing asset updates every sprite and frame using it; renaming preserves references. **Duplicate artwork**, **Duplicate frame**, and **Save as new** allocate independent asset IDs. If the scene changes while a closed draft exists, saving over an asset is rejected; Save as new can preserve the drawing.

Deleting a custom costume removes it from saved frame lists. Sprites showing it fall back to their first remaining frame or Bird. Deleting the active custom backdrop restores plain background color. Direct block references remain unresolved and produce diagnostics; project Undo restores the deleted asset and references. Built-ins cannot be deleted.

## Author an animation

Choose a sprite in the animation panel. Add artwork as frames, remove frames, move them earlier/later, or duplicate a frame to paint an independent variation. Repeated references to the same asset are allowed. Removing a frame keeps its asset available in the library; keep at least one frame.

Set and save seconds per frame, then **Preview animation**. The **Previous frame overlay** shows the preceding frame at 25% opacity while painting. It respects the selected position in sequences containing repeated frames and never changes saved pixels. Closing the dialog, changing assets, or starting a program stops the preview.

The Looks palette exposes **next costume**, **sprite animation frames**, and **play sprite animation once and wait**. The last block requires a handler or explicitly async function; use an ordinary loop for repeated animation. **Story example** demonstrates a saved four-frame sequence and Space-triggered backdrop changes.

```python
from playground import scene, sprites

player = sprites.named("Player")
frames = player.frames        # Independent list of saved costume IDs.
player.next_costume()         # Advances through saved order, including repeats.
await player.play_animation() # One pass using saved frame duration.
scene.set_backdrop("backdrop_night")
```

The awaited line belongs inside an async handler/function. `sprite.costume_id` and `sprite.frame_seconds` report the current costume and saved duration. `await sprite.animate(frames, seconds)` remains available for a program-supplied sequence. Setting a costume or starting another animation supersedes the previous animation. Clones copy frame order, duration, current frame position and sprite properties; changing one clone does not change the original.

## Backdrops and events

The starting-scene Backdrop selector chooses plain color, Meadow, Night, or custom artwork. A backdrop fills the 480 × 320 stage behind sprites. Transparent pixels reveal the stage background color. `scene.background(color)` changes that color without clearing the selected backdrop.

| API or event | Behavior |
| --- | --- |
| `scene.set_backdrop(id)` | Select an available backdrop ID; `None` selects plain color. Selecting the current value does nothing. |
| `scene.next_backdrop()` | Cycle built-ins followed by custom backdrops in saved order; plain color is not part of the cycle. |
| `scene.backdrop_id`, `scene.backdrop_name` | Report the current ID/name; plain color reports `None` and `"Plain color"`. |
| `backdrop:change` | Any actual programmatic backdrop change. |
| `backdrop:<id>` | Change to that particular backdrop; shortcuts are available in the handler editor. |

The payload is `{"id": id_or_none, "name": displayed_name}`. The global change event is queued before the specific event, using the existing FIFO cooperative event contract. Changes in Program startup queue events for handlers registered afterward. Loading the authored scene or restarting does not itself emit a change event. Ordinary sequential programs can change backdrops without an event session.

Reusable modules can use built-in backdrop IDs. Pass project-owned backdrop IDs as parameters, as with custom costume IDs and sprites. Direct project-owned references in a module export are rejected.

## Storage and bounds

Backdrops and frame operations were introduced in language version **10**; current exports use version **18**, also preserving pen/effects, instance behavior/sensing, game motion, worlds/cameras, game presentation, sound/music, touch controls and watchers. Projects from versions 1–17 and pinned modules from versions 5–17 remain readable. Existing scenes without frame metadata use their current costume as a one-frame sequence with a 0.1-second duration; missing backdrop metadata means plain color.

- Up to 24 custom costumes, each at most 256 × 256 pixels and 350,000 PNG data-URL characters.
- Up to 12 custom backdrops, each at most 480 × 320 pixels and 900,000 PNG data-URL characters.
- Up to 64 saved frames per sprite, including repeats; 0.02–10 seconds per frame. The runtime `animate` API separately accepts up to 100 frames.
- Import accepts PNG/JPEG/WebP files up to 2 MB and scales them to the appropriate dimensions. Saved artwork is embedded PNG.
- All scene data must fit within 12 MB UTF-8 and the entire project within 16 MB. Saving beyond these bounds fails without replacing the saved scene.

Project save/autosave includes saved pixels, frame order/duration, stable IDs and starting backdrop. Python source archives include the captured `scene.json` and its embedded assets. **Export playable** bundles the runtime and browser host with a local launcher; see [portable playback](portable-playback.md). Runtime changes never replace the saved starting scene.

## Implementation and evidence

`src/scene/raster.ts` implements deterministic pixel operations; `assets.ts` renders original built-ins and handles deletion fallbacks; `art-editor.ts` owns drafts, painting, frame controls and preview. The stage and Python runtime use the same saved asset IDs. Project import decodes images before replacing current work.

- [Raster and asset tests](../tests/unit/artwork.test.ts): fill boundaries, strokes/eraser, shapes, selection movement/transforms, crop/scale, limits and deletion fallback.
- [Compiler/project tests](../tests/unit/scene.test.ts): generated Python, scene export, migration, stable backdrop references, unresolved deletion, Undo and module boundaries.
- [Native runtime tests](../tests/python/test_scene.py): saved animation order/duration, repeated frames, clone independence, backdrop events and startup behavior.
- [Browser tests](../tests/e2e/artwork.spec.ts): actual paint/edit/Undo, stable asset management, reload pixels, frame ordering/preview and real Pyodide playback, backdrop events/restart, malformed-image recovery, draft protection, overlay isolation, examples and narrow layout.

The creation workflow was informed by Code.org's official [Animation Tab](https://studio.code.org/docs/concepts/game-lab/animation-tab/) and [multi-frame animation](https://studio.code.org/docs/concepts/game-lab/animation-tab/multi-frame-animations/) documentation: in-app image editing and import, ordered frames, preview speed and an onion-skin view. The implementation and built-in artwork are original.

Verified on 2026-10-07: `pnpm check` passed 160 TypeScript tests, 58 native Python tests, type checking and the production build; all 87 Chromium/Pyodide browser tests passed. Desktop painting/frame/story and 390-pixel artwork screenshots were visually inspected.

This closes the bitmap/frame authoring increment. Vector paths/layers and a full timeline are not provided. [Sprite pen and graphic effects](sprite-pen-effects.md), [instance behaviors](sprite-behaviors-and-sensing.md) and [game motion](game-motion-and-collisions.md) extend this work. The [2D parity plan](2d-parity-plan.md) records the related sound/music, sensing, editor and delivery increments; [game presentation](game-state-and-presentation.md) supplies HUD and finish/replay.
