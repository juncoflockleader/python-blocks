# Game state, HUD and finish/replay

The **Game** palette adds score, lives, a countdown, fixed screen text, win/loss screens and short visual bursts. These are library features built on ordinary Python values and the existing cooperative event session. They work with the base stage and scrolling worlds. The [2D parity plan](2d-parity-plan.md) records the related sound, sensing, input, editor and delivery capabilities.

## Try a complete game

Choose **Star game example**, Run, and focus the stage. Arrow keys move the explorer through a scrolling garden. Collect three stars before the 20-second countdown expires; purple balls each cost one life. The balls disappear on contact, so a straight path is playable, while steering around them preserves lives. A fixed HUD shows the score, lives, time and instructions. Collecting the final star wins; reaching zero lives or running out of time loses. **Play again** works by mouse, touch or keyboard and rebuilds the entire run.

All art, sprites, tile walls, motion settings and rules in [the example](../src/scene/star-game-example.json) are editable. No assets are downloaded during play. The game demonstrates finite bursts at collected objects and a screen-centered celebration.

## Values and HUD

```python
from playground import game

game.set("score", 0)
game.set("lives", 3)
game.message("Arrows: collect the stars!")
game.countdown(20, "lose")
```

| API | Behavior |
| --- | --- |
| `game.set("score", value)` / `game.change("score", amount)` | Whole Python integers, from −999,999,999 to 999,999,999. Score starts at zero. |
| `game.set("lives", value)` / `game.change("lives", amount)` | Whole Python integers, 0–999; initial value is 3. Negative changes clamp at zero. Values above the maximum fail without changing state. |
| `game.get("score" / "lives" / "seconds")` | Return the native value. Seconds is `None` before the first countdown, then a nonnegative number. |
| `game.show("score" / "lives" / "countdown", enabled)` | Explicitly show/hide a counter using a Boolean. Counters initially stay hidden; their first set/change/start reveals them unless visibility was explicitly chosen. Subsequent updates preserve a hide/show choice. |
| `game.message(text)` | Set fixed HUD text; empty text clears it. Limit: 120 UTF-16 code units, matching the browser (most emoji use two). |

The HUD stays in screen coordinates while camera movement changes the world underneath. Counters and instructions are HTML text, so they remain readable and accessible without affecting stage pixel sensing. Text is displayed literally, never interpreted as HTML. Result screens expose a heading, message, final score and keyboard-focusable replay button. Counter ticks do not flood a live announcement region. State is session-wide, so switching/restarting a world preserves score, lives and countdown; a new Run resets them.

## Countdown and zero-life rules

`game.countdown(seconds, action)` accepts 0–3600 finite seconds. Its action is `"lose"` (default) or `"event"`. A countdown created during startup begins when the event session starts. A countdown started during play replaces the previous deadline. It uses monotonic elapsed time; delayed frames do not extend it. The HUD rounds remaining time up to whole seconds, while the Python reporter returns the current fractional value. Expiry is observed by a cooperative service at about 20 Hz, so a long calculation can delay delivery until it yields. The normal worker watchdog still applies.

`game.stop_countdown()` freezes the remaining value and prevents expiry. It leaves the counter visible until explicitly hidden. Starting another countdown supplies a new duration. There is one timer service per run; repeated starts do not accumulate services.

`game.lives_rule("lose" / "event")` chooses what happens on a positive-to-zero life transition. The default loses immediately. In event mode, setting zero repeatedly emits only once; restoring a positive value rearms it. Choose event mode **before** reducing lives if a custom response is wanted.

The Events editor lists both signals. They can target the project or use ordinary sprite/kind routing:

| Event mode signal | Payload | Default behavior after delivery |
| --- | --- | --- |
| `game:countdown` | `{ "score": current_score, "lives": current_lives, "seconds": 0 }` | Timer stays stopped at zero; play continues. |
| `game:lives_zero` | `{ "score": current_score, "lives": 0 }` | Lives stay at zero; play continues. |

Select **send game event** on the respective rule block to use these signals. A handler can replenish lives, start a new countdown, change worlds or call finish. There is no implicit fallback loss in event mode. Events retain the existing payload-copy, queue, fanout and task limits.

## Finish and replay

`game.finish(won, message="")` takes a Boolean and up to 240 UTF-16 code units of text. It sends a final HUD/result snapshot, freezes the countdown, ends the current activity immediately, cancels sibling activities and library services, discards queued events, and completes the worker successfully. Statements following finish do not execute. This also works directly in Program startup. There is no game-over handler running after completion: arrange any final state or effect **before** calling finish.

The last scene remains visible. **Play again** starts a fresh Python worker with the exact source, module files, scene and assets captured for that run. Runtime mutations, destroyed objects, timer state, keyboard state and previous bursts are reset. Editing blocks during play does not change this replay. **Run code** uses the current edited project. Replay does not rewrite the editor or autosave the runtime result.

**Stop** cancels the worker and visual bursts; it leaves the last HUD/scene visible for inspection without showing a win/loss screen. **Reset stage** returns to the authored layout and hides runtime presentation. Opening another project or example resets presentation too.

## Cosmetic bursts

```python
game.effect("sparkles", collected_sprite, 1)
game.effect("confetti", None, 1.5)
game.finish(True, "All stars collected!")
```

`game.effect(kind, sprite=None, seconds=1)` supports **confetti**, **sparkles** and **rings**, lasting 0.02–10 seconds. A sprite burst captures that sprite's world position at the call; it stays at that point through later movement or destruction, and follows camera panning correctly. `None` anchors the burst at the visible screen center. These finite bursts are cosmetic; they have no collision shape, sensing pixels, saved asset or sprite slot. Existing [sprite/stage graphic effects](sprite-pen-effects.md) remain available for changing actual artwork.

The renderer retains at most 16 active bursts, dropping the oldest when a new burst would exceed that count. Confetti/sparkles use 24 particles per burst. `game.clear_effects()`, world transitions, stage viewport resizes, Stop, Reset and the next Run clear them. A burst emitted before finish can complete over the frozen scene. The operating system/browser's reduced-motion preference suppresses these animations. They do not create learner event tasks; requests still count toward the existing 50,000 scene-command budget.

## Compilation, persistence and evidence

Language version **15** introduced Game blocks. Current exports use version 19; earlier projects through version 18 and pinned modules from versions 5–18 remain readable. Any active Game operation, including one in an imported helper, enables the event session before caller input blocks are validated. Generated Python imports `playground.game`; the compiler captures the starting scene and maps game statements to blocks. Game values are runtime state: project files save the blocks that initialize them, not a mid-game heap. Source exports preserve the generated calls and captured scene; **Export playable** includes the browser host and runtime; see [portable playback](portable-playback.md).

- [Native tests](../tests/python/test_game.py) cover bounded/atomic values, Unicode limits, explicit visibility, timer startup/replacement/stop, once-only expiry, zero-life transitions, terminal cancellation, startup finish, captured effect positions and reset.
- [Model/compiler tests](../tests/unit/game.test.ts) cover worker command validation, bounded effects and camera coordinates, example compilation/source mapping/export/roundtrip, version migration and automatic event execution through reusable modules.
- [Browser tests](../tests/e2e/game.spec.ts) cover the complete scrolling win and zero-life loss paths, timer loss/cancellation, replay, edited-versus-captured source, custom events, literal text, visibility/effects/Stop/reset, long result text at 390 pixels, and useful block-linked errors.

The baseline is informed by MakeCode Arcade's [score/life/countdown library](https://arcade.makecode.com/reference/info), [game-over lifecycle](https://arcade.makecode.com/reference/game/game-over) and [sprite effects](https://arcade.makecode.com/reference/sprites/sprite/start-effect), checked 2026-10-07. This implementation uses our explicit event model and a replay button. It does not claim multiplayer counters, persistent high scores, every Arcade particle preset, or a general HUD layout editor. Those are optional extensions beyond this row's practical game-presentation acceptance gate.
