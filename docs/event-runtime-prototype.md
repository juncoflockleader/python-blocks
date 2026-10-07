# Event runtime prototype

Date: **2026-10-07**. This records P4's scheduling decision and implemented event contract. Batch 4a established the runtime; Batch 4b added and verified handler blocks, saved delivery order, async function editing, compiler selection of event mode, and the test-event form. See [implementation progress](implementation-progress.md#batch-4b--event-language-and-editor-integration) for the full gate.

## Scheduling decision

Continue with explicit cooperative Python `async`/`await`. The prototype supports independent activities and readable ordinary Python without inserting yields into calculations or loops. Pyodide schedules Python tasks on the browser event loop and cannot use a blocking native event-loop launcher. The worker therefore executes module initialization, then separately awaits the session entry point. [Pyodide WebLoop](https://pyodide.org/en/stable/usage/api/python-api/webloop.html)

The implementation retains strong references to active tasks and cancels peers after the first handler failure. Awaiting a helper runs that coroutine within the caller's activity; registering a handler lets the dispatcher create an independent task for each delivery. [Python coroutines and tasks](https://docs.python.org/3/library/asyncio-task.html)

The implementation is in [events.py](../src/runtime/events.py), with [execution/error handling](../src/runtime/execution.py), [worker integration](../src/runtime/python.worker.ts), and [host lifecycle](../src/runtime/runner.ts).

## Implemented API and order

```python
from playground import events


async def announce(payload):
    print("ready")
    await events.wait(0.1)
    print("go")


events.on("start", announce)
```

This is a module fragment for the event worker, not a standalone launcher. [The cooperative fixture](../tests/fixtures/events/cooperative.py) demonstrates two handlers, shared project state, and an awaited value-returning helper.

Open [the saved event project](../tests/fixtures/events/handlers.json) in the editor to use the same contract through blocks. **Events** manages handler roots, payload names, and delivery order; **Functions & variables** marks waiting helpers async. Emit is a normal statement, Wait generates `await events.wait(...)`, and async helper calls display **await call**. Calls from a synchronous context are diagnosed rather than silently converting the caller. The compiler emits definitions, Program initialization, and then handler registrations in saved order. The host subsequently starts the session.

Language version 4 stores execution metadata in the procedure model. Handler payloads use stable parameter IDs, and handler locals reuse function scope. Copying preserves async/event settings while allocating independent scoped identities and appending the copied handler to delivery order. Edits, order changes, and creation support Undo; save/reload preserves the model. Earlier project versions retain synchronous function semantics.

| Operation | Implemented behavior |
| --- | --- |
| `events.on(name, handler)` | Register an async function before the session starts. The registration list defines dispatch order and is sealed at session start. |
| `events.emit(name, payload=None)` | Validate and snapshot the payload immediately, then enqueue the event without invoking receivers or yielding. Events are dispatched FIFO. |
| `await events.wait(seconds)` | Yield for a finite, nonnegative duration within the limit below. Zero also yields. Timing is scheduler timing, not a promise of precise animation frames. |
| Automatic `start` event | Enqueued once after module initialization and registration. Learner code cannot emit another `start`. |
| Startup emissions | Emissions during initialization retain their FIFO position ahead of the automatic `start`; host input follows session readiness. |
| Session readiness | Sent after successful initialization and creation of the session queue. Host delivery is disabled until readiness. |
| Idle state | The session remains active when all current handlers finish, so later input can launch new deliveries. |
| Failure | A handler error or dispatch overload cancels remaining tasks, clears queued work, and reports failure for the whole session. |
| Stop/restart | The host terminates the worker. Restart creates a fresh interpreter; old messages, input slots, and heartbeat state cannot affect it. |

Receivers for one event are enqueued in registration order. Completion order can differ when they wait. Each invocation has ordinary Python local state; project state is shared and may change across an await. Ordinary synchronous functions can still run within a handler. There is no automatic yield in `emit`, assignments, or loops.

## Payload boundary

Payloads are JSON-compatible trees containing `None`, Boolean values, text, finite numbers, lists, and dictionaries with text keys. Whole-number values must fit the exact JavaScript integer range, ±(2**53−1), including floats whose value is integral. This restriction applies at the event boundary; normal Python calculations and collections retain their existing semantics.

Emission serializes a snapshot. Each receiver gets a separate decoded tree, so neither later emitter mutation nor another receiver's mutation changes its payload. Repeated aliases within a payload also become independent tree nodes. Cycles, non-text keys, tuples, sets, functions, nonfinite values, and over-limit payloads are rejected explicitly.

The host validates before posting an event, and Python validates again on receipt. An invalid host input rejected before posting never enters the session. A delivery rejected inside Python is a session failure. Host acknowledgements bound the browser message queue independently of Python's event queue.

## Initial limits

The shared [event-limits.json](../src/runtime/event-limits.json) supplies both host and Python defaults. These are explicit prototype settings, exercised at their boundaries; they are not a completed device-performance study.

| Limit | Setting |
| --- | --- |
| Registered handlers | 64 per session |
| Active handler tasks | 32, including handlers suspended in a wait |
| Queued events | 128, including the automatic start event while queued |
| Unacknowledged host events | 32 |
| Encoded payload | 16,384 UTF-8 bytes |
| Payload nesting | At most 16 levels below the root |
| Payload nodes | 1,024, counting dictionary keys and values |
| Event name | 1–64 Unicode code points |
| One wait | 0–86,400 seconds |
| Heartbeat | Next ping one second after the previous matching pong |
| Responsiveness timeout | Five seconds after a ping without its matching pong |

An event that would exceed active-task capacity fails before any receivers for that event are scheduled. Previously scheduled activities are then cancelled. Queue overload fails explicitly, including for events with no receivers. There is no silent dropping, coalescing, or hidden backpressure wait.

Startup retains the existing 60-second limit. Once Python starts, sequential runs retain their ten-second deadline; event sessions use the watchdog instead of a total lifetime deadline. Printed output and drawing command limits still apply to the whole session. Browser suspension can delay host timers; the watchdog is a responsiveness policy, not a real-time guarantee or a security boundary.

## Errors and source identity

Handler exceptions retain Python type, message, traceback, and program frames across awaits. Dispatch overload happens after an emit returns, so queued events retain up to 16 originating program locations. These appear separately as `originFrames` and an “Event queued at” note; they are not presented as the dispatcher's live stack. The UI uses the captured compilation to map these origins to the send block. If the learner edits during a run, an error reports the earlier revision instead of highlighting changed code.

An automatic start overload or host watchdog failure may have no originating learner statement. Those failures report the session-level cause rather than inventing a block location. Hard termination does not guarantee Python cleanup code runs.

## Verification

- [Native scheduler tests](../tests/python/test_events.py) use an injected manual clock for ordering, independent progress, explicit yields, payload copies, shared state, overload, cancellation, and startup ordering.
- [Execution tests](../tests/python/test_execution.py) check asynchronous traceback locations, originating emit locations, fresh sessions, host input, and structured `SystemExit` failures.
- [Runner tests](../tests/unit/runner.test.ts) use fake timers for deadlines, matching heartbeat IDs, bounded host input, acknowledgement slots, and stale-worker rejection.
- [Browser tests](../tests/e2e/event-runtime.spec.ts) run the actual runner source through test-only routes with the production worker and real Pyodide. They check concurrent waits/helpers, an idle session beyond ten seconds, host snapshots, failure cleanup, both overload limits, automatic watchdog termination, Stop, and restart. No test-only entry point is added to the app.
- [Language tests](../tests/unit/events.test.ts) execute generated Python and verify saved order, startup initialization, payload isolation, async call contexts, scoped identities, version compatibility, copy, and Undo/Redo.
- [Editor browser tests](../tests/e2e/events.spec.ts) verify handler forms, creation and copying, async editing, saved order across immediate reload, host input, exports, mapped errors after awaits and edits, queue/task overload attribution, idle lifetime, Stop, watchdog termination, and fresh restart.

At completion of Batch 4b, P4's runtime and editor gates passed together with 89 TypeScript tests, 30 native Python tests, and 38 real Chromium/Pyodide browser tests, plus type checks and the production build. Native tests used Python 3.9.6; browser verification uses bundled Python 3.14.2. These results establish the supported cooperative contract, not general device performance or full Python compatibility. P5 subsequently added [reusable modules](reusable-modules.md), including imported async helpers and module emit origins; P6 subsequently added synchronous [function values and expression lambdas](function-values.md). See [implementation progress](implementation-progress.md) for current suite totals.
