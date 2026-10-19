# Creative tools and art: inventory and plan

Status: approved 2026-10-18 with every recommendation in section 4 accepted. Phase 3a (sharp stage) is done ([record](#phase-3a-record)), and so is Phase 1, the Paint editor ([record](#phase-1-record)). Next: Phase 2, the Sound editor. The owner asked for three things:

1. Redo the **draw window** (Artwork & frames): it is hard to use, tools are hard to find, and some taps do nothing.
2. A **sound editor** that records the learner's voice and lets them tune the waveform.
3. Next, a **polish pass on sprites and examples**, which look "scratchy" today.

This plan builds on Track D (assets) of the [learner experience plan](learner-experience-plan.md#5-track-d-assets), which proposed an art direction, referenced stock assets and a sound-effect generator but was not started. Section 2 is the inventory, measured on the current build; section 3 is the plan; section 4 lists decisions for the owner.

## 1. Summary

| Ask | What exists | Main problems | Proposal |
| --- | --- | --- | --- |
| Draw window | Artwork & frames dialog: a 64 × 64 pixel editor with 9 tools, frames and backdrops | 42 controls in a dialog almost twice the screen height; tools hidden in a dropdown; refused taps report their reason off screen; hard-edged pixels only | A full-screen **Paint editor**: tool rail, colour swatches, size slider, a large canvas with pinch zoom, a costume strip, smooth brushes at 2× resolution, and no save/discard step |
| Sound editor | Sounds & music dialog: record, import, tone, song grid; trim, reverse, fade, louder, quieter, normalize | Buried 750 px down the Sprite tab; no way to change pitch or speed; no playhead, zoom or recording meter; native confirm boxes | A **Sound editor** reached from the sprite tray: big Record button with countdown and live level, zoomable waveform with handles, and voice effects (higher, lower, faster, slower, robot, echo) plus a built-in effects library |
| Sprites and examples | 4 built-in shapes, 16 code-drawn stock costumes, 6 backdrops, 4 tiles; 10 examples and 7 guided builds | The stage renders 480 × 320 pixels and is stretched up to 4× on a tablet; stock art is rasterized at 64 px; examples mostly use the Bird blob, Star, Ball and Box on empty backgrounds; no animation anywhere | **Sharp rendering** first (draw at the screen's resolution, art at 2×), then a redrawn, animated cast and examples rebuilt around it |

## 2. Inventory

### 2.1 Draw window today

Measured in Chromium at 1180 × 820 with touch (an iPad Air in landscape), opening it with the tray's **Paint** button on a new project. Source: [art-editor.ts](../src/scene/art-editor.ts), [raster.ts](../src/scene/raster.ts).

| Area | Today |
| --- | --- |
| Entry points | Tray **Paint** (new blank costume for the selected sprite), Sprite tab **Edit costume**, and **Artwork & frames** under Stage & assets. All open the same dialog. |
| Size | 27 buttons, 6 selects and 9 inputs. The dialog content is 1,356 px tall in a 794 px window, so the animation section is entirely below the fold. |
| Tools | Brush, Eraser, Fill, Line, Rectangle, Ellipse, Select rectangle, Move selection, Pick colour: all inside one **Tool** dropdown. Colour is the system colour picker only (no swatches). Brush size is a number field (opens the keyboard on a tablet). **Filled shapes** is a 20 × 20 checkbox. |
| Canvas | 64 × 64 pixels by default (costumes up to 256 × 256, backdrops 480 × 320), shown at 4× = 256 px in a 1,050 px wide dialog. Zoom is a dropdown (1×–8×); no pinch zoom or panning. Brushes stamp hard-edged pixels with no anti-aliasing. |
| Saving | Three kinds of undo (Undo/Redo stroke, Discard draft, Undo/Redo project edit) and three ways to save (Save artwork, Save as new, Duplicate artwork). Painting creates a draft that must be saved before almost anything else. |
| Transforms | Flip horizontal/vertical, Rotate 90°, Clear selection, Deselect, Resize canvas, Scale image, Download PNG, Import image. |
| Animation | Sprite dropdown, an "Ordered frames" list box, Add artwork as frame, Remove, Earlier/Later, Duplicate frame, seconds per frame, Save frame duration, Preview animation. |

Why taps "do nothing" (each reproduced with touch input):

| What the learner taps | What happens | Cause |
| --- | --- | --- |
| New artwork, Duplicate artwork, Import image, another artwork in the list, Costumes/Backdrops, a frame | Nothing visible | After any stroke the draft is "dirty"; the action is refused with "Save artwork or discard the draft…", printed at the bottom of the dialog, off screen (measured: not in the viewport) |
| Add artwork as frame, Preview animation, every frame button | Nothing (the buttons are disabled) | The animation fieldset is disabled when the project has no sprites or a backdrop is open, with no explanation; the Sprite dropdown is an empty 34 px box |
| Artwork and Ordered frames lists | Behave like dropdowns on iPadOS | They are `<select size>` list boxes; iPadOS shows those as a pop-up picker (expected from iPadOS behaviour, not yet checked on a device) |
| Colour, Filled shapes, Previous frame overlay | Easy to miss | 40 px wide and 20 × 20 targets, under the 44 px minimum |
| The canvas while an artwork loads | Strokes are ignored | Input is dropped while the editor is busy loading |

### 2.2 Sound editor today

A sound editor exists: **Sounds & music** ([sound-editor.ts](../src/scene/sound-editor.ts), format in [sound.ts](../src/scene/sound.ts)). Measured the same way, with a fake microphone.

| Area | Today |
| --- | --- |
| Finding it | The only button is at the bottom of the Sprite tab's Stage & assets section, 750 px of scrolling below the tab's top. The palette's Sounds category has no button for it; a sound block's warning offers it as a fix. |
| Make a sound | New tone (a fixed 0.4 s sine), New song (a 12-row piano roll, 4 beats a page, 7 instruments), Import audio (up to 10 MB, 60 s), Record microphone / Finish recording. |
| Recording | Works (a 2.5 s fake recording decoded to a 22,050 Hz mono WAV). No countdown, no level meter, no live waveform; the only feedback is a status line. |
| Editing | A 640 × 160 waveform; drag to select (touch works) or type start and end seconds; Trim, Reverse, Fade in, Fade out, Louder, Quieter, Normalize; Undo edit (8 steps); Preview the selection. No playhead, no zoom, no selection handles, no delete/silence, no pitch or speed change. |
| Saving | Apply sound, below the fold; Close discards. Switching sounds with unapplied changes uses the browser's `confirm()` box. |
| Runtime | Blocks can already play a sound with volume, pitch (±24 semitones) and pan; up to 24 sounds per project, 60 s each. |
| Library | None: every effect has to be recorded, imported or composed. |

### 2.3 Artwork

See the appendix for the full list. In short:

| Kind | Today | Look |
| --- | --- | --- |
| Built-in costumes | Bird, Star, Ball, Box, drawn by code every frame at 40–48 px (touch and colour sensing use the same drawing) | Placeholder shapes with a cream outline; the Bird is a teal oval with a beak and one dot for an eye |
| Stock costumes | Cat, Fox, Rabbit, Robot, Fish, Turtle, Bee, Rocket; Tree, Flower, Coin, Gem; four 32 px tiles. Drawn by code, rasterized to a 64 px PNG when added | A consistent flat style (shaded, no outline, so it does not match the built-ins), but single-frame, no facing direction, blurry once enlarged, and **used by no example** |
| Backdrops and worlds | Meadow, Night built in; Forest, Coral reef, City park, Space in the library; four world templates | Pleasant flat style; Meadow and Night are very plain; no example uses a library backdrop or world template |
| Animation | Nothing in the library has a second frame | The two examples with frames swap in unrelated shapes (Bird → Star → Ball) |
| Sound | No sound library; one example has a sound (a song); every game is silent | — |
| Limits | 24 custom costumes per project, 256 × 256 each; 12 backdrops; 12 MB scene | A full animated cast at 2× would not fit in 24 embedded costumes |

Why it looks scratchy, in order of impact:

1. **The stage is drawn at 480 × 320 pixels and stretched.** The canvas has a fixed 480 × 320 backing store with no device-pixel-ratio scaling, so on a tablet each stage pixel becomes 2–4 screen pixels: on an iPad Air in landscape (1180 px, a 2× screen) the stage is about 440 CSS px wide in Blocks view (1.8 device pixels per stage pixel), about 770 px in Stage view (3.2) and up to 1,000 px in Large stage (4.2). Sprites, tiles, pen lines and speech bubbles all come out soft and jagged. The exported player uses the same renderer.
2. **Art is stored at its displayed size.** Stock costumes become 64 px PNGs; there is no 2× source, so even a sharp stage would have little to show.
3. **The examples use placeholder shapes.** The Bird is the main sprite in 15 of the 17 examples and builds; goals and hazards are the plain Star and Ball; platforms, ground and walls are one- or two-colour rectangles; 12 of 17 have no backdrop, only a flat colour.
4. **Learner painting is hard-edged pixel art** at 64 × 64, so anything painted looks rougher than the stock art beside it.
5. **Previews were 240 × 160** (480 × 320 since Phase 3a) and are shown about 345 px wide on 2× screens. 25 of the 50 recipe posters are the same unchanged still (the recipe's effect is not in the captured frame).

### 2.4 Examples and guided builds

See the appendix for each project. In short: 10 examples (Sprites, Motion, Story, Drawing, Behaviors, Platformer, Worlds, Star game, Music, Input & colour) and 7 guided builds and lessons (Catch the star, Dodge the balls, Pen patterns, Talking story, Brick Breaker, Jump quest, Maze run). Their gallery cards show mostly empty pale backgrounds with one or two small shapes.

| Group | Count |
| --- | --- |
| Use only the four built-in shapes | 9 (Sprites, Motion, Story, Drawing, Behaviors, Music, Catch the star, Dodge the balls, Talking story) |
| Built-in shapes plus flat one- or two-colour rectangles or tiles | 6 (Platformer, Worlds, Star game, Input & colour, Jump quest, Maze run) |
| Only custom art | 1 (Brick Breaker: small bevelled pixel art) |
| No sprites | 1 (Pen patterns) |
| Have a sound asset | 1 (Music); Talking story plays two notes |

Content problems found along the way: Talking story is Builder in its build file but Starter in the gallery; the lessons' `order` and `next` disagree (Brick Breaker is first by `order` but fifth by `next`); Maze run's first step adds a World library template, but its finished game uses the Worlds example's hand-made maps; the Maze run and Worlds gallery images are the same file.

## 3. Plan

Each phase starts with UX mocks on the design canvas (as for Stage view and the Brick Breaker lesson), then the build, browser tests at tablet size with touch input, and docs.

### Phase 1: Paint editor (replaces Artwork & frames)

**Layout** (one screen at 1024 × 700, nothing below the fold):

- A full-screen editor, not a dialog over the editor. Top bar: costume name, Undo, Redo, and **Done**.
- Left rail of big tool buttons with icons: Brush, Eraser, Fill, Line, Rectangle, Ellipse, Select, Text (new), Pick colour. The active tool is highlighted.
- Under the rail: a row of 12 colour swatches from the app's palette plus a custom-colour button and the last 4 custom colours; a size slider with a live dot preview; for shapes, a two-state Fill/Outline toggle.
- Centre: the canvas, as large as fits, on a checkerboard. Pinch or Ctrl + scroll to zoom, two fingers to pan, a Fit button. A rotation-centre cross the learner can drag (sprites rotate around it).
- Right: the **costume strip** for the selected sprite: thumbnails of its frames, + New (blank, paint, library, import), drag to reorder, long-press for Duplicate, Delete, Download. Below it an animation preview with a play button and a speed slider.
- A small **More** menu for rarely used actions: Flip, Rotate, Resize canvas, Scale, Clear.

**Behaviour:**

- No save or discard step. Edits apply to the costume as you paint (each stroke is a stroke Undo inside the editor), and **Done** writes the costume back as one project Undo step. Switching costumes saves the current one first, so no tap is ever refused.
- Any message (for example "Costumes fit within 256 × 256") appears as a toast next to the control that caused it, never at the bottom of the screen.
- Backdrops open in the same editor with a 480 × 320 canvas; tiles with a 32 × 32 grid and a Pixel mode on by default.
- **Smooth brushes**: anti-aliased strokes and shapes, drawn at 2× resolution (a 64-unit costume is 128 pixels). A Pixel toggle keeps today's hard-edged pixel art for tiles and retro sprites. The saved format stays a PNG; costumes gain an optional `resolution: 2` so the stage draws them at half size (see Phase 3).
- Every target 44 px or larger; sliders and steppers instead of number fields; no `<select>` list boxes.

**Entry points:** tray **Paint** opens the selected sprite's current costume (with **+ New** one tap away) instead of a blank draft; Sprite tab **Edit costume**; Stage & assets **Backdrop** opens the backdrop.

**Acceptance:** each tool works with touch input and with a mouse; swatch, size and fill changes take effect on the next stroke; a learner can paint a two-frame animation and preview it without scrolling at 1024 × 700; Done is one project Undo step; projects saved before the change open unchanged.

#### Phase 1 record

Built 2026-10-18 from boards P0–P7. The owner's open questions were settled with the recommendations: a Text tool is included; "A picture or a photo" uses the device's picker, which offers the camera on tablets; the Smooth / Pixel switch shows at every level.

| Part | What shipped | Where |
| --- | --- | --- |
| Editor | A full-screen dialog: top bar (sprite, costume name, Undo, Redo, Show the frame before, Smooth / Pixel, Done), tool rail, colour and size panel, canvas, costume strip with + New, options and a playing preview. Replaces Artwork & frames (42 controls in a scrolling dialog) entirely. | [paint-editor.ts](../src/scene/paint-editor.ts), [paint.css](../src/scene/paint.css) |
| Painting | Pictures are canvases at 2×. Smooth tools use antialiased canvas drawing; Pixel mode paints whole 2 × 2 blocks; fills match within a tolerance and slip under soft edges; Down and Glow fills; Text; Select lifts a floating layer with Flip, Turn, Copy, Delete and Place. Pinch, two-finger pan, Ctrl/⌘ + scroll, Fit; crisp squares when zoomed in. | [paint-editor.ts](../src/scene/paint-editor.ts), [paint-pixels.ts](../src/scene/paint-pixels.ts) |
| Saving | Nothing is saved until Done (or Escape), which writes every changed picture, the frame order, the current costume and the speed as one project Undo step. A picture whose 2 × 2 blocks are all uniform is stored at 1×; others at 2× (`resolution: 2`), falling back to 1× if too detailed. Changing a built-in makes a new asset. Undo inside the editor covers strokes and frame changes across costumes. No action is refused for unsaved work. | [paint-editor.ts](../src/scene/paint-editor.ts) |
| Frames | Tap to switch, drag to reorder, long-press / right-click / options for Duplicate, Move earlier, Move later, Download and Delete; + New paints (32/64/128), takes from the library, imports a picture, or copies; preview speed 1–12 frames a second, saved as the sprite's frame duration. | [paint-editor.ts](../src/scene/paint-editor.ts), [stock-library.ts](../src/scene/stock-library.ts) |
| Entry points | Tray **Paint** (the selected sprite, or a new sprite if none), Sprite tab **Edit costume**, **Paint a backdrop** in Stage & assets, **Paint tile** in Worlds & tilemaps. | [editor.ts](../src/scene/editor.ts), [world-editor.ts](../src/scene/world-editor.ts) |

Fixed on the way: the built-in shapes were painted with a transform left on the picture's canvas, so later strokes landed in the wrong place; strokes now also work when the browser reports no coalesced pointer events.

Verification: [pixel tests](../tests/unit/paint-pixels.test.ts) and [Paint editor browser tests](../tests/e2e/paint.spec.ts) (13 tests, listed in the [artwork guide](artwork-and-backdrops.md#implementation-and-evidence)), plus the editor-workflow and stock-library specs that open it.

Differs from the mocks: the rotation centre is shown but cannot be dragged (that needs a costume format change), and **Centre the drawing** in More moves the picture to it instead; the 3 × 3 tile repeat preview, "wrap at the edges" for tiles and "Show sprites" behind a backdrop are not built; a backdrop cannot be deleted from the editor. Drafts are not kept if the page reloads mid-edit.

### Phase 2: Sound editor

**Finding it:** a **Sounds** button in the sprite tray next to Paint, a **Sounds** section in the Sprite tab listing the sounds the selected sprite's scripts play, and an "Edit sounds…" button at the top of the palette's Sounds category.

**Layout** (full screen, like the Paint editor):

- Left: the project's sounds as cards with a mini waveform and a play button; + New with Record, Library, Song, Import.
- **Record**: one large round button. Tap → 3-2-1 countdown → recording with a live level meter and a waveform drawing as you speak → tap again to stop (60 s limit shown as a ring). The new clip opens in the editor with silence at both ends already trimmed.
- **Editor**: a large waveform with a playhead while playing; tap to play from a point; drag handles to select; pinch to zoom. Buttons: Play, Play selection, Trim, Delete selection, Undo, Redo.
- **Tune** panel with big effect buttons that apply to the selection (or the whole sound) and preview immediately: Higher, Lower (a semitone step each, keeping the length), Faster, Slower, Louder, Softer, Robot, Echo, Reverse, Fade in, Fade out. Higher/Lower uses a simple overlap-add pitch shift so a voice keeps its timing; Faster/Slower resamples.
- **Library**: built-in effects generated in code (jump, coin, hit, laser, power-up, pop, whoosh, win, lose) with a Randomize button, as Track D's sfxr-style generator proposed. No third-party files, so nothing to license.
- Same save model as Paint: edits apply, Done is one project Undo step, no `confirm()` boxes.

**Format:** unchanged (22,050 Hz mono WAV and the song score); effects run in an `OfflineAudioContext` and write the result back as samples.

**Acceptance:** with a fake microphone in the browser tests, record → countdown → meter moves → stop → clip trimmed → Higher and Echo change the samples → Done → a block plays it; every control works by touch at 1024 × 700 without scrolling.

### Phase 3: Sharp stage and art polish

Phase 3a, sharp rendering (small, highest impact, do it first):

- Size the stage canvas's backing store to its displayed size × device pixel ratio (capped, for example at 4×) and scale the drawing context, keeping the 480 × 320 logical coordinates everywhere. Same for the minimap, the costume thumbnails and the exported player.
- Draw costumes with `resolution: 2` at half their pixel size; keep tiles and pixel-art costumes crisp with smoothing off.
- Render speech bubbles and the score/HUD text at full resolution.
- Regenerate gallery and recipe previews at 2× (480 × 320).

#### Phase 3a record

Done 2026-10-18.

| Part | What shipped | Where |
| --- | --- | --- |
| Stage canvas | Drawn at its displayed size × the device pixel ratio, in whole steps from 1× to 4× (rounding up once the stage would be enlarged by a quarter or more); measured only when the canvas resizes. Drawing keeps 480 × 320 coordinates through a context transform, so scripts, sensing and pointer input are unchanged. On an iPad Air: 2× in Blocks view, 3× in Stage view, 4× in Large stage. The exported player uses the same renderer. | [stage.ts](../src/stage.ts) |
| Pen layer | Up to 3 pixels per stage unit, within 8 million pixels (so a 4096 × 4096 world stays at 1×); fixed per world so marks never need redrawing. | [stage.ts](../src/stage.ts) |
| 2× artwork | Costumes and backdrops may carry `resolution: 2`: the PNG holds twice the pixels of the stage size each way (and may use four times the data). Validation checks the PNG size against it; the stage, sensing, colour sensing, thumbnails and the world editor draw it at its stage size. Language version 20 (modules stay at 19). | [model.ts](../src/scene/model.ts), [sensing.ts](../src/runtime/sensing.ts), [assets.ts](../src/scene/assets.ts) |
| Library art | Stock costumes, tiles and backdrops go into projects at 2× (a 64-unit costume is a 128 px PNG); library thumbnails render at 2×. Tiles stored at 2× are smoothed; 1× pixel-art tiles stay crisp. | [stock-art.ts](../src/scene/stock-art.ts), [stock-library.ts](../src/scene/stock-library.ts) |
| Effects, minimap | Graphic effects on the built-in shapes are computed at 2×; backdrop effects at up to 2×. The Stage view minimap draws at the screen's pixel density. | [stage.ts](../src/stage.ts), [stage-view.ts](../src/scene/stage-view.ts) |
| Previews | Recipe and gallery previews are rendered on a 2× screen and saved at 480 × 320 (renderer version 3). | [previews.spec.ts](../tests/e2e/previews.spec.ts) |

Until Phase 1 shipped, the old Artwork & frames window painted at stage size, so an edited library costume was stored at 1×. Browser tests read stage pixels through a helper that maps 480 × 320 coordinates onto whatever the canvas resolution is ([stage-pixels.ts](../tests/e2e/stage-pixels.ts)); [sharp-stage.spec.ts](../tests/e2e/sharp-stage.spec.ts) checks the scale in each view on a 2× screen, the 2× library costume, its stage-size drawing and hit testing, and pen marks in Large stage; [scene.test.ts](../tests/unit/scene.test.ts) checks the 2× validation rule.

Phase 3b, art pass:

- **Cast**: redraw the stock characters at 2× in the same flat style, facing right, each with idle (2 frames), walk (4), jump (1) and happy (1): Fox, Robot, Rabbit, Turtle, Bee, Cat, Fish, plus two new explorer kids. Redraw Bird, Star, Ball and Box in that style, keeping their ids so existing projects get the new look (see decision 3).
- **Props and tiles**: coin and gem spin cycles, heart, key, door, spikes, platform, crate; four tile themes with edge and corner pieces.
- **Backdrops**: richer Meadow and Night, plus Cave, Snow, Castle and Desert.
- Draw the cast as code (as today) or SVG sources in `assets/src/`, exported at 1× and 2× by a build script with a manifest that carries license fields. All original, so there is no attribution surface.
- **Referenced stock assets** (Track D §5.4): costumes from the library are stored as `stock:<id>@<version>` references that the editor and the player resolve, so an animated cast does not use up the 24 embedded costumes or the 12 MB scene budget; Export playable copies the files in. This needs a language version bump and a migration.

Phase 3c, examples:

- Rebuild the 10 examples and 7 guided builds around the new cast and backdrops: one clear hero, a real backdrop, sprites sized to read on a tablet, walk animations where things move. The scripts and the lesson steps stay the same where possible; lesson checks that name costumes are updated with them.
- Give every game sound effects from the new library (collect, jump, hit, win, lose) and use the library backdrops and world templates where they fit.
- Fix the content problems in 2.4: one level for Talking story, one lesson order, Maze run built from a template as its steps say.
- Gallery cards show a short looping preview (2–3 frames) or a 2× still; recipe posters capture the moment the recipe's effect shows, so no two are the same generic still.
- Acceptance: every example opens, runs and passes its existing browser test; each guided build still walks through end to end; a side-by-side before/after sheet of all 17 previews for review.

### Sequencing

| Order | Work | Why this order |
| --- | --- | --- |
| 1 | Phase 3a sharp rendering | Small, independent, and improves everything else, including the editors' previews |
| 2 | Phase 1 Paint editor (mocks, then build) | The owner's first ask; also the tool the art pass is checked in |
| 3 | Phase 2 Sound editor (mocks, then build) | Independent of Paint but shares its full-screen editor shell |
| 4 | Phase 3b art pass and referenced assets | Needs the `resolution` field from Phase 1 and the sharp stage from 3a |
| 5 | Phase 3c examples | Needs the new cast |

## 4. Decisions for the owner

Decided 2026-10-18: the owner accepted every proposal below.

1. **Smooth or pixel by default** in the Paint editor. Proposed: smooth brushes at 2× by default, with a Pixel toggle (on by default for tiles).
2. **Full-screen editors** for Paint and Sound instead of dialogs over the editor. Proposed: yes; the stage and blocks are not usable while either is open today anyway.
3. **Redraw Bird, Star, Ball and Box in place** (every existing project, lesson and example changes look) or add the new cast beside them. Proposed: redraw in place, keeping ids, sizes and outlines close to today's, because touch and colour sensing use the same drawing; collision tests confirm scripts behave the same.
4. **Referenced stock assets** with a format change and migration, so the animated cast does not count toward the 24-costume limit. Proposed: yes, as Track D planned; the alternative is raising the embedded limits.
5. **Original art only** (drawn in code or SVG here) or also CC0 packs for breadth. Proposed: original only for this pass.
6. **Scope of Phase 3a in the exported player**: render sharp there too. Proposed: yes.

## Appendix: detailed inventory

### A. Library artwork (26 items, all drawn by code; none has a second frame)

| Item | Kind, size | Drawing |
| --- | --- | --- |
| Bird | built-in costume, 48 × 40 | teal ellipse, yellow triangle beak, eye dot, cream outline |
| Star, Ball, Box | built-in costumes, 44, 40, 44 px | gold five-point star, purple circle, orange rounded square, cream outline |
| Meadow, Night | built-in backdrops, 480 × 320 | sky, sun, two hills; navy sky, moon, 32 stars, ground strip |
| Cat, Fox, Rabbit, Robot, Fish, Turtle, Bee, Rocket | stock characters, 64 px | ellipses and polygons with 2–3 tone shading and eyes with highlights; Fox reuses the Cat template; Fish side view; Turtle top-down |
| Tree, Flower, Coin, Gem | stock objects, 64 px | canopy ellipses; petals; rim and star; faceted pentagon |
| Grass, Stone, Sand, Metal | stock tiles, 32 px | coloured square with a lighter top band and details (blades, mortar, speckles, rivets) |
| Forest, Coral reef, City park, Space | stock backdrops, 480 × 320 | gradients with trees and a path; light rays, seaweed, coral; buildings, park, bench; stars, ringed planet, moon |
| Forest trail, Coral reef, City park, Space station | world templates, 24 × 10 (reef 15 × 10) tiles of 32 px | template backdrop, solid floor and ledges, coins, gems or flowers as decoration tiles; no sprites |

### B. Examples and guided builds

B = built-in costume; C = custom PNG embedded in the project.

| Project | Level | Sprites | Backdrop | Worlds | Sound | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| Sprites | Builder | Player B bird, Friend B star | none | – | – | 47 |
| Motion | Builder | Player B bird, Friend B ball | none | – | – | 40 |
| Story | Starter | Player B bird (4 "frames": bird, star, bird, ball), Friend B star | Meadow → Night | – | – | 15 |
| Drawing | Starter | Player B bird, Friend B star at 55% | none | – | – | 49 |
| Behaviors | Builder | Bird B bird, clones and effects | none | – | – | 64 |
| Platformer | Pro | Explorer B bird, Goal B star, Target B ball, Ground C 240 × 5, three ledges C 100 × 8 (one colour each) | none | – | – | 57 |
| Worlds | Pro | Explorer B bird, flag B star, marker B ball; C grass tile 8 × 8 | world colours | 2 (40 × 10 and 24 × 10 tiles of 32 px; walls from grass, Box, Ball, Star) | – | 63 |
| Star game | Pro | Explorer B bird, 3 stars, 2 hazard balls; C grass tile 8 × 8 | Meadow | 1 (40 × 10) | – | 54 |
| Music | Starter | Singer B bird at 150% | none | – | song "Little steps", 8 s | 24 |
| Input & colour | Builder | Explorer B bird, red and blue C 32 × 32 squares | none | – | – | 24 |
| Catch the star | Starter build | Bird, Star | Meadow | – | – | 21 |
| Dodge the balls | Starter build | Player B bird, Ball B ball | Night | – | – | 32 |
| Pen patterns | Starter build | none (pen only) | none | – | – | 7 |
| Talking story | Starter build (Builder in its build file) | Bird (2 "frames": bird, star), Star | Meadow → Night | – | 2 notes | 13 |
| Brick Breaker | Builder lesson | Paddle C 80 × 12, Ball C 14 × 14, Brick C 44 × 14 | none (dark colour) | – | – | 59 |
| Jump quest | Builder build | Explorer B bird, Goal B star, the Platformer's ground and ledges | none | – | – | 21 |
| Maze run | Pro build | the Worlds example's sprites and maps | none | 2 (same as Worlds) | – | 13 |

### C. Previews

Before Phase 3a: 17 gallery PNGs, all 240 × 160 (Maze run and Worlds are the same file); 50 recipe posters, 240 × 160, plus a WebM and MP4 each; 25 posters are byte-identical (the bird and star on the meadow), and 18 MP4s are close to static. The five fix recipes have no media by design.
