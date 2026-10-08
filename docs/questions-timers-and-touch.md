# Questions, timers, touch and color sensing

This increment completes the remaining sensing/input family in [D04 of the 2D parity plan](2d-parity-plan.md). Keyboard/pointer state, bounds and visible-pixel sprite contact remain available as documented in the [sprite guide](sprites-stage-input.md) and [behavior guide](sprite-behaviors-and-sensing.md). These operations use ordinary Python values and the existing cooperative event runtime.

## Try the example

Choose **Input & color example**, then **Run code**. Answer the explorer's name question and use the arrow keys or **Touch controls** to reach the red square. A/Space resets the elapsed timer; B/X asks another question. Reaching red wins and displays the elapsed seconds. **Play again** restores the captured project and asks again. The squares are original embedded artwork; no external assets or services are needed.

The **Sensing & input** palette contains key/pointer reporters, pixel/color contact, timer, question and answer blocks. **Input help & touch buttons** in the scene inspector describes focus rules and lets learners choose the keyboard keys sent by the A/B buttons. Those settings support project Undo, save/open and captured export.

## Questions and answers

```python
from playground import inputs

async def greet(payload):
    name = await inputs.ask("What is your name?")
    if name is not None:
        print("Hello", name)
```

`await inputs.ask(text)` presents a question beside the stage and returns the submitted string, including an empty string. **Cancel question** or Escape in the answer field returns `None`. The statement **ask and wait** block discards that return value; the **answer to question (wait)** reporter can be assigned to a variable or used in an expression. Both require an event handler or explicitly async function. Other activities and the elapsed timer continue while the question waits.

Each asking activity has its own future and captured answer. Concurrent questions queue in request order in one accessible form. A newly queued request keeps the current draft intact. `inputs.answer` / **last answer** is the most recent submitted text, initially `""`; cancelling keeps the previous answer. When multiple activities ask, use the return value to retain each activity's answer.

`inputs.cancel_questions()` / **cancel all questions** dismisses the queue and resumes pending asks with `None`. Cancelling an activity removes its own request. Destroying a sprite or leaving its owning world cancels that sprite's activities and their questions. Stop, runtime errors, finish and new Run dispose the form and worker; a late answer cannot reach a replacement worker. Replay starts with no answer or pending requests.

Prompts allow 400 UTF-16 code units, answers 2,048, with at most 16 pending questions and 1,000 requests per run. Invalid values or budget exhaustion raise mapped Python errors. Labels and answers are literal text, never interpreted as HTML. An empty prompt has the accessible label “Your answer.” Opening the next question releases held stage/controller input and focuses the answer field. Closing the final question returns focus to the stage only when focus was still in the form.

## Elapsed time

`inputs.timer` / **timer seconds** is a floating-point monotonic elapsed time since scene initialization for the current Run. `inputs.reset_timer()` / **reset timer** begins a new interval. Questions, focus changes and world transitions retain the interval. New Run and captured replay reset it. The timer does not dispatch events by itself; query it from a handler or loop with explicit waits. The [Game countdown](game-state-and-presentation.md) remains a separate countdown with expiry behavior.

## On-screen controller

The directional buttons send arrow keys. A/B default to Space/X and can each map to arrows, Space, letters or digits before running. A captured run retains its mapping. **Touch controls** toggles the pad on desktops; it starts visible on devices reporting a coarse pointer. It becomes active once the event session is ready, and is disabled after Stop, finish or error.

Real pointer capture permits dragging a held finger or mouse outside a button before release. Multiple fingers can hold independent buttons. Physical keys and every virtual button are separate sources: a key stays down until its last source releases, including when both A/B map to the same key. Key repeat does not create repeated presses. Pointer cancellation, loss of capture, focus loss, hiding the page and shutdown release or reset input; hiding the pad releases its virtual buttons. Focus resets clear state without synthesizing key-release handlers, consistent with the existing keyboard contract.

Buttons also work with keyboard focus and held Space/Enter; moving focus releases the button. Assistive activation sends a single press/release. The same Python key-state queries, key/release handlers and movement controllers work for physical and virtual input. Typing an answer or editing project text does not send stage keys.

## Color contact

```python
player.touching_color("#e04646")
player.touching_color("#e04646", own_color="#3e74d5", tolerance=10)
```

**Sprite touches color** tests the sprite's visible costume mask against the rendered scene with that sprite omitted. **Sprite color touches color** additionally restricts the mask to its own matching color. Both use the sprite's position, scale, rotation style and graphic effects. Hidden or fully ghosted sprites return `False`; any remaining nonzero-alpha costume pixel can contribute. Transparent holes remain holes. The own-color filter uses the sprite's post-effect RGB before blending over the stage.

The compared scene includes the background or backdrop with stage effects, tiles, sprite and turtle pen marks/stamps, and the other visible sprites in layer order with their effects. Transparent objects blend over what is behind them. HUD, speech bubbles, game bursts, the selection outline and turtle cursor are excluded. The plain stage's visible dot grid is part of its background. Color inputs require `#RRGGBB`; tolerance is a finite number from 0 through 255, default 10, applied independently to each RGB channel. Zero requests an exact match.

Queries sample the **visible 480 × 320 stage viewport**, accounting for the camera. A sprite entirely outside it returns `False`. Pixel sprite-to-sprite queries still support offscreen world contact as specified in the behavior/world guides. Color contact is a sampled visual query; it does not provide swept collision response.

A worker-owned raster mirror processes scene and pen commands before Python can issue its next query. Drawing, erasing, moving, hiding, changing layers/effects, editing tiles and switching worlds therefore take effect immediately without waiting for a browser animation frame. The mirror keeps bounded scene/ink canvases, one cached composite and up to 16 filtered images. Existing asset, world, mark, event and execution limits apply.

## Persistence and verification

Language version 17 introduced the sensing/input blocks and optional scene control mappings. Current exports use version 19; earlier projects through version 18 and pinned modules from versions 5–18 remain readable. Missing mappings use Space/X. Timer state, typed answers, pending questions and pressed buttons are transient and are not saved. Source exports capture the original scene, artwork and button mappings; [Export playable](portable-playback.md) includes the host and runtime.

- [Input model/compiler tests](../tests/unit/input-tools.test.ts) cover aggregate input, protocol limits, migration, control-only scenes, captured export, example/source mapping, await contexts and input helpers through reusable modules. [Runner tests](../tests/unit/runner.test.ts) verify replacement/error cleanup and reject stale answers.
- [Native Python tests](../tests/python/test_input_tools.py) cover independent answers, cancellation/ownership, validation and queue budgets, monotonic timing and color-query validation.
- [Browser tests](../tests/e2e/input-tools.spec.ts) exercise actual Pyodide questions and timers, literal/Unicode input, draft preservation, destruction/finish/Stop/replay, block-linked errors, Undo/reload, combined keyboard and real multi-touch, and a complete narrow-screen example. Pixel tests cover immediate color changes, transparent holes, transformed masks, translucent occlusion, pen/stamp/turtle ink, erasure, tiles, camera and world transitions.

Chromium touch events are dispatched through its device input protocol. This checks actual browser pointer capture and multi-touch routing; it is not a physical phone or screen-reader hardware test. Desktop question and 390-pixel question/game screenshots are inspected as part of the browser verification. The [editor/play guide](editor-and-play-workflow.md) adds D12 navigation, watches and enlarged play. The [completion audit](2d-parity-audit.md) verifies the full practical 2D baseline, including independent portable playback.
