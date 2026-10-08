import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
from test_events import Clock, until
from test_scene import initial

ROOT = Path(__file__).parents[2] / 'src/runtime'


class GameTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.messages = []; host = types.ModuleType('_playground_host')
        host.scene_emit = lambda s: self.messages.append(json.loads(s)); host.emit = lambda s: None
        self.modules = patch.dict(sys.modules, {'_playground_host': host}); self.modules.start()
        for name in ('events', 'behaviors', 'physics', 'worlds', 'game', 'scene', 'execution'):
            spec = importlib.util.spec_from_file_location('_playground_' + name, ROOT / (name + '.py'))
            module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module); setattr(self, name + '_module', module)
        self.clock = Clock(); self.events = self.events_module.EventSession(sleep=self.clock.sleep); self.events_module.events = self.events
        self.scene = self.scene_module.scene; self.scene.configure(initial())
        self.game = self.game_module.Game(self.scene, lambda: self.clock.now); self.scene._game = self.game
        self.tasks = []

    async def asyncTearDown(self):
        for task in self.tasks: task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True); self.modules.stop()

    async def start(self):
        task = asyncio.create_task(self.events.run()); self.tasks.append(task)
        await until(lambda: self.events.state == 'running' or task.done())
        await asyncio.sleep(0)
        return task

    def test_values_visibility_validation_and_atomic_failure(self):
        g = self.game; g.set('score', -10); g.change('score', 12); g.set('lives', 5); g.show('score', False); g.message('Find the exit!')
        self.assertEqual((g.get('score'), g.get('lives'), g.get('seconds')), (2, 5, None))
        state = self.messages[-1]['state']; self.assertEqual(state['visible'], dict(score=False, lives=True, countdown=False)); self.assertEqual(state['text'], 'Find the exit!')
        before = len(self.messages)
        for field, value in [('score', True), ('score', 1.5), ('score', 1_000_000_000), ('lives', -1), ('lives', 1000), ('missing', 3)]:
            with self.assertRaises((ValueError, TypeError)): g.set(field, value)
        for call in [lambda: g.show('score', 1), lambda: g.message('a' * 121), lambda: g.message('😀' * 61), lambda: g.finish(True, '😀' * 121), lambda: g.countdown(float('nan')), lambda: g.countdown(3601), lambda: g.finish(1), lambda: g.finish(True, 'a' * 241), lambda: g.effect('missing'), lambda: g.effect('rings', seconds=11)]:
            with self.assertRaises((ValueError, TypeError)): call()
        self.assertEqual(len(self.messages), before); self.assertEqual((g.score, g.lives), (2, 5))
        g.change('score', 1); self.assertFalse(g.visible['score'])
        g.show('countdown', False); g.countdown(20); self.assertFalse(g.visible['countdown'])
        self.assertIs(self.scene.game, g); self.scene.configure(initial()); self.assertIsNot(self.scene.game, g)

    async def test_countdown_begins_on_session_start_replaces_stops_and_expires_once(self):
        g = self.game; seen = []
        async def expired(payload): seen.append(payload)
        self.events.on('game:countdown', expired)
        g.countdown(3.2, 'event'); self.clock.advance(20); self.assertEqual(g.seconds, 3.2)
        await self.start(); self.clock.advance(1.1); await until(lambda: self.messages[-1].get('state', {}).get('seconds') == 3)
        self.assertAlmostEqual(g.seconds, 2.1); g.stop_countdown(); self.clock.advance(40); await asyncio.sleep(0); self.assertAlmostEqual(g.seconds, 2.1)
        g.countdown(.5, 'event'); self.clock.advance(.6); await until(lambda: seen)
        self.assertEqual(seen, [dict(score=0, lives=3, seconds=0)]); self.clock.advance(5); await asyncio.sleep(0); self.assertEqual(len(seen), 1)
        g.countdown(1, 'event'); self.clock.advance(2); await until(lambda: len(seen) == 2); self.assertEqual(len(self.events._service_tasks), 1)

    async def test_lives_custom_rule_is_transition_based_and_can_rearm(self):
        g = self.game; seen = []
        async def zero(payload): seen.append(payload)
        self.events.on('game:lives_zero', zero); g.lives_rule('event'); await self.start()
        g.change('lives', -10); g.set('lives', 0); await until(lambda: seen)
        self.assertEqual(seen, [dict(score=0, lives=0)]); g.set('lives', 2); g.change('lives', -2); await until(lambda: len(seen) == 2)
        self.assertIsNone(g.result); self.assertEqual(self.events.state, 'running')

    async def test_finish_stops_current_siblings_services_and_queued_delivery_without_error(self):
        g = self.game; seen = []
        async def slow(_): seen.append('started'); await self.events.wait(10); seen.append('late')
        async def finish(_):
            self.events.emit('queued', None); g.finish(True, 'All stars collected!'); seen.append('after finish')
        async def queued(_): seen.append('queued')
        self.events.on('start', slow); self.events.on('win', finish); self.events.on('queued', queued)
        g.countdown(20); task = await self.start(); await until(lambda: seen)
        self.events.emit('win'); await task
        self.assertEqual(seen, ['started']); self.assertEqual(self.events.state, 'closed'); self.assertIsNone(self.events._failure)
        self.assertEqual(g.result, dict(won=True, message='All stars collected!')); self.assertEqual(self.events._service_tasks, set()); self.assertFalse(self.events.receive('win', None))
        with self.assertRaises(RuntimeError): g.change('score', 1)

    async def test_default_lives_and_countdown_end_as_losses(self):
        async def lose(_): self.game.set('lives', 0)
        self.events.on('start', lose); task = await self.start(); await task
        self.assertFalse(self.game.result['won']); self.assertEqual(self.game.lives, 0)
        self.events = self.events_module.EventSession(sleep=self.clock.sleep); self.events_module.events = self.events
        self.game = self.game_module.Game(self.scene, lambda: self.clock.now); self.game.countdown(1)
        task = await self.start(); self.clock.advance(1.1); await task
        self.assertFalse(self.game.result['won']); self.assertEqual(self.game.seconds, 0); self.assertIsNone(self.events._failure)

    async def test_startup_finish_returns_done_and_does_not_run_following_statements(self):
        source = "from _playground_game import Game\nfrom _playground_scene import scene\nGame(scene).finish(True, 'Startup win')\nraise ValueError('must not run')"
        result = json.loads(await self.execution_module.run_event_program(source))
        self.assertEqual(result, dict(type='done')); self.assertTrue(self.messages[-1]['state']['result']['won'])
        self.events_module.reset_session()
        self.assertEqual(json.loads(self.execution_module.run_program(source)), dict(type='done'))

    def test_effects_capture_world_position_validate_lifetime_and_clear(self):
        sprite = self.scene.get('player'); sprite.go_to(650, -55)
        self.game.effect('sparkles', sprite, .5); effect = self.messages[-1]
        sprite.go_to(700, 10); self.assertEqual(effect['at'], dict(x=650, y=-55))
        self.game.effect('confetti', None, 1); self.assertIsNone(self.messages[-1]['at'])
        self.game.clear_effects(); self.assertEqual(self.messages[-1]['type'], 'game_effect_clear')
        sprite.destroy()
        with self.assertRaises(RuntimeError): self.game.effect('rings', sprite)
        with self.assertRaises(TypeError): self.game.effect('rings', object())
