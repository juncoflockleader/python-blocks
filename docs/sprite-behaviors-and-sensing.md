# Sprite behaviors and pixel sensing

Sprites can now own handlers. Each authored sprite and its clones share the saved behavior definitions and keep separate runtime data. The learner still writes ordinary async Python functions; the scene library routes events to instances using the existing cooperative event session.

## Try it

Choose **Behavior example**, then Run. Three birds move independently. Space adds another at the pointer; clicking a clone removes it. Contact displays that bird's tick counter. Stop ends all activities, and Reset stage restores the single authored bird and its starting data.

Open **Sprite data & behavior** below the sprite inspector to create named starting values. Number, text, Boolean and None have direct forms; lists and dictionaries use JSON. Save, rename and remove are atomic Undo operations. Values are embedded in project files and `scene.json` source exports. Running changes never overwrite these saved values.

**Add sprite behavior** opens Events with the selected sprite as **Runs for**. Choose startup, clone creation, update, pixel contact beginning/ending, instance click, or an ordinary event. Project handlers retain their existing behavior. A sprite target is a stable ID: renaming updates its displayed label, deletion produces a diagnostic, and Undo restores it. Duplicating a handler preserves its target and gives the definition fresh identities. Duplicating an authored sprite does not copy its handlers; attach the intended behaviors explicitly.

Use **this sprite** inside a sprite handler to access the particular receiver. Use the data get/set/dictionary blocks to read or change its values. Pass the sprite to helper functions through a parameter; the editor restricts the this-sprite block to an owned handler's direct body. Helpers and reusable modules can operate on a supplied sprite's data using ordinary Python semantics.

## Delivery contract

```python
from playground import scene, events

async def move_bird(payload):
    bird = scene.current_sprite
    bird.move(bird.data["speed"])
    bird.bounce()
    bird.data["ticks"] += 1

scene.on("player", "update", move_bird)
```

Register handlers during setup. The host then awaits the event session. Registration order is shared with project handlers; each invocation owns an independent payload snapshot. Multiple receivers progress at explicit waits, and a context variable retains the right instance across those waits.

| Owned event | Receivers and payload |
| --- | --- |
| `start` | The authored original once; payload is None. Clones have their own creation event. |
| `clone` | The newly created clone; `{"sprite": runtime_id, "source": authored_id}`. Cloning a clone retains the same authored identity. |
| `update` | Every live instance, approximately 30 times/second; `{"dt": elapsed_seconds}`. Elapsed time is clamped to 0.25 seconds. |
| `overlap` | An instance when visible costume pixels begin touching another; `{"sprite": instance_id, "other": other_id}`. |
| `separate` | A surviving instance when that contact ends, with the same payload shape. The other ID can refer to an already-destroyed sprite. |
| `click` | The particular clicked instance, using the stage-click payload with x/y and sprite ID. |
| Other names | All live instances of that authored sprite. Includes ordinary broadcasts, key events and backdrop events. |

Each update handler has at most one invocation per instance in flight. A slow handler skips intervening updates; it does not build a backlog. Its next `dt` remains the scene clock interval, not the total time since that handler last ran. Use an explicit time accumulator when that distinction matters. Other events retain the existing concurrent-delivery rules.

Clone creation returns immediately. Initialization is queued; it does not run inline inside `clone()`. Clones created in Program before registrations are retained for delivery once the session starts. A clone destroyed before delivery is skipped. Initialization handlers follow ordinary cooperative semantics: after one waits, other events may act on that clone. Put required initial assignments before the first wait.

Contact detection runs on the scene clock and after each 1/120-second motion step when physics is active. Enter/leave transitions during a catch-up frame are retained in order and delivered after that frame's update event, within the existing event queue limit. Existing contact emits once, separation emits once, and renewed contact emits again. Contact with several sprites creates several events. Detection samples positions; sufficiently fast or thin objects can still pass between samples. It is sensing, not continuous collision response. Hiding, full ghost transparency, costume/effect changes and destruction can end contact. Stage ink, bubbles and backdrops do not participate in sprite-to-sprite contact.

## Data and lifetime

- `sprite.data` is an ordinary Python dictionary. Missing keys raise `KeyError`; lists and nested dictionaries retain normal mutation/aliasing semantics. The data get/set blocks directly index that dictionary.
- `clone()` deep-copies the current data, including nested lists/dictionaries, and copies visual/pen state. Assets and behavior definitions are shared. Put cloneable values in data; arbitrary Python objects that do not support deep copying can raise an error when cloned.
- `.is_clone` and `.template_id` report runtime identity. `sprites.all()` returns a new list of live objects; `sprites.instances(sprite)` returns the live original and clones of its template. These lists contain references, not copied sprites.
- Destroy cancels every running handler owned by that instance. A handler destroying itself stops immediately; statements after destruction do not run. Cancellation is intentional and does not fail the whole session. Other instances and project handlers continue.
- A project handler referring to a destroyed sprite is not instance-owned. Subsequent operations through its stale reference raise the usual destroyed-object error. Catching or continuing from such failures is not implicit.
- Stop/error cancels the scene clock and handlers. Run reconstructs fresh scene data and a fresh session; nothing from the prior worker is delivered.

Saved starting data accepts JSON dictionaries with finite numbers, safe whole numbers, text, Boolean, None, lists and dictionaries. The limit per sprite is 16 KB of UTF-8 JSON, 16 nested levels and 1,024 values including keys. Runtime values remain Python values and are not serialized as render messages. Existing scene/project limits also apply.

The existing limits of 64 registrations, 32 active learner handlers and 128 queued events remain in force. The scene clock is a service and does not consume a learner-handler slot. Each instance invocation does consume a slot. A broadcast or update exceeding available slots fails before partial delivery; it does not silently choose receivers. Large clone/contact populations can exceed those budgets even below the 128-sprite limit. Event names beginning `_pb:` are reserved for internal routing.

## Pixel sensing

`sprite.touching_pixels(other)` tests visible costume contact. `sprite.touching_pixel(x, y)` tests a point against a visible costume. The editor exposes both blocks; stage hit testing also chooses the foremost sprite with an opaque pixel at the pointer.

The renderer and worker share the same TypeScript pixel-sensing implementation. Built-in and embedded PNG costumes are rasterized; scale, position, rotation style, horizontal flip and the seven graphic effects are applied consistently. Nonzero alpha counts as visible. Hidden sprites, fully transparent costumes, full ghost effect and self-contact return false.

Sprite contact scans world-space pixel centers. On projects without named worlds it is clipped to the 480 × 320 camera viewport; named-world projects also sense actors outside the viewport. Point sensing samples the costume at the supplied world coordinate. It does not include CSS scaling or browser interpolation at fractional canvas edges; results are defined by the costume pixels and transforms. Outside-viewport points return false on projects without named worlds. A bounded mask cache is reset with the scene.

The older `overlaps()` and `touching_point()` operations retain their enclosing-rectangle contract. They are useful for coarse geometry and do not account for transparent holes. Edge sensing is also geometric. The [game motion module](game-motion-and-collisions.md) adds velocity/gravity, kinds and swept collision response against solid sprites. The [worlds module](worlds-tilemaps-and-cameras.md) adds tile walls, tile events and offscreen world-pixel queries. The [input guide](questions-timers-and-touch.md) adds color contact against the rendered scene.

## Format and verification

Language version 12 introduced optional sprite targets to handler metadata and optional starting-data dictionaries to sprite metadata, plus behavior/sensing blocks. Current exports use version 19, also preserving motion/kind, worlds/cameras, game presentation, sound/music, touch controls and watchers. Earlier projects through version 18 and modules from versions 5–18 remain readable. Missing data defaults to an empty dictionary; missing handler targets preserve project handlers. Existing module revisions are not rewritten.

Evidence lives in [native behavior tests](../tests/python/test_behaviors.py), [pixel-sensing unit tests](../tests/unit/sensing.test.ts), [compiler/project tests](../tests/unit/scene.test.ts), and [Chromium/Pyodide behavior tests](../tests/e2e/behaviors.spec.ts). The increment evidence and parity requirements are recorded in the [2D parity plan](2d-parity-plan.md).

Kind-based handlers, runtime `created` and physical `collision` events extend this contract in the [game motion guide](game-motion-and-collisions.md). Overlap payloads additionally snapshot `kind` and `other_kind`; clone payloads additionally include kind and a Boolean clone flag.
