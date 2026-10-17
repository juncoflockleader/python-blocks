import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parents[2] / 'src/runtime'
def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

with patch.dict(sys.modules, {'_playground_watchers': load('_playground_watchers', 'watchers.py')}):
    debug = load('debugger', 'debugger.py')

class DebuggerTests(unittest.TestCase):
    def run_debug(self, code, actions=(), files=None):
        stops = []
        remaining = iter(actions)
        lines = {'program.py': list(range(1, len(code.splitlines()) + 1))}
        lines.update(files or {})
        def pause(message):
            stops.append(json.loads(message))
            return next(remaining, 2)
        debugger = debug.Debugger(lines, lambda: False, pause)
        old_clock, old_sleep, old_trace = time.monotonic, asyncio.sleep, sys.gettrace()
        debugger.install()
        try: exec(compile(code, 'program.py', 'exec'), {})
        finally: debugger.close()
        self.assertIs(time.monotonic, old_clock)
        self.assertIs(asyncio.sleep, old_sleep)
        self.assertIs(sys.gettrace(), old_trace)
        return stops

    def test_into_visits_real_lines_loop_iterations_and_locals_before_assignment(self):
        stops = self.run_debug('total = 0\nfor i in range(2):\n    total += i\nanswer = total\n')
        self.assertEqual([s['frames'][0]['line'] for s in stops], [1, 2, 3, 2, 3, 2, 4])
        values = {v['name']: v['value'] for v in stops[-1]['frames'][0]['locals']}
        self.assertEqual(values, {'total': '1', 'i': '1'})

    def test_step_over_skips_function_body_and_step_out_returns_to_caller(self):
        source = 'def double(x):\n    y = x * 2\n    return y\nanswer = double(4)\nresult = answer + 1\n'
        over = self.run_debug(source, [2, 3])
        self.assertEqual([s['frames'][0]['line'] for s in over], [1, 4, 5])
        out = self.run_debug(source, [2, 2, 4])
        self.assertEqual([s['frames'][0]['line'] for s in out], [1, 4, 2, 5])
        self.assertEqual(out[2]['frames'][1]['line'], 4)
        self.assertEqual(out[2]['frames'][0]['locals'], [{'name': 'x', 'value': '4'}])

    def test_resume_executes_rest_and_new_pause_request_interrupts_loop(self):
        stops = self.run_debug('x = 1\nx += 1\nx += 1\n', [0])
        self.assertEqual(len(stops), 1)
        calls = 0; pauses = []
        def requested():
            nonlocal calls
            calls += 1
            return calls == 4
        debugger = debug.Debugger({'program.py': [1, 2, 3]}, requested, lambda s: pauses.append(json.loads(s)) or 0)
        debugger.install()
        try: exec(compile('x = 0\nwhile x < 4:\n    x += 1\n', 'program.py', 'exec'), {})
        finally: debugger.close()
        self.assertEqual(len(pauses), 2)
        self.assertEqual(pauses[1]['frames'][0]['line'], 2)

    def test_previews_are_bounded_and_do_not_execute_user_representation(self):
        class Hostile:
            def __repr__(self): raise AssertionError('must not call repr')
            def __str__(self): raise AssertionError('must not call str')
        data = {'object': Hostile(), 'nested': [Hostile()], 'empty': '', 'huge': 'x' * 10000, '__private': 3, '_score': 7}
        values = debug.Debugger.values(data)
        self.assertEqual(values[0]['value'], '<object>')
        self.assertEqual(values[1]['value'], '[<object>]')
        self.assertEqual(values[2]['value'], "''")
        self.assertTrue(all(len(v['value']) <= 240 for v in values))
        self.assertNotIn('__private', [v['name'] for v in values])
        self.assertIn({'name': '_score', 'value': '7'}, values)
        self.assertEqual(len(debug.Debugger.values({str(i): i for i in range(100)})), 41)

    def test_paused_time_is_excluded_from_scene_clock(self):
        clock = [10]
        def suspend(_): clock[0] += 60; return 0
        debugger = debug.Debugger({}, lambda: True, suspend)
        debugger.real_clock = lambda: clock[0]
        before = debugger.clock(); debugger.pause_idle()
        self.assertEqual(debugger.clock(), before)
        clock[0] += 2
        self.assertEqual(debugger.clock(), before + 2)

class DebuggerWaitTests(unittest.IsolatedAsyncioTestCase):
    async def test_wait_rechecks_logical_time_after_other_handler_pauses(self):
        debugger = debug.Debugger({}, lambda: False, lambda _: 0)
        clock = [0]; sleeps = []
        debugger.real_clock = lambda: clock[0]
        async def sleep(seconds):
            sleeps.append(seconds)
            clock[0] += 10 if len(sleeps) == 1 else seconds
            if len(sleeps) == 1: debugger.offset += 10
        debugger.real_sleep = sleep
        self.assertEqual(await debugger.sleep(3, 'done'), 'done')
        self.assertEqual(sleeps, [3, 3])
