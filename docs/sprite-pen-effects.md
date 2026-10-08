# Sprite pen, stamps and graphic effects

Sprites can draw with independent pens, stamp their current appearance onto the stage, and change seven graphic effects. The stage background supports the same effects. These are scene-library operations expressed as readable Python; existing functions, loops, handlers and explicit waits remain the language model.

## Try it

Choose **Drawing example** and **Run code**. Two actors draw independently: Player makes a rosette with colored stamps while Friend draws a circle. Focus the stage and press Space to erase their marks. Stop leaves the current picture visible; Reset stage or another Run restores the saved starting scene.

Open **Pen & graphic effects** under the sprite inspector to choose initial pen settings and effects. The target menu switches between the selected sprite and stage background. Apply is one project Undo step. These starting settings survive project save/reload and Python source export. Moving a sprite in the editor does not draw a trail.

The **Sprite pen** palette contains pen up/down, color, width/opacity set/change/reporters, stamp and erase all. **Looks** contains sprite/stage effect set/change/report/clear blocks. Pen operations are synchronous. A glide uses the existing explicitly awaited movement block and draws a continuous series of line segments while it runs.

## Pen behavior

```python
from playground import scene, sprites

bird = sprites.named("Player")
bird.set_pen("color", "#e47d4b")
bird.set_pen("width", 6)
bird.set_pen("opacity", 80)
bird.pen_down()
bird.move(80)
bird.turn(90)
bird.move(40)
bird.pen_up()
bird.stamp()
```

| Operation | Contract |
| --- | --- |
| `pen_down()` / `pen_up()` | Lowering an up pen draws a round dot at the current position; movement then leaves trails. Raising it stops drawing without moving the sprite. |
| `set_pen("color", hex)` | Set a `#RRGGBB` color without changing width or opacity. |
| `set_pen("width", pixels)` | Width is 1–1200 stage pixels, independent of costume size. Lines have round caps. |
| `set_pen("opacity", percent)` | Opacity is 0–100. Overlapping translucent marks accumulate normally. |
| `change_pen(property, amount)` | Add to width or opacity. An out-of-range result raises an error. |
| `pen_value(property)` | Read `down`, `color`, `width` or `opacity`. |
| `stamp()` | Copy the costume, position, size, rotation style/direction and graphic effects onto the shared drawing layer. Hidden sprites can stamp. Dialogue and selection outlines are excluded. |
| `scene.clear_pen()` | Erase all sprite trails/stamps and original turtle-pen marks. Preserve sprite positions, costumes, effects, pen settings and the turtle's position. |

Move, go-to, x/y set/change, glide and bounce corrections all draw when the pen is down. Hiding a sprite does not lift its pen. A clone copies current pen/effect settings independently; later changes to the clone do not affect its source. Destroying a sprite keeps its existing drawing but invalidates further operations on that sprite.

Stamps are pixels, not interactive sprites. They retain their appearance after the source sprite changes costume, transforms, clears its effects or is destroyed. Marks are composed in command order onto one layer above the background and below all live sprites. Changing the backdrop keeps the drawing. Stage effects affect the background, leaving sprite marks and live sprites alone.

## Graphic effects

Both sprites and `scene` provide `set_effect(name, value)`, `change_effect(name, amount)`, `get_effect(name)` and `clear_effects()`. The default value is zero. Inputs must be finite numbers; color wraps and other effects clamp to their supported range.

| Effect | Values and visual behavior |
| --- | --- |
| `color` | Hue rotation in degrees, wrapped to 0–360. Grays stay gray. |
| `brightness` | −100 to 100, subtracting/adding RGB brightness; −100 is black and 100 is white. Alpha is preserved. |
| `ghost` | 0–100 percent transparency, with 100 fully transparent. |
| `whirl` | −360 to 360 degrees, twisting the image around its center with a smooth falloff. |
| `fisheye` | −100 to 1000, changing the radial magnification inside a centered elliptical lens. Zero is unchanged. |
| `pixelate` | 0–128 costume pixels per cell, rounded to a whole pixel; 0 and 1 leave pixels unchanged. |
| `mosaic` | 0–15 extra copies per axis, rounded down: 0 gives one image, 1 gives a 2 × 2 pattern, and so on. |

Effects combine in this order: mosaic, radial whirl/fisheye, pixel sampling, hue, brightness and transparency. Geometry remains within the costume rectangle. Costume effects are evaluated at the original bitmap size before sprite scaling/rotation. Stage effects use a 480 × 320 background bitmap; stage ghost reveals a neutral white surface. Clearing effects restores original asset pixels. Effects never edit the saved artwork itself.

The original `overlaps()` and `touching_point()` queries use enclosing geometry. The [pixel-sensing operations](sprite-behaviors-and-sensing.md#pixel-sensing) account for transformed costume pixels, including effects; [color sensing](questions-timers-and-touch.md) also sees ink and the rendered scene.

## Persistence, rendering and limits

Language version **11** introduced these operations and optional starting pen/effect metadata. Current exports use version 19; earlier projects through version 18 and pinned modules from versions 5–18 remain readable. Missing pen metadata means up, teal, width 3, opacity 100; missing effects means zero effects. The scene schema remains version 1 with optional fields. Imported metadata is validated before replacing current work.

Project save/autosave records the starting settings and blocks. It does not save the run's drawn pixels or mutated Python state. The generated source recreates the picture; its source ZIP captures `scene.json` with initial settings and artwork. **Export playable** includes the playground library, runtime and browser host; see [portable playback](portable-playback.md).

A run permits 10,000 sprite pen marks (line segments, dots and stamps), within the existing 50,000 scene-command limit. Erasing the picture does not reset the run's resource budget. The original turtle retains its separate 10,000-command limit. Coordinates and all existing scene/event limits still apply.

The host draws marks once onto a canvas sized to the active world map (480 × 320 on the base stage), rather than replaying the full history on every frame. Marks stay at their world coordinates as the camera pans. It processes at most 128 marks or roughly 6 ms of work per paint, then schedules another frame. A stamp waiting for image decoding preserves command order. Clear/reset also discard pending marks, preventing delayed images from restoring erased drawing. A 16-entry cache bounds filtered artwork; reset invalidates it after asset edits. One particularly expensive mark can exceed the per-paint time target, so the 6 ms value is a scheduling target, not a hard deadline.

## Evidence and baseline

The feature baseline uses Scratch's official [pen extension](https://raw.githubusercontent.com/scratchfoundation/scratch-vm/develop/src/extensions/scratch3_pen/index.js), [looks operations](https://raw.githubusercontent.com/scratchfoundation/scratch-vm/develop/src/blocks/scratch3_looks.js), and [renderer stamp behavior](https://raw.githubusercontent.com/scratchfoundation/scratch-render/develop/src/RenderWebGL.js). These establish independent pen state, movement trails, erasure/stamps and graphic effects, including stamping a hidden sprite. Our implementation and formulas are original. Numeric units are documented above rather than claiming exact Scratch rendering compatibility.

- [Pixel/model tests](../tests/unit/effects.test.ts): identity and alpha, hue/brightness/ghost, mosaic/pixelation, radial effects, bounds and host-message validation.
- [Compiler/project tests](../tests/unit/scene.test.ts): all new block families execute in native Python; version-10 migration, captured settings and source export remain intact.
- [Python runtime tests](../tests/python/test_scene.py): movement/glide traces, cancellation, hidden drawing/stamps, snapshot lifetime, clone independence, clear behavior, normalization, invalid values and budgets.
- [Browser tests](../tests/e2e/pen-effects.spec.ts): independent pens, real glides, stamp pixels with imported artwork/rotation/scale/effects/destruction, seven effects and clear, stage isolation, turtle erasure, Undo/reload/export/import recovery, narrow controls and the Drawing example.

Verified on 2026-10-07: `pnpm check` passed 165 TypeScript tests, 63 native Python tests, type checking and the production build. The complete Chromium/Pyodide suite passed 93 tests. Desktop drawing and 390-pixel appearance screenshots were visually inspected; documentation links, JSON examples and `git diff --check` pass.

The [behavior/sensing guide](sprite-behaviors-and-sensing.md) and [game motion guide](game-motion-and-collisions.md) record subsequent sprite behavior, pixel sensing, physics and controller support. The [worlds module](worlds-tilemaps-and-cameras.md) adds scrolling levels and anchors ink to the map. The [2D parity plan](2d-parity-plan.md) records the related audio/music, game presentation, sensing and editor capabilities.
