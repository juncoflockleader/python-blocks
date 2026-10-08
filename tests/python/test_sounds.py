import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
from test_scene import initial
from test_events import until

ROOT = Path(__file__).parents[2] / 'src/runtime'


class SoundTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.messages = []; host = types.ModuleType('_playground_host')
        host.scene_emit = lambda s: None; host.emit = lambda s: None
        host.audio_emit = lambda s: self.messages.append(json.loads(s))
        self.modules = patch.dict(sys.modules, {'_playground_host': host}); self.modules.start()
        for name in ('events', 'behaviors', 'physics', 'worlds', 'sounds', 'scene', 'execution'):
            spec = importlib.util.spec_from_file_location('_playground_' + name, ROOT / (name + '.py'))
            module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module); setattr(self, name + '_module', module)
        self.scene = self.scene_module.scene; data = initial(); data['sounds'] = [{'id': 'hello'}]; self.scene.configure(data)
        self.sounds = self.scene.sounds; self.events = self.events_module.events; self.tasks = []

    async def asyncTearDown(self):
        for task in self.tasks: task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True); self.modules.stop()

    async def test_wait_uses_host_completion_and_stop_resumes_waiters_without_leaks(self):
        heard = []
        async def play(): await self.sounds.play_wait('hello'); heard.append('ended')
        task = asyncio.create_task(play()); self.tasks.append(task); await until(lambda: self.messages)
        identity = self.messages[-1]['id']; self.assertFalse(task.done())
        self.sounds.set('pitch', 12); await asyncio.sleep(0); self.assertFalse(task.done())
        self.sounds.receive(identity); await task; self.assertEqual(heard, ['ended']); self.assertFalse(self.sounds.receive(identity))
        task = asyncio.create_task(play()); self.tasks.append(task); await until(lambda: self.sounds.active)
        self.sounds.stop(); await task; self.assertEqual(heard, ['ended', 'ended']); self.assertEqual(self.sounds.active, {})

    async def test_owner_settings_clone_independence_destruction_and_global_playback(self):
        actor = self.scene.get('player'); self.sounds.set('volume', 35, actor); self.sounds.set('pan', -50, actor)
        clone = actor.clone(); self.assertEqual(self.sounds.get('volume', clone), 35)
        self.sounds.change('volume', 100, clone); self.assertEqual(self.sounds.get('volume', actor), 35); self.assertEqual(self.sounds.get('volume', clone), 100)
        a = self.sounds.play('hello', actor); c = self.sounds.play('hello', clone); stage = self.sounds.play('hello')
        actor.destroy(); self.assertNotIn(a, self.sounds.active); self.assertIn(c, self.sounds.active); self.assertIn(stage, self.sounds.active)
        clone.destroy(); self.assertNotIn(c, self.sounds.active); self.assertIn(stage, self.sounds.active)
        self.sounds.stop_all(); self.assertFalse(self.sounds.active)
        with self.assertRaises(RuntimeError): self.sounds.play('hello', actor)

    async def test_note_tempo_capture_instruments_and_cancellation(self):
        self.sounds.set_tempo(60)
        task = asyncio.create_task(self.sounds.note(60, 2, 'snare')); self.tasks.append(task); await until(lambda: self.messages)
        self.assertEqual(self.messages[-1]['seconds'], 2); self.assertEqual(self.messages[-1]['instrument'], 'snare')
        self.sounds.set_tempo(120); self.assertFalse(task.done()); identity = self.messages[-1]['id']
        task.cancel(); await asyncio.gather(task, return_exceptions=True)
        self.assertEqual(self.messages[-1], dict(type='cancel', id=identity)); self.assertFalse(self.sounds.active)
        self.sounds.receive(identity)  # a late browser completion is harmless

    async def test_playback_errors_reach_waiting_calls_and_fire_and_forget_origin(self):
        task = asyncio.create_task(self.sounds.play_wait('hello')); self.tasks.append(task); await until(lambda: self.messages)
        self.sounds.receive(self.messages[-1]['id'], 'Audio suspended')
        with self.assertRaisesRegex(RuntimeError, 'Audio suspended'): await task
        identity = self.sounds.play('hello'); self.sounds.receive(identity, 'Missing audio')
        self.assertEqual(str(self.events._failure), 'Missing audio'); self.assertTrue(any('test_sounds.py' in f['file'] for f in self.events._failure.origin_frames))

    async def test_validates_atomically_and_bounds_pending_playback(self):
        for call in [lambda: self.sounds.play('missing'), lambda: self.sounds.play([]), lambda: self.sounds.set('volume', True), lambda: self.sounds.set('pitch', 25), lambda: self.sounds.set('pan', float('nan')), lambda: self.sounds.set('wrong', 0), lambda: self.sounds.set_tempo(0), lambda: self.sounds.get('pan', object())]:
            with self.assertRaises((TypeError, ValueError)): call()
        for note, beats, instrument in [(60.5, 1, 'sine'), (200, 1, 'sine'), (60, 0, 'sine'), (60, 1, 'missing')]:
            with self.assertRaises((TypeError, ValueError)): await self.sounds.note(note, beats, instrument)
        self.assertEqual(self.messages, [])
        for _ in range(32): self.sounds.play('hello')
        with self.assertRaisesRegex(RuntimeError, 'limit 32'): self.sounds.play('hello')
        self.assertEqual(len(self.messages), 32); self.sounds.stop_all(); self.assertFalse(self.sounds.active)
        self.sounds.play('hello'); self.assertEqual(len(self.sounds.active), 1)

    async def test_finish_cancels_audio_waiting_handler_and_scene_reset_discards_settings(self):
        async def play(_): await self.sounds.play_wait('hello'); raise AssertionError('must not resume')
        self.events.on('start', play); task = asyncio.create_task(self.events.run()); self.tasks.append(task)
        await until(lambda: self.sounds.active)
        with self.assertRaises(self.events_module.SessionFinished): self.events.finish()
        await task; self.assertEqual(self.messages[-1]['type'], 'cancel'); self.assertFalse(self.sounds.active)
        self.scene.configure(initial()); self.assertIsNot(self.scene.sounds, self.sounds); self.assertEqual(self.scene.sounds.tempo, 120)
