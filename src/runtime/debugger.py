"""Statement tracing over the captured source; no evaluation of learner values."""
import asyncio
import json
import sys
import time
from _playground_watchers import preview


class Debugger:
    def __init__(self, lines, requested, suspend):
        self.lines = {file: set(numbers) for file, numbers in lines.items()}
        self.requested = requested
        self.suspend = suspend
        self.mode = 2  # Start before the first mapped Python statement.
        self.depth = 0
        self.offset = 0
        self.real_clock = time.monotonic
        self.real_sleep = asyncio.sleep
        self.previous_trace = None

    def clock(self):
        return self.real_clock() - self.offset

    async def sleep(self, seconds, result=None):
        # A JS timeout may become due during Atomics.wait. Recheck logical time
        # so waits in other handlers retain their remaining duration on resume.
        deadline = self.clock() + seconds
        await self.real_sleep(seconds)
        while self.clock() < deadline:
            await self.real_sleep(deadline - self.clock())
        return result

    @staticmethod
    def values(namespace):
        values = []
        for name, value in namespace.items():
            if name.startswith('_pb_') or name.startswith('__'): continue
            if len(values) == 40:
                values.append(dict(name='…', value='More names omitted')); break
            text = preview(value)
            # Quote strings so an empty string and its boundaries are visible.
            if type(value) is str: text = repr(text)
            values.append(dict(name=name[:100], value=text[:240]))
        return values

    def frames(self, frame):
        frames = []
        while frame:
            if frame.f_code.co_filename in self.lines:
                frames.append(frame)
            frame = frame.f_back
        return frames

    def pause(self, frames):
        snapshot = dict(frames=[dict(file=f.f_code.co_filename, line=f.f_lineno,
            name=f.f_code.co_name, locals=self.values(f.f_locals),
            globals=self.values(f.f_globals)) for f in frames[:20]], truncated=len(frames) > 20)
        before = self.real_clock()
        self.mode = self.suspend(json.dumps(snapshot))
        self.offset += self.real_clock() - before
        self.depth = len(frames)

    def pause_idle(self):
        if self.requested(): self.pause([])

    def trace(self, frame, event, arg):
        file = frame.f_code.co_filename
        if file not in self.lines: return None
        if event != 'line' or frame.f_lineno not in self.lines[file]: return self.trace
        frames = self.frames(frame)
        if (self.requested() or self.mode == 2
            or self.mode == 3 and len(frames) <= self.depth
            or self.mode == 4 and len(frames) < self.depth):
            self.pause(frames)
        return self.trace

    def install(self):
        self.previous_trace = sys.gettrace()
        time.monotonic = self.clock
        asyncio.sleep = self.sleep
        sys.settrace(self.trace)

    def close(self):
        sys.settrace(self.previous_trace)
        time.monotonic = self.real_clock
        asyncio.sleep = self.real_sleep
