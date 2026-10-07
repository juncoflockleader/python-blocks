import importlib.util
from pathlib import Path
import json
import sys
from unittest.mock import patch
import unittest

spec = importlib.util.spec_from_file_location('execution', Path(__file__).parents[2] / 'src/runtime/execution.py')
execution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(execution)


class ExecutionTests(unittest.TestCase):
    def test_generated_imports_use_separate_namespaces_and_fresh_cached_modules(self):
        source = 'import _pb_module_0 as tools\nassert tools.calculate(3) == 6\nassert "calculate" not in globals()\n'
        files = {'_pb_module_0.py': 'import _pb_module_1 as helper\ndef calculate(value):\n    return helper.scale(value)\n', '_pb_module_1.py': 'def scale(value):\n    return value * 2\n'}
        self.assertEqual(json.loads(execution.run_program(source, files))['type'], 'done')
        self.assertNotIn('_pb_module_0', sys.modules)
        self.assertNotIn('_pb_module_1', sys.modules)
        files['_pb_module_1.py'] = 'def scale(value):\n    return value * 3\n'
        self.assertEqual(json.loads(execution.run_program(source.replace('== 6', '== 9'), files))['type'], 'done')

    def test_module_failures_retain_file_source_and_caller_and_cleanup(self):
        result = json.loads(execution.run_program('import _pb_module_0 as tools\ntools.broken()\n', {'_pb_module_0.py': 'def broken():\n    return 1 / 0\n'}))
        self.assertEqual(result['exceptionType'], 'ZeroDivisionError')
        self.assertEqual(result['frames'][-1], {'file': '_pb_module_0.py', 'line': 2, 'name': 'broken'})
        self.assertEqual(result['frames'][-2]['file'], 'program.py')
        self.assertIn('return 1 / 0', result['details'])
        self.assertNotIn('_pb_module_0', sys.modules)

    def test_invalid_module_files_are_structured_failures_before_execution(self):
        for files in ({'../bad.py': ''}, {'program.py': ''}, {'_pb_module_0.py': 42}, []):
            self.assertEqual(json.loads(execution.run_program('raise RuntimeError("must not run")', files))['exceptionType'], 'ValueError')

    def test_returns_structured_error_with_program_location(self):
        result = json.loads(execution.run_program('x = 1\ny = x / 0\n'))
        self.assertEqual(result['type'], 'error')
        self.assertEqual(result['exceptionType'], 'ZeroDivisionError')
        self.assertEqual(result['frames'][-1]['file'], 'program.py')
        self.assertEqual(result['frames'][-1]['line'], 2)

    def test_syntax_error_location(self):
        result = json.loads(execution.run_program('if True\n    pass'))
        self.assertEqual(result['exceptionType'], 'SyntaxError')
        self.assertEqual(result['frames'][-1]['line'], 1)

    def test_each_execution_has_fresh_globals(self):
        self.assertEqual(json.loads(execution.run_program('value = 42'))['type'], 'done')
        self.assertEqual(json.loads(execution.run_program('value'))['exceptionType'], 'NameError')

    def test_system_exit_does_not_escape_the_host(self):
        self.assertEqual(json.loads(execution.run_program('raise SystemExit(1)'))['exceptionType'], 'SystemExit')


class EventExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        spec = importlib.util.spec_from_file_location('_playground_events', Path(__file__).parents[2] / 'src/runtime/events.py')
        self.events = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.events)
        self.modules = patch.dict(sys.modules, {'_playground_events': self.events})
        self.modules.start()

    async def asyncTearDown(self):
        self.modules.stop()

    async def test_handler_exception_has_its_program_frame_after_await(self):
        source = 'from _playground_events import events\nasync def broken(payload):\n    await events.wait(0)\n    return 1 / 0\nevents.on("start", broken)\n'
        result = json.loads(await execution.run_event_program(source))
        self.assertEqual(result['exceptionType'], 'ZeroDivisionError')
        self.assertEqual(result['frames'][-1], {'file': 'program.py', 'line': 4, 'name': 'broken'})

    async def test_awaited_module_helpers_keep_module_frames_and_fresh_session(self):
        files = {'_pb_module_0.py': 'from _playground_events import events\nasync def broken():\n    await events.wait(0)\n    return 1 / 0\n'}
        source = 'from _playground_events import events\nimport _pb_module_0 as helper\nasync def start(payload):\n    await helper.broken()\nevents.on("start", start)\n'
        for _ in range(2):
            result = json.loads(await execution.run_event_program(source, files=files))
            self.assertEqual(result['exceptionType'], 'ZeroDivisionError')
            self.assertEqual(result['frames'][-1], {'file': '_pb_module_0.py', 'line': 4, 'name': 'broken'})
            self.assertNotIn('_pb_module_0', sys.modules)

    async def test_delayed_dispatch_failure_retains_module_emit_origin(self):
        files = {'_pb_module_0.py': 'from _playground_events import events\ndef flood():\n    for index in range(33):\n        events.emit("tick", index)\n'}
        source = 'from _playground_events import events\nimport _pb_module_0 as helper\nasync def receiver(payload):\n    await events.wait(100)\nasync def start(payload):\n    helper.flood()\nevents.on("start", start)\nevents.on("tick", receiver)\n'
        result = json.loads(await execution.run_event_program(source, files=files))
        self.assertEqual(result['exceptionType'], 'EventOverloadError')
        self.assertEqual(result['originFrames'][-1], {'file': '_pb_module_0.py', 'line': 4, 'name': 'flood'})

    async def test_system_exit_remains_a_structured_failure_at_async_boundary(self):
        result = json.loads(await execution.run_event_program('from _playground_events import events\nasync def broken(payload):\n    raise SystemExit(3)\nevents.on("start", broken)'))
        self.assertEqual(result['exceptionType'], 'SystemExit')
        self.assertEqual(result['frames'][-1]['file'], 'program.py')

    async def test_host_input_is_delivered_after_ready_and_invalid_input_ends_session(self):
        def ready():
            self.assertTrue(execution.receive_host_event('{"name":"message","payload":42}'))

        source = 'from _playground_events import events\nasync def handler(payload):\n    raise ValueError(str(payload))\nevents.on("message", handler)'
        result = json.loads(await execution.run_event_program(source, ready))
        self.assertEqual(result['exceptionType'], 'ValueError')
        self.assertEqual(result['message'], '42')
        result = json.loads(await execution.run_event_program('', lambda: execution.receive_host_event('{bad json')))
        self.assertEqual(result['exceptionType'], 'JSONDecodeError')

    async def test_event_executions_reset_state_and_registrations(self):
        source = 'from _playground_events import events\nvalue = 1\nasync def broken(payload):\n    raise ValueError(value)\nevents.on("start", broken)'
        self.assertEqual(json.loads(await execution.run_event_program(source))['message'], '1')
        self.assertEqual(json.loads(await execution.run_event_program('value'))['exceptionType'], 'NameError')
        self.assertEqual(self.events.events._handlers, [])

    async def test_dispatch_overload_retains_the_emitting_program_location(self):
        source = 'from _playground_events import events\nasync def receiver(payload):\n    await events.wait(100)\nasync def flood(payload):\n    for index in range(33):\n        events.emit("tick", index)\nevents.on("start", flood)\nevents.on("tick", receiver)'
        result = json.loads(await execution.run_event_program(source))
        self.assertEqual(result['exceptionType'], 'EventOverloadError')
        self.assertEqual(result['originFrames'][-1], {'file': 'program.py', 'line': 6, 'name': 'flood'})
        self.assertIn('Event queued at:', result['details'])
