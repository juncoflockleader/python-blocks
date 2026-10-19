# Artwork, animation frames and backdrops

The 2D editor supports original bitmap artwork, saved sprite frame sequences, and programmable backdrops. These extend the scene library and creation tools; the core language still uses ordinary Python objects, functions, loops, and explicit async calls.

## Stock library

**Sprite library** opens a visual picker with search and Characters, Objects and Tiles categories. It offers 20 costumes: Bird, Star, Ball, Box, Cat, Fox, Rabbit, Robot, Fish, Turtle, Bee, Rocket, Tree, Flower, Coin, Gem, and Grass, Stone, Sand and Metal tiles. Choosing one adds a sprite at the center of the current view, belonging to the selected world when there is one.

**Backdrop library** offers Meadow, Night, Forest, Coral reef, City park and Space. Choosing one changes the starting backdrop of the current world or base stage. **Worlds & tilemaps → World library** adds a complete editable map; see the [world guide](worlds-tilemaps-and-cameras.md).

The new stock art is original code-drawn artwork. Choosing it rasterizes a PNG into the project at 2× (a 64-unit costume is stored as 128 × 128 pixels and marked `resolution: 2`), so it stays sharp on high-density screens; it needs no external asset service. The original six built-ins keep their existing IDs. New artwork receives a fresh ID, so a learner's asset named or identified as `cat`, for example, is never overwritten. An identical saved stock image is reused on later additions. Editing a shared image changes every sprite using it; duplicate the artwork for an independent variation.

Adding a sprite and its art is one project Undo action. Added copies can be changed in the **Paint** editor and travel with save/reload and independent playable exports. They count toward the existing limits of 24 saved costumes and 12 saved backdrops. A limit or concurrent project edit rejects the addition without partially changing the scene.

Stock-library verification covers actual rendered thumbnails, search/category filtering, keyboard dismissal and focus return, narrow layouts, existing asset-ID preservation, image reuse, one-step Undo/Redo, save/reload and independent exported playback. See [browser coverage](../tests/e2e/stock-library.spec.ts) and [template layout checks](../tests/unit/stock-library.test.ts). World history controls remain available after undoing the only world.

## The Paint editor

**Paint**, under the stage, opens the selected sprite's costumes full screen (with no sprite selected it paints a new sprite). **Edit costume** in the Sprite tab does the same, **Paint a backdrop** under Stage & assets opens the stage's backdrops, and **Paint tile** in Worlds & tilemaps opens the current world's tiles. The editor fits one tablet screen without scrolling, and every control is at least 44 px:

- **Tools** on the left, each a symbol and a word: Brush, Eraser, Fill, Line, Box, Oval, Text, Select and Pick (keys B, E, F, L, R, O, T, S, I). Shift keeps lines at 45° steps and boxes and ovals square.
- **Colour and size**: twelve swatches, a custom colour, the last three colours used, and a size slider with a live dot. Box and Oval add Filled / Outline; Fill adds Solid, Down (fades lighter towards the bottom, for skies and water) and Glow (lighter in the middle). Fill matches nearby colours, so it fills smooth drawings without gaps, and slips under half-transparent edges.
- **Canvas** in the middle on a checkerboard, with a cross at the costume's centre (sprites turn around it). Pinch or Ctrl/⌘ + scroll zooms, two fingers or scroll pans, and Fit shows it all; zoomed in, pixels show as crisp squares. **More** flips, turns a quarter, changes the canvas size (keeping the picture in the middle, or stretching it), centres the drawing, downloads a PNG or clears the canvas.
- **Select** drags a box; drag inside it to move what it holds, or use its bar: Flip ↔, Flip ↕, Turn, Copy (leaves a copy and moves the other), Delete and Place. Arrow keys move it one unit, Shift + arrow ten, Delete removes it.
- **Text** places a line of words where you tap, in the chosen colour and size; Enter paints it.
- **Smooth / Pixel**: Smooth draws soft-edged strokes and is the default for costumes and backdrops. Pixel paints whole squares, shows a grid when zoomed in, and is the default for tiles.

Pictures are painted at 2× (two pixels per stage unit), so they stay sharp on the stage. When Done saves a picture whose every 2 × 2 block is one colour (pixel art), it is stored at 1× instead, so tiles and pixel sprites stay crisp. Built-in artwork (Bird, Star, Ball, Box, Meadow, Night) opens as a picture; changing it makes a new costume or backdrop and the built-in stays as it was.

**Nothing is saved until Done**, and nothing is ever refused for unsaved work: switch costumes, add frames or change tools at any time. Undo and Redo in the editor step back through strokes and frame changes across every costume. **Done** (or Escape) writes every change as one project Undo step; the top bar's Undo then restores the earlier pictures. Messages, such as the 256 × 256 limit for costumes, appear next to the control that caused them.

Costumes are shared by stable ID: changing a costume updates every sprite and tile that uses it, and renaming keeps references.

## Author an animation

The sprite's costumes sit beside the canvas in order. Tap one to paint it; drag to reorder; long-press or right-click (or **Costume options**) for Duplicate, Move earlier, Move later, Download PNG and Delete. **+ New** paints a blank costume (32, 64 or 128 units), takes one from the library, uses a picture or photo (on a tablet this can be the camera), or copies the current costume, which is the quickest start for the next frame. **Show the frame before** draws the previous costume faintly under the canvas to line up a pose; it never changes the picture. The preview plays the costumes in order; its speed (1–12 frames a second) is saved with the sprite as its frame duration. Done also makes the costume showing when you finish the sprite's current costume.

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

## The library

**Sprites**, **Backdrop library** and **World library** open the same library. It holds the built-in Bird, Star, Ball and Box, and original art drawn by code in [src/art](../src/art/catalog.ts) in one style (a soft ink outline, pastel fills, big heads):

| Category | Contents |
| --- | --- |
| Characters | Fox, Cat, Rabbit, Robot, Turtle, Bee, Fish and the explorers Sam and Ruby, each with eight poses: idle 1–2, walk 1–4, jump and happy, facing right. Adding one adds every pose; its frames are the walk cycle, and it starts in idle 1 with left-right rotation and 0.12 s frames, so **next costume** walks and a direction of 180 faces left. |
| Objects | Coin and Gem with a six-frame spin, Heart, Key, Door, Spikes, Platform, Crate, Tree, Flower and Rocket (two flame frames). |
| Tiles | Grass, Snow, Cave, Castle, Sand and Metal sets, each with top-left, top, top-right, left, middle, right, platform and block pieces of 32 units, drawn so neighbours join without seams. Adding a set puts all eight in the project for the world editor. |
| Backdrops | Meadow and Night (built in), Cave, Snow, Castle, Desert, Forest, Coral reef, City park and Space. |

Library art goes into a project as a reference such as `cast/fox-walk-1@1` rather than a picture. The app draws it from the same code wherever a picture is needed (the stage at 4× for costumes and 2× for backdrops, pixel and colour sensing at the stage size, thumbnails, the Paint editor, the exported player), so a whole cast costs a project a few hundred bytes and does not use its 24 costumes. Every entry carries an original-art licence field in the catalogue. Bird, Star, Ball, Box, Meadow and Night are drawn by the same code; their ids, sizes, shapes and main colours are those of the earlier shapes, so scripts that sense touching or colours behave as before.

## Storage and bounds

Backdrops and frame operations were introduced in language version **10**; current project exports use version **21**, also preserving pen/effects, instance behavior/sensing, game motion, worlds/cameras, game presentation, sound/music, touch controls, watchers, 2× artwork and library art references. Projects from versions 1–20 and pinned modules from versions 5–19 remain readable. Existing scenes without frame metadata use their current costume as a one-frame sequence with a 0.1-second duration; missing backdrop metadata means plain color.

- Up to 24 custom costumes, each at most 256 × 256 stage units and 350,000 PNG data-URL characters.
- Up to 12 custom backdrops, each at most 480 × 320 stage units and 900,000 PNG data-URL characters.
- Library art is stored as a reference (`stock`, since language version 21) instead of a picture; see [the library](#the-library). Up to 200 library costumes and 24 library backdrops, which do not count toward the limits below.
- Artwork may be stored at 2× (`resolution: 2`, since language version 20): its PNG is then twice its stage size each way and may use four times the characters. Sizes, positions, collisions and colour sensing always use the stage size. The Paint editor keeps 2× art at 2× and stores blocky pixel art at 1×.
- Up to 64 saved frames per sprite, including repeats; 0.02–10 seconds per frame. The runtime `animate` API separately accepts up to 100 frames.
- **Import costume** in the Sprite tab accepts PNG/JPEG/WebP files up to 2 MB; a picture added in the Paint editor may be up to 10 MB and is shrunk to fit 256 × 256 (a backdrop is cropped to fill the stage). Painted and imported artwork is embedded PNG; changing library art in the Paint editor makes the project its own copy.
- All scene data must fit within 12 MB UTF-8 and the entire project within 16 MB. Saving beyond these bounds fails without replacing the saved scene.

Project save/autosave includes saved pixels, frame order/duration, stable IDs and starting backdrop. Python source archives include the captured `scene.json` and its embedded assets. **Export playable** bundles the runtime and browser host with a local launcher; see [portable playback](portable-playback.md). Runtime changes never replace the saved starting scene.

## Implementation and evidence

[paint-editor.ts](../src/scene/paint-editor.ts) owns the Paint editor: pictures, tools, selection, text, the costume strip, preview and Done; [paint-pixels.ts](../src/scene/paint-pixels.ts) holds the canvas-free pixel operations (flood fill with a tolerance, fills that fade, pixel-art lines and shapes, the 1× check); `assets.ts` renders the original built-ins and handles deletion fallbacks. The stage and Python runtime use the same saved asset IDs. Project import decodes images before replacing current work.

- [Pixel tests](../tests/unit/paint-pixels.test.ts): fill boundaries and tolerance, fading fills and edges, pixel-art lines and shapes, the 1× check; [artwork tests](../tests/unit/artwork.test.ts): limits and deletion fallback.
- [Paint editor browser tests](../tests/e2e/paint.spec.ts): painting with Undo/Redo and one project Undo step, Pixel mode stored at 1×, every tool, frames with reordering, deleting, speed and real Python playback, switching costumes without losing work, canvas size and its message, backdrops with events, the library and pictures as new costumes, tiles from the world editor, and the iPad layout with touch.
- [Compiler/project tests](../tests/unit/scene.test.ts): generated Python, scene export, migration, stable backdrop references, unresolved deletion, Undo and module boundaries.
- [Native runtime tests](../tests/python/test_scene.py): saved animation order/duration, repeated frames, clone independence, backdrop events and startup behavior.
- [Browser tests](../tests/e2e/artwork.spec.ts): actual paint/edit/Undo, stable asset management, reload pixels, frame ordering/preview and real Pyodide playback, backdrop events/restart, malformed-image recovery, draft protection, overlay isolation, examples and narrow layout.

The creation workflow was informed by Code.org's official [Animation Tab](https://studio.code.org/docs/concepts/game-lab/animation-tab/) and [multi-frame animation](https://studio.code.org/docs/concepts/game-lab/animation-tab/multi-frame-animations/) documentation: in-app image editing and import, ordered frames, preview speed and an onion-skin view. The implementation and built-in artwork are original.

Verified on 2026-10-07: `pnpm check` passed 160 TypeScript tests, 58 native Python tests, type checking and the production build; all 87 Chromium/Pyodide browser tests passed. Desktop painting/frame/story and 390-pixel artwork screenshots were visually inspected.

This closes the bitmap/frame authoring increment. Vector paths/layers and a full timeline are not provided. [Sprite pen and graphic effects](sprite-pen-effects.md), [instance behaviors](sprite-behaviors-and-sensing.md) and [game motion](game-motion-and-collisions.md) extend this work. The [2D parity plan](2d-parity-plan.md) records the related sound/music, sensing, editor and delivery increments; [game presentation](game-state-and-presentation.md) supplies HUD and finish/replay.
