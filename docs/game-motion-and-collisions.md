# Game motion and collisions

This increment adds automatic velocity/acceleration, gravity, drag, controllers, jumping, projectiles, lifetime, kinds and collision response to the sprite library. The inspector, blocks, Python runtime and saved projects use the same settings. The [2D parity plan](2d-parity-plan.md) records the related sound, input, sensing, editor and delivery capabilities.

## Play and edit the example

Choose **Platformer example**, Run, then focus the stage. Arrow keys move horizontally, Space jumps from a surface, and F fires a ball. Shoot the target and jump across the ledges to the star. The course reports completion with a bubble and output text. Stop and Run reconstructs the course and target. This example uses dialogue and blocks. The [Star game](game-state-and-presentation.md) demonstrates the dedicated score/lives/game-over UI.

The course is an ordinary [editable project](../src/scene/game-example.json). Its green ledges are embedded original rectangular PNG costumes and solid sprites. Select one and move it, change its size, or paint a replacement. Select Explorer to adjust its gravity or controller speed. Change the jump or projectile blocks to experiment with the course.

Open **Game motion & collisions** under the sprite inspector. Presets fill the form for a platform walker, flying player, solid wall, bouncing ball or motion-off sprite; **Apply game settings** saves one Undo operation. Presets alone do not change the project. Settings persist through save/reload, duplication and source export. Runtime movement remains separate from the starting layout.

A saved moving/solid body or finite lifetime, or an active motion block/helper, starts an event session automatically. A scene can run its saved motion without an empty handler. Older projects with no motion retain their prior sequential/event behavior. Program still runs once before event dispatch.

## Settings and Python API

Coordinates remain centered, with x right and y up. Velocity is pixels per second, acceleration is pixels per second squared, and negative y acceleration is gravity. Visual heading remains independent of velocity. These units follow the familiar velocity model used by [MakeCode Arcade](https://arcade.makecode.com/reference/sprites/sprite/vx); our y-axis convention remains the one already used by Python Blocks.

| Setting | Meaning and range |
| --- | --- |
| `body` | `off`: no automatic translation. `moving`: simulated motion. `wall`: an immovable rectangular obstacle for moving bodies. |
| `vx`, `vy` | Horizontal/vertical velocity, −2,000 to 2,000 pixels/second. |
| `ax`, `ay` | Acceleration, −10,000 to 10,000 pixels/second². Integrated velocity is capped to the supported velocity range. |
| `dragX`, `dragY` | Nonnegative deceleration toward zero, 0–10,000 pixels/second². Applied after acceleration; never reverses motion by itself. |
| `response` | At a solid wall: `slide` removes inward normal velocity; `stop` zeros both components; `bounce` reflects inward normal velocity; `destroy` removes the actor. |
| `edges` | `none` passes through stage edges; `stop` removes outward velocity while permitting travel along the edge; `bounce` reflects it; `destroy` removes the actor. |
| `controller` | `none`, `arrows`, or `wasd`. |
| `speedX`, `speedY` | Controller speed, 0–2,000 pixels/second. Zero leaves that axis to velocity/acceleration. Positive speed makes that axis follow the held keys, including stopping on release. |
| `lifetime` | Remaining simulation seconds, 0–3,600. Setting 0 disables expiry; a positive countdown destroys the sprite when it expires. |
| `autoDestroy` | Destroy a moving sprite once its entire enclosing rectangle has left the stage. |
| `kind` | A case-sensitive label of 1–32 characters, with no surrounding spaces/control characters. Default `sprite`. Kinds group behavior; they do not make a sprite solid. |

```python
from playground import sprites, scene

player = sprites.named("Explorer")
player.set_motion("ay", -600)
player.control("arrows", 140, 0)
player.set_motion("edges", "stop")
player.set_kind("player")
```

`set_motion(property, value)` and `change_motion(property, amount)` change settings with validation. Setting velocity, acceleration or a controller on an off body enables moving mode. Solid walls remain walls until explicitly changed. `motion_value(property)` reads a setting; `motion_value("grounded")` queries bottom contact with a wall or stopped/bouncing stage floor. `jump(speed)` sets upward velocity only when grounded and returns whether it jumped; the jump block uses it as a statement. The example binds it to Space, whose key event fires once per press.

Controllers apply their requested velocity before acceleration and drag each simulation step. Opposing keys cancel on their axis. Keyboard focus, modifier shortcuts, key-repeat suppression and focus-loss reset use the existing input contract. Disable the controller (`control("none", ...)`) to return velocity control to blocks. `stop_motion()` disables automatic translation, zeros velocity/acceleration and clears the controller; a configured lifetime still expires.

Explicit move/go-to/set-position blocks teleport even a moving body, with automatic simulation resuming at the next step. They are not swept moves. Starting a glide on a moving body produces a useful error: stop automatic movement before gliding. Turning, changing costumes or resizing changes the next collision rectangle. Pen trails follow simulated motion segments; appearance/animation still use their existing APIs.

## Projectiles and kinds

`source.projectile(costume, vx, vy, lifetime=3)` returns a new sprite at the source position and layer. The block palette includes both a statement form and a value form. The new sprite has kind `projectile`, size 100%, no inherited controller/gravity/data, moving mode, destroy-on-wall response, and automatic offstage cleanup. Its costume, velocity and lifetime are explicit parameters. A zero lifetime disables the countdown, while offstage/wall cleanup still applies. Configure size or other behavior in its created handler.

This covers the common [projectile factory](https://arcade.makecode.com/reference/sprites/create-projectile-from-sprite), [controller movement](https://arcade.makecode.com/reference/controller/move-sprite), and [wall/edge/cleanup flags](https://arcade.makecode.com/reference/sprites/sprite/set-flag) patterns in Arcade. Python Blocks exposes these as library methods and settings rather than changing Python's language semantics.

`sprites.of_kind(kind)` returns a new list of references to live matching sprites. Existing property blocks report `.kind`, and a kind block changes it. Unlike an authored sprite ID, a kind is a label: changing it changes which kind handlers receive future events. A running invocation retains its instance until it returns or that instance is destroyed.

In Events, choose **Sprites of a kind** under **Runs for**, then enter the kind. `scene.on_kind(kind, event, handler)` uses the same current-sprite context, payload copies, ordering and cancellation as authored-sprite behaviors. A handler targets either an authored sprite or a kind, never both.

- `created`: runtime creation, including projectiles and clones. Payload contains `sprite`, `source` (template/runtime ID), `kind` and Boolean `clone`. Authored originals use `start`. The existing `clone` event continues to target clones specifically.
- `collision`: automatic motion first hits a solid surface. Payload contains `sprite`, `other` (wall ID or None), `kind`, `other_kind`, `normal_x`, `normal_y`, and `edge` (left/right/top/bottom or None). Normals point away from the obstacle. Persistent resting contact does not emit repeatedly; separate and return to trigger a fresh hit.
- `overlap`: the existing visible-pixel event now also includes snapshots of `kind` and `other_kind`. It remains distinct from physical collision. Existing update/click/broadcast/key events work for kind handlers too.

Initialization is queued and runs cooperatively. Put required projectile setup before the first wait. Destruction from a lifetime, wall/edge response, offstage cleanup or a block cancels owned activities. Events queued for already-destroyed receivers are skipped, including collision handlers when the collision response immediately destroys their receiver. Use slide/bounce/stop and destroy explicitly in the handler when a hit needs additional logic before removal. Event task/queue budgets still apply to receiver fanout.

## Collision and timing contract

The shared scene clock advances motion before delivering update/contact events. Motion uses a fixed 1/120-second simulation step and publishes changed sprite state on the approximately 30 Hz scene clock. Accumulation makes different ordinary clock partitions produce the same integration steps. Each scene-clock interval contributes at most 0.1 seconds, preventing a suspended tab from attempting a huge catch-up. Lifetime follows simulation time. The existing update payload's `dt` describes its scene-clock interval and can differ from accepted simulation time after a long pause.

Moving actors sweep their enclosing axis-aligned rectangles against solid-sprite rectangles. The sweep finds the first surface along the entire segment, including a one-pixel wall at maximum supported velocity. Remaining travel slides or reflects as configured. A corner can constrain both axes. At most eight impacts and eight initial-penetration corrections are processed per substep; remaining unsafe travel is discarded rather than passing through an obstacle. Impossible packed arrangements therefore stop safely.

Solidity does not depend on costume alpha, visibility or ghost effects. Walls do not move from velocity settings, exchange momentum, or act as moving-platform conveyors. Other moving/off bodies are not physical walls; use their pixel-overlap handlers for pickups, targets, enemies and similar interactions. Sprite and tile overlaps are sampled after every motion step, retaining transitions within a catch-up frame. Pixel contact can still miss a crossing between those samples even though solid-wall sweeps cannot tunnel. Continuous dynamic-body collision, general rigid-body forces and conveyor behavior are outside this arcade wall model.

Stage edges use the same body extents. An oversized actor is centered and stopped on an axis it cannot fit. Hidden actors still simulate. Position limits and the existing render/ink limits remain enforced. Setting malformed motion values fails before changing the affected settings. Stop/error terminates the clock with the worker, and rerun rebuilds authored profiles, kinds and positions.

The [worlds module](worlds-tilemaps-and-cameras.md) extends these sweeps to tile walls and adds scrolling cameras and scene transitions. Stage-edge operations now refer to the camera viewport; boundary tiles fence larger worlds. The [game presentation module](game-state-and-presentation.md) adds a fixed HUD, score/lives/countdown and dedicated game-over/replay controls.

## Format and evidence

Language version 13 introduced optional sprite `motion` and `kind` fields and optional handler `kind` metadata. Current exports use version 19 with sound/music, touch controls and watchers; earlier projects through version 18 and modules from versions 5–18 remain readable. Missing motion means off/default settings; missing kind means `sprite`. Source exports capture these settings with the scene and embedded art. Reusable motion helpers accept sprites as parameters and cause callers to use an event session.

[Native physics tests](../tests/python/test_physics.py) cover deterministic stepping, gravity/grounding, jump rules, both directions at a thin wall, diagonal response, corner/edge behavior, penetration, oversized actors, controller/focus reset, kinds/projectiles/lifetime, clone independence, intentional cancellation, service startup and limits. [Compiler/model tests](../tests/unit/scene.test.ts) cover format validation, source maps, handlerless games, helper dependencies, kind metadata and the example. [Browser tests](../tests/e2e/physics.spec.ts) cover real Pyodide behavior, inspector presets/Undo/reload/export, malformed recovery, kind editing, useful errors, narrow layout and a complete playthrough of the platformer. Verification counts are recorded in the parity plan.
