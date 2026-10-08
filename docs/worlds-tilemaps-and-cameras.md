# Worlds, tilemaps and cameras

This module adds named worlds, tilemap painting, local sprite placement, scrolling cameras, solid tiles, tile events and runtime tile changes. It extends the [game motion library](game-motion-and-collisions.md). The [2D parity plan](2d-parity-plan.md) records the related audio, game presentation, sensing and editor capabilities, with evidence in the [completion audit](2d-parity-audit.md).

## Author and play a world

Choose **Worlds example** and Run. Arrow keys move Explorer. In Meadow passage, touch the purple switch to remove a gate, continue through the scrolling level, and touch the star portal. The second world has its own artwork and local marker. Find its star to finish. R restarts the current world; Stop and Run reconstructs the whole project. All artwork and blocks are embedded and editable.

Open **Worlds & tilemaps** to create, name, duplicate, remove or choose a world. **Starting / editing world** controls both the editor view and where the next Run starts. The base stage remains available without a tilemap. Each world has its own background, backdrop, map and starting camera. Artwork is shared through the existing **Artwork & frames** tool: paint or import a costume there, then use it as a tile. Tiles stretch the entire costume into a square; transparency affects their appearance, while solidity is a separate setting.

**World library** provides four editable starting layouts: Forest trail (grassy ledges and coins), Coral reef (open water, gems and a sandy floor), City park (steps and flower beds), and Space station (metal platforms and gems). Each includes its backdrop and needed tile artwork. Adding a template creates a new world and selects it; existing worlds, sprites and scripts stay in the project. These are scenery/layout starters: the learner adds characters and programs movement, collection, scoring and transitions.

The world and newly needed artwork enter together as one project Undo action. Repeated additions get distinct world IDs and names while sharing identical stock images. Everything is saved as ordinary map data and embedded PNG artwork, so it remains editable and travels with playable exports. The existing limit of eight worlds still applies.

Paint, erase, fill connected areas, draw filled rectangles, or change wall flags without replacing artwork. Each drag or fill is one project Undo action. A cancelled drag is discarded; a project change during a drag rejects that stroke. Arrow keys move the map cursor, and Enter/Space applies the chosen tool. Map zoom enlarges cells inside a scrollable area for precise painting; arrow-key navigation keeps the cursor in view. The overview marks solid cells in orange, sprites with dots and the starting camera with a blue rectangle. **Move camera here** pans the stage for placing objects beyond the first screen. Use the camera fields for precise positions or saved follow behavior.

Resizing preserves top-left cells and crops cells outside the new dimensions. Undo restores cropped content. **Duplicate world** copies its map, camera and local sprites with new identities; kind handlers apply to matching copies, while handlers tied to an original sprite ID remain tied to it. **Remove world (keep sprites)** makes that world's authored sprites global and returns to the base stage. Existing blocks referring to the removed world remain visibly unresolved, so Undo can restore their identity.

Close the world editor to drag sprites on the stage or edit their coordinates. **Belongs to** chooses a specific world or **Global (all worlds)**. New sprites belong to the editing world and start at the visible camera center. The sprite list labels local sprites with their world. A sprite from another world remains editable in the inspector but is absent from the current stage.

## Coordinates, camera and rendering

World coordinates keep the established convention: x increases right and y increases up. Tile column/row indices start at zero at the top-left. Every map begins at world x = −240, y = 160, matching the original stage's top-left. A tile's center is:

```python
x = -240 + (column + 0.5) * tile_size
y = 160 - (row + 0.5) * tile_size
```

The viewport remains 480 × 320. Camera coordinates are its world-space center. With clamping enabled, a large map keeps the viewport inside its bounds; a map smaller than the viewport is centered on that axis. Without a map, clamping has no effect. Backdrops remain fixed to the screen. Sprites, tiles, dialogue and pen marks use world coordinates. Pen/stamp pixels are clipped to the map bounds (or the original stage if no map); switching/restarting a world clears them. The original turtle position remains global.

```python
from playground import scene, sprites

player = sprites.named("Explorer")
scene.camera_follow(player)
scene.camera_go(600, 0)       # sets a fixed center and stops following
scene.camera_clamp(True)
print(scene.camera_x, scene.camera_y)
scene.camera_follow(None)   # holds the current center
```

Follow updates with movement and on the shared scene clock. Destroying the followed sprite holds the last center. Camera follow IDs in saved settings refer to authored sprites; if a target is absent when entering a world, the world's fixed camera position is used. The camera clamps its center to ±999,000 even when a sprite travels farther.

Pointer positions, press/release payloads and click payloads are world coordinates. A stationary pointer's reported world location changes when the camera moves beneath it. Click hit testing uses the visible costume pixels at the new position. World projects permit pixel overlap/sensing beyond the original fixed stage, so offscreen actors can still interact. Projects with no world definitions retain viewport-clipped pixel sensing, with that viewport following the camera. Edge sensing, edge bounce, automatic edge responses and offstage projectile cleanup refer to the current **viewport**, not the map's perimeter; build solid boundary tiles to fence a world.

This covers the familiar scrolling workflow in [MakeCode Arcade's camera-follow reference](https://arcade.makecode.com/reference/scene/camera-follow-sprite), while preserving our existing coordinate convention.

## Tile queries and edits

The **Worlds** palette exposes the corresponding Python methods. Tile queries return ordinary dictionaries containing `column`, `row`, `costume`, `solid`, `x` and `y`; use dictionary blocks to read them.

| Python API | Behavior |
| --- | --- |
| `scene.tile_get(column, row)` | Return a fresh dictionary for one cell; invalid indices raise a useful error. |
| `scene.tile_at(x, y)` | Return its cell dictionary, or `None` outside the map or on the base stage. Left/top boundaries are included; right/bottom boundaries are excluded. |
| `scene.tile_set(column, row, costume, solid=False)` | Replace artwork and wall flag together; `None` means no artwork. Validate all arguments before changing the cell. |
| `scene.tile_wall(column, row, solid)` | Change only solidity. An invisible tile may still be solid. |
| `scene.tiles_of(costume)` | Return a list of fresh dictionaries for matching cells, including empty cells when costume is `None`. |
| `scene.tile_place(sprite, column, row)` | Teleport a sprite to the tile center. Automatic motion resumes on the next simulation step. |
| `scene.map_value(property)` | Read `columns`, `rows`, `tileSize`, `width` or `height`; pixel dimensions include tile size. Returns 0 on the base stage. |

Solid tiles use the same swept rectangle collision and response settings as solid sprites. Candidate tiles are collected along the swept movement, so fast motion cannot skip a thin wall merely because it crosses several cells in one step. Grounded jumping works on tile surfaces. Costume alpha does not make holes in solid cells. Runtime wall changes support gates and destructible scenery, matching the basic pattern documented by [Arcade's wall-setting operation](https://arcade.makecode.com/reference/tiles/set-wall-at).

In the Events editor, choose a sprite or kind and use the tile shortcuts:

- `tile:hit` reports automatic motion first hitting a solid tile. Payload includes `sprite`, `kind`, `tile` (the cell dictionary), `world`, and `normal_x`/`normal_y`. The ordinary `collision` event also fires with that tile; `other` and `other_kind` are `None`, as tiles are not sprite instances. Resting contact does not repeat. Destroy-on-impact follows the existing rule that removed receivers do not run queued collision handlers.
- `tile:overlap` reports entry into a nonempty cell's rectangle. Payload includes `sprite`, `kind`, `tile` and `world`. It runs once per sprite/cell/artwork contact, then can run again after separation or replacement. It uses enclosing sprite rectangles, excludes hidden sprites and samples the approximately 30 Hz scene clock. An extremely fast passage through a non-solid trigger can therefore be missed; use a solid tile hit when crossing must be caught. This is explicitly an entry event, unlike an arbitrary per-frame polling loop.

The tile-event use case is comparable to [Arcade's tile-overlap handler](https://arcade.makecode.com/reference/scene/on-overlap-tile). Our entry timing, payload dictionaries and Python ownership rules are specified above.

## World transitions and activity ownership

`scene.switch_world(id)` enters an available world, or the base stage for `None`. Switching to the already-active world does nothing. `scene.restart_world()` re-enters the current world and restores its map/local sprites. `scene.world_id` and `scene.world_name` report the active world.

A transition destroys old world-local sprites and runtime-created sprites/clones/projectiles, cancels their owned handlers and timed actions, restores the destination's authored local sprites and tilemap, applies its camera/background/backdrop, clears pen marks and contact tracking, and queues entry events. Authored global sprites retain their Python identity, data, appearance, motion and active handlers. Use entry handlers to reposition/reinitialize a persistent player as desired; the example demonstrates this. A full Run reconstructs globals too.

A local behavior that switches away from its own world is cancelled after the transition finishes; statements following that switch do not run. Existing references to destroyed locals remain invalid even if a later visit recreates a sprite with the same authored ID. Internal collision/overlap/update deliveries queued for an earlier world generation are skipped, so they cannot reach replacement instances or global actors in the new world. General user broadcasts and project handlers retain their normal cooperative event semantics.

`world:enter` runs at initial entry into a named world and after every switch/restart, with `{world, name, previous}`. `world:<id>` selects a particular world; both shortcuts are available in the editor. These are regular global events and can also target sprite behaviors. Entry events are queued after the destination's locals exist. `created` initializes local instances created by a later transition; the starting world's authored sprites retain the original `start` contract. World switches do not restart the whole program, re-register handlers, or emit `start` again.

Runtime tile changes reset on world re-entry. Saved starting layouts, editor Undo and exported scene metadata remain unchanged by gameplay. Backdrop switches within a world use the existing backdrop API; entering a world sets its configured backdrop and emits world entry events instead of pretending to be a standalone backdrop edit.

## Bounds, format and evidence

Language version 14 introduced optional `worlds`, `world` and `camera` scene metadata and optional sprite `world` membership. Current exports use version 19; earlier projects through version 18 and modules from versions 5–18 remain readable. Maps, profiles, scope and original tile artwork are included in captured source/project exports. Project world references in reusable functions must be parameters; modules cannot embed private references to an importing project's worlds.

A scene supports up to eight worlds, each with 1–64 columns and rows and tile sizes of 8, 16, 32 or 64 pixels. The maximum world is 4096 × 4096 pixels. The scene-wide limits of 64 authored sprites, 128 runtime sprites, 24 custom costumes, 12 custom backdrops and 12 MB of scene metadata/assets still apply. A map is one tile layer plus independently layered sprites. There is no scene stack, parallax-layer editor or general rigid-body engine in this module.

Only visible tiles are painted to the stage. The pen canvas follows map dimensions, bounded at 4096 × 4096 (64 MiB of RGBA pixels at the largest setting). Effect/sensing caches retain their existing bounds; event, active-handler, sprite-update and ink budgets still apply. Broad contacts with many decorated cells can reach the event budget and produce a normal overload error. Stop/error terminates the shared clock and worker.

[Native world tests](../tests/python/test_worlds.py) exercise coordinate boundaries, validated edits, maximum-speed wall contact, grounding/removal, camera/pointer transforms, global/local lifetimes, cancellation, fresh re-entry, stale-delivery rejection and full reset. [Model/compiler tests](../tests/unit/worlds.test.ts) cover maps, migrations, references, Undo, asset deletion and captured source. [Browser tests](../tests/e2e/worlds.spec.ts) exercise the authoring controls and real Pyodide gameplay through both worlds, plus scrolling clicks, runtime tile pixels, restart, persistence and diagnostics. Verified counts and acceptance status are recorded in the parity plan.

For a camera-independent score/lives/countdown HUD and full-game win/loss/replay, use the [game presentation library](game-state-and-presentation.md). These session-wide values survive world transitions; the result screen’s Play again restores the entire captured project rather than only the current world.
