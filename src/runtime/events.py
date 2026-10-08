"""Bounded cooperative event sessions; ordinary calculations remain Python.

Only explicit awaits yield. Emission snapshots a JSON-compatible payload, then
dispatch creates an independent copy per receiver in registration order.
"""
import asyncio
from collections import deque
import inspect
import json
import math
from pathlib import Path
import traceback

LIMITS = json.loads(Path(__file__).with_name("event-limits.json").read_text())


class EventOverloadError(RuntimeError):
    def __init__(self, message, origin_frames=None):
        super().__init__(message)
        self.origin_frames = origin_frames or []


class EventPayloadError(ValueError):
    pass


class SessionFinished(BaseException):
    """Normal terminal control flow, including from synchronous startup code."""
    pass


def check_name(name, limits=LIMITS):
    if type(name) is not str or not name or len(name) > limits["eventNameLength"]:
        raise ValueError(f'Event names need 1–{limits["eventNameLength"]} characters.')


def snapshot_payload(payload, limits=LIMITS):
    nodes = 0
    ancestors = set()

    def visit(value, depth):
        nonlocal nodes
        nodes += 1
        if nodes > limits["payloadNodes"] or depth > limits["payloadDepth"]:
            raise EventPayloadError("The event payload has too many values or nested levels.")
        kind = type(value)
        if value is None or kind is bool:
            return
        if kind is str:
            if len(value.encode("utf-8")) > limits["payloadBytes"]:
                raise EventPayloadError("The event payload is too large.")
            return
        if kind is int:
            if abs(value) > 2**53 - 1:
                raise EventPayloadError("Event payload integers must be between -(2**53-1) and 2**53-1.")
            return
        if kind is float:
            if not math.isfinite(value):
                raise EventPayloadError("Event payload numbers must be finite.")
            if value.is_integer() and abs(value) > 2**53 - 1:
                raise EventPayloadError("Whole-number event payloads must be between -(2**53-1) and 2**53-1.")
            return
        if kind not in (list, dict):
            raise EventPayloadError("Event payloads support None, Boolean, text, numbers, lists, and dictionaries with text keys.")
        if id(value) in ancestors:
            raise EventPayloadError("Event payloads cannot contain circular references.")
        ancestors.add(id(value))
        if kind is dict:
            for key, child in value.items():
                if type(key) is not str:
                    raise EventPayloadError("Event payload dictionary keys must be text.")
                visit(key, depth + 1)
                visit(child, depth + 1)
        else:
            for child in value:
                visit(child, depth + 1)
        ancestors.remove(id(value))

    visit(payload, 0)
    encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > limits["payloadBytes"]:
        raise EventPayloadError("The event payload is too large.")
    return encoded


class EventSession:
    def __init__(self, *, sleep=asyncio.sleep, limits=None):
        self.limits = {**LIMITS, **(limits or {})}
        self._sleep = sleep
        self._handlers = []
        self._queue = deque()
        self._tasks = set()
        self._owners = {}
        self._coalesced = {}
        self._cancelled = set()
        self._services = []
        self._service_tasks = set()
        self._changed = None
        self._failure = None
        self._finished = False
        self.state = "setup"

    def on(self, name, handler):
        if self.state != "setup":
            raise RuntimeError("Register event handlers before the session starts.")
        check_name(name, self.limits)
        if not inspect.iscoroutinefunction(handler):
            raise TypeError("Event handlers must be async functions.")
        if len(self._handlers) >= self.limits["handlers"]:
            raise EventOverloadError(f'Too many handlers (limit {self.limits["handlers"]}).')
        self._handlers.append((name, handler))

    def _route(self, resolver):
        """Library-owned expansion of an event into instance deliveries, in registration order."""
        if self.state != 'setup': raise RuntimeError('Register sprite behaviors before the session starts.')
        if len(self._handlers) >= self.limits['handlers']: raise EventOverloadError('Too many handlers.')
        self._handlers.append((None, resolver))

    def _service(self, handler):
        if self.state == 'setup': self._services.append(handler)
        elif self.state == 'running': self._service_tasks.add(asyncio.create_task(self._deliver(handler, None)))
        else: raise RuntimeError('This event session has ended.')

    def _cancel_owner(self, owner, defer_current=False):
        if not self._owners: return
        current = asyncio.current_task()
        cancel_current = False
        for task, target in list(self._owners.items()):
            if target == owner and not task.done():
                self._cancelled.add(task)
                if task is current: cancel_current = True
                else: task.cancel()
        if cancel_current and not defer_current: raise asyncio.CancelledError()

    def emit(self, name, payload=None):
        check_name(name, self.limits)
        if name == "start":
            raise ValueError('The "start" event is sent once by the runtime; choose another event name.')
        if name.startswith('_pb:'): raise ValueError('Event names beginning with _pb: are reserved for the scene runtime.')
        self._enqueue(name, payload)

    def _enqueue(self, name, payload):
        if self.state not in ("setup", "running"):
            raise RuntimeError("This event session has ended.")
        if len(self._queue) >= self.limits["queuedEvents"]:
            raise EventOverloadError(f'Too many queued events (limit {self.limits["queuedEvents"]}). Add a wait or send fewer events.')
        encoded = snapshot_payload(payload, self.limits)
        # Keep locations, not live frame objects or their learner-variable state.
        origin = [{"file": f.filename, "line": f.lineno, "name": f.name}
                  for f in traceback.extract_stack() if f.filename == "program.py" or (f.filename.startswith("_pb_module_") and f.filename.endswith(".py"))][-16:]
        self._queue.append((name, encoded, origin))
        if self._changed is not None:
            self._changed.set()

    async def wait(self, seconds):
        if type(seconds) not in (int, float):
            raise TypeError("Wait needs a number of seconds.")
        if not 0 <= seconds <= self.limits["maxWaitSeconds"] or not math.isfinite(seconds):
            raise ValueError(f'Wait needs finite seconds from 0 to {self.limits["maxWaitSeconds"]}.')
        if self.state != "running":
            raise RuntimeError("Wait needs a running event session.")
        await self._sleep(seconds)

    def fail(self, error):
        if self._failure is None:
            self._failure = error
            self.state = "failed"
            # Stop siblings immediately, before another ready handler can run.
            current = asyncio.current_task()
            for task in self._tasks | self._service_tasks:
                if task is not current:
                    task.cancel()
            if self._changed is not None:
                self._changed.set()

    def finish(self):
        self._finished = True
        self.state = 'finished'
        if self._tasks or self._service_tasks:
            current = asyncio.current_task()
            for task in self._tasks | self._service_tasks:
                if task is not current: task.cancel()
        self._queue.clear()
        if self._changed is not None: self._changed.set()
        raise SessionFinished()

    def receive(self, name, payload):
        """Host delivery failures are fatal, just like Python emission failures."""
        if self.state != "running":
            return False
        try:
            self.emit(name, payload)
            return True
        except BaseException as error:
            self.fail(error)
            return False

    async def _deliver(self, handler, payload):
        if self._failure is not None or self._finished:
            return
        try:
            await handler(payload)
        except SessionFinished:
            return
        except asyncio.CancelledError as error:
            if asyncio.current_task() in self._cancelled:
                return
            if self.state == "running" and self._failure is None:
                self.fail(error)
            else:
                raise
        except BaseException as error:
            # Catch SystemExit as well: it must not escape into the host loop.
            self.fail(error)

    async def run(self, on_ready=lambda: None):
        if self.state != "setup":
            raise RuntimeError("An event session can only start once.")
        self.state = "running"
        self._changed = asyncio.Event()
        try:
            self._enqueue("start", None)
            for handler in self._services:
                task = asyncio.create_task(self._deliver(handler, None)); self._service_tasks.add(task)
            on_ready()
            while self._failure is None and not self._finished:
                while self._queue and self._failure is None and not self._finished:
                    name, encoded, origin = self._queue.popleft()
                    deliveries = []
                    for event, handler in self._handlers:
                        if event == name: deliveries.append((handler, json.loads(encoded), None, None))
                        elif event is None: deliveries.extend(handler(name, json.loads(encoded)))
                    deliveries = [d for d in deliveries if d[3] is None or d[3] not in self._coalesced or self._coalesced[d[3]].done()]
                    # Completed tasks need not consume a slot while their done
                    # callbacks are still queued on the browser event loop.
                    self._tasks.difference_update([task for task in self._tasks if task.done()])
                    if len(self._tasks) + len(deliveries) > self.limits["activeTasks"]:
                        raise EventOverloadError(f'Too many active handlers for event {name!r} (limit {self.limits["activeTasks"]}). Add a wait between events or use fewer handlers.', origin)
                    for handler, payload, owner, key in deliveries:
                        task = asyncio.create_task(self._deliver(handler, payload))
                        self._tasks.add(task)
                        self._owners[task] = owner
                        if key is not None: self._coalesced[key] = task
                        def finished(task, key=key):
                            self._tasks.discard(task); self._owners.pop(task, None); self._cancelled.discard(task)
                            if key is not None and self._coalesced.get(key) is task: self._coalesced.pop(key, None)
                        task.add_done_callback(finished)
                if self._failure is None and not self._finished:
                    self._changed.clear()
                    await self._changed.wait()
            if self._failure is not None: raise self._failure
        finally:
            self.state = "closed"
            self._queue.clear()
            tasks = list(self._tasks | self._service_tasks)
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            self._tasks.clear()
            self._service_tasks.clear(); self._owners.clear(); self._coalesced.clear(); self._cancelled.clear()


events = EventSession()


def reset_session():
    global events
    events = EventSession()
    return events
