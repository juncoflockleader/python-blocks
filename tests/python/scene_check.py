"""Run a game with a scripted player under CPython, the way the browser's worker does
(src/runtime/execution.py check_scene), on a virtual clock so waits take no real time.

As a module: `check(source, scene, steps, files=None)` returns (result, reports).
As a script: reads {"source", "scene", "steps", "files"} as JSON on stdin and prints
{"result", "reports"}; the academy content test uses it to prove every answer passes
and every starter fails.
"""
import asyncio
import heapq
import importlib.util
import itertools
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import types

ROOT = Path(__file__).parents[2] / 'src/runtime'
MODULES = {'_playground_events': 'events', '_playground_physics': 'physics', '_playground_worlds': 'worlds', '_playground_behaviors': 'behaviors',
           '_playground_game': 'game', '_playground_sounds': 'sounds', '_playground_questions': 'questions', '_playground_watchers': 'watchers',
           '_playground_scene': 'scene', '_playground_checks': 'checks', 'playground': 'playground', '_pb_execution': 'execution'}


class VirtualClock:
    """Sleeps end in time order, and time jumps ahead whenever nothing else can run."""
    def __init__(self):
        self.now, self.pending, self.order = 0.0, [], itertools.count()

    async def sleep(self, seconds):
        if seconds <= 0:
            await asyncio.sleep(0); return
        future = asyncio.get_running_loop().create_future()
        heapq.heappush(self.pending, (self.now + seconds, next(self.order), future))
        await future

    async def drive(self, task):
        while not task.done():
            for _ in range(40):
                await asyncio.sleep(0)
                if task.done(): return
            if self.pending:
                when, _, future = heapq.heappop(self.pending)
                self.now = max(self.now, when)
                if not future.done(): future.set_result(None)


def load_runtime():
    """Fresh runtime modules with a host that only collects what the game sends."""
    host = types.ModuleType('_playground_host')
    for name in ('emit', 'scene_emit', 'audio_emit', 'question_emit'): setattr(host, name, lambda message: None)
    # No pictures are drawn here, so two sprites whose boxes overlap count as touching (touching_pixels checks the boxes first).
    host.scene_sense = lambda message: json.loads(message).get('kind') == 'overlap'
    sys.modules['_playground_host'] = host
    for name in MODULES: sys.modules.pop(name, None)
    for name, file in MODULES.items():
        spec = importlib.util.spec_from_file_location(name, ROOT / (file + '.py'))
        module = importlib.util.module_from_spec(spec); sys.modules[name] = module; spec.loader.exec_module(module)
    return sys.modules['_pb_execution']


def check(source, scene, steps, files=None):
    saved = {name: sys.modules.get(name) for name in [*MODULES, '_playground_host']}
    try: return _check(source, scene, steps, files)
    finally:
        for name, module in saved.items():
            if module is None: sys.modules.pop(name, None)
            else: sys.modules[name] = module


def _check(source, scene, steps, files):
    # Glides, timers and animations read the time: they read the virtual clock too.
    clock, monotonic = VirtualClock(), time.monotonic
    time.monotonic = lambda: clock.now
    try: return _run(source, scene, steps, files, clock)
    finally: time.monotonic = monotonic


def _run(source, scene, steps, files, clock):
    execution = load_runtime()
    reports = []
    folder = tempfile.mkdtemp(); here = os.getcwd()
    Path(folder, 'scene.json').write_text(json.dumps(scene))
    os.chdir(folder)
    try:
        async def main():
            task = asyncio.create_task(execution.check_scene(source, files or {}, steps, lambda text: reports.append(json.loads(text)), sleep=clock.sleep))
            await clock.drive(task)
            return json.loads(await task)
        result = asyncio.run(main())
    finally:
        os.chdir(here)
    return result, reports


if __name__ == '__main__':
    job = json.load(sys.stdin)
    result, reports = check(job['source'], job['scene'], job['steps'], job.get('files'))
    print(json.dumps({'result': result, 'reports': reports}))
