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
        self._changed = None
        self._failure = None
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

    def emit(self, name, payload=None):
        check_name(name, self.limits)
        if name == "start":
            raise ValueError('The "start" event is sent once by the runtime; choose another event name.')
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
            for task in self._tasks:
                if task is not current:
                    task.cancel()
            if self._changed is not None:
                self._changed.set()

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
        if self._failure is not None:
            return
        try:
            await handler(payload)
        except asyncio.CancelledError as error:
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
            on_ready()
            while self._failure is None:
                while self._queue and self._failure is None:
                    name, encoded, origin = self._queue.popleft()
                    handlers = [handler for event, handler in self._handlers if event == name]
                    # Completed tasks need not consume a slot while their done
                    # callbacks are still queued on the browser event loop.
                    self._tasks.difference_update([task for task in self._tasks if task.done()])
                    if len(self._tasks) + len(handlers) > self.limits["activeTasks"]:
                        raise EventOverloadError(f'Too many active handlers for event {name!r} (limit {self.limits["activeTasks"]}). Add a wait between events or use fewer handlers.', origin)
                    for handler in handlers:
                        task = asyncio.create_task(self._deliver(handler, json.loads(encoded)))
                        self._tasks.add(task)
                        task.add_done_callback(self._tasks.discard)
                if self._failure is None:
                    self._changed.clear()
                    await self._changed.wait()
            raise self._failure
        finally:
            self.state = "closed"
            self._queue.clear()
            tasks = list(self._tasks)
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            self._tasks.clear()


events = EventSession()


def reset_session():
    global events
    events = EventSession()
    return events
