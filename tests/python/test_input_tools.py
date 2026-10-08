import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
from test_events import until
from test_scene import initial

ROOT = Path(__file__).parents[2] / 'src/runtime'


class InputToolsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.messages = []; self.queries = []
        host = types.ModuleType('_playground_host'); host.scene_emit = lambda _: None; host.emit = lambda _: None
        host.question_emit = lambda value: self.messages.append(json.loads(value))
        host.scene_sense = lambda value: self.queries.append(json.loads(value)) or True
        self.patch = patch.dict(sys.modules, {'_playground_host': host}); self.patch.start()
        for name in ('events', 'behaviors', 'physics', 'worlds', 'questions', 'scene'):
            spec = importlib.util.spec_from_file_location('_playground_' + name, ROOT / (name + '.py'))
            module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module); setattr(self, name + '_module', module)
        self.scene = self.scene_module.scene; self.scene.configure(initial()); self.inputs = self.scene_module.inputs
        self.events = self.events_module.events; self.tasks = []

    async def asyncTearDown(self):
        for task in self.tasks: task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True); self.patch.stop()

    async def start(self):
        task = asyncio.create_task(self.events.run()); self.tasks.append(task)
        await until(lambda: self.events.state == 'running'); return task

    async def ask(self, text):
        task = asyncio.create_task(self.inputs.ask(text)); self.tasks.append(task)
        await asyncio.sleep(0); return task

    async def test_questions_capture_distinct_answers_and_cancel_keeps_last_answer(self):
        await self.start(); a = await self.ask('First?'); b = await self.ask('Second?')
        self.assertEqual(self.messages, [dict(type='ask', id=1, text='First?'), dict(type='ask', id=2, text='Second?')])
        self.assertEqual(self.inputs.answer, ''); self.assertFalse(a.done()); self.assertFalse(b.done())
        self.questions_module.receive_answer(1, 'Ada'); self.questions_module.receive_answer(2, 'Bea')
        self.assertEqual(await a, 'Ada'); self.assertEqual(await b, 'Bea'); self.assertEqual(self.inputs.answer, 'Bea')
        c = await self.ask('Cancel?'); self.questions_module.receive_answer(3, None); self.assertIsNone(await c); self.assertEqual(self.inputs.answer, 'Bea')
        self.assertFalse(self.questions_module.receive_answer(3, 'stale')); self.assertEqual(self.inputs.answer, 'Bea')

    async def test_cancel_all_and_cancelled_waits_release_their_own_requests(self):
        await self.start(); a = await self.ask('A'); b = await self.ask('B')
        a.cancel(); await asyncio.gather(a, return_exceptions=True); self.assertEqual(self.messages[-1], dict(type='cancel', id=1)); self.assertFalse(b.done())
        self.inputs.cancel_questions(); self.assertIsNone(await b); self.assertEqual(self.messages[-1], dict(type='clear')); self.assertFalse(self.inputs._questions.pending)
        count = len(self.messages); self.inputs.cancel_questions(); self.assertEqual(len(self.messages), count)

    async def test_destroy_and_finish_cancel_owned_questions_without_resuming_the_activity(self):
        continued = []
        async def ask(_): await self.inputs.ask('Owned'); continued.append(True)
        self.scene.on('player', 'start', ask); session = await self.start(); await until(lambda: self.messages)
        self.scene.get('player').destroy(); await until(lambda: self.messages[-1]['type'] == 'cancel'); self.assertFalse(continued)
        q = await self.ask('Global'); self.assertFalse(q.done())
        self.inputs.cancel_questions(); await q
        # Questions in actual session activities are cancelled during terminal shutdown.
        async def finish_ask(_): await self.inputs.ask('Finish'); continued.append(True)
        # A separate session permits normal setup registration.
        session.cancel(); await asyncio.gather(session, return_exceptions=True)
        self.events = self.events_module.EventSession(); self.events_module.events = self.events; self.events.on('start', finish_ask)
        session = await self.start(); await until(lambda: self.inputs._questions.pending)
        with self.assertRaises(self.events_module.SessionFinished): self.events.finish()
        await session; self.assertFalse(continued); self.assertFalse(self.inputs._questions.pending)

    async def test_question_validation_and_queue_budgets_are_atomic(self):
        with self.assertRaisesRegex(RuntimeError, 'running'): await self.inputs.ask('Before Run')
        await self.start()
        for text in [None, 1, 'x' * 401, '😀' * 201]:
            with self.assertRaises((TypeError, ValueError)): await self.inputs.ask(text)
        self.assertEqual(self.messages, [])
        tasks = [await self.ask(str(i)) for i in range(16)]
        with self.assertRaisesRegex(RuntimeError, 'limit 16'): await self.inputs.ask('overflow')
        with self.assertRaises(ValueError): self.questions_module.receive_answer(1, 'x' * 2049)
        self.assertEqual(len(self.inputs._questions.pending), 16); self.assertEqual(self.inputs.answer, '')
        self.inputs.cancel_questions(); self.assertEqual(await asyncio.gather(*tasks), [None] * 16)

    def test_monotonic_timer_resets_only_explicitly_or_for_a_new_run(self):
        now = [10.0]; inputs = self.scene_module.Inputs(clock=lambda: now[0]); self.scene_module.inputs = inputs
        self.assertEqual(inputs.timer, 0); now[0] += 2.5; self.assertEqual(inputs.timer, 2.5)
        inputs.reset(); self.assertEqual(inputs.timer, 2.5)
        inputs.reset_timer(); now[0] += .125; self.assertEqual(inputs.timer, .125)
        self.scene.configure(initial()); self.assertEqual(inputs.timer, 0); self.assertEqual(inputs.answer, '')

    def test_color_queries_validate_before_host_and_use_post_effect_sprite_state(self):
        actor = self.scene.get('player'); actor.set_effect('color', 120)
        self.assertTrue(actor.touching_color('#FF0000', '#00ff00', 12))
        self.assertEqual(self.queries[-1]['a']['effects'], dict(color=120)); self.assertEqual(self.queries[-1]['ownColor'], '#00ff00')
        for color, own, tolerance in [(None, None, 10), ('red', None, 10), ('#112233', 12, 10), ('#112233', None, True), ('#112233', None, float('nan')), ('#112233', None, 256)]:
            with self.assertRaises((ValueError, TypeError)): actor.touching_color(color, own, tolerance)
        self.assertEqual(len(self.queries), 1); actor.hide(); self.assertFalse(actor.touching_color('#ff0000')); self.assertEqual(len(self.queries), 1)
        actor.destroy()
        with self.assertRaises(RuntimeError): actor.touching_color('#ff0000')
