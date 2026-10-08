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


class BehaviorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.messages = []; self.contacts = True
        host = types.ModuleType('_playground_host')
        host.scene_emit = lambda message: self.messages.append(json.loads(message))
        host.scene_sense = lambda message: self.contacts
        self.modules = patch.dict(sys.modules, {'_playground_host': host}); self.modules.start()
        for name in ('events', 'behaviors', 'physics', 'worlds', 'scene'):
            spec = importlib.util.spec_from_file_location('_playground_' + name, ROOT / (name + '.py'))
            module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
            setattr(self, name + '_module', module)
        self.clock = Clock(); self.events = self.events_module.EventSession(sleep=self.clock.sleep); self.events_module.events = self.events
        self.scene = self.scene_module.scene; data = initial(); data['sprites'][0]['data'] = {'items': [1], 'count': 0}
        self.scene.configure(data); self.player = self.scene.get('player'); self.tasks = []

    async def asyncTearDown(self):
        for task in self.tasks: task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.modules.stop()

    def start(self):
        task = asyncio.create_task(self.events.run()); self.tasks.append(task); return task

    async def tick(self):
        await until(lambda: bool(self.clock.pending)); self.clock.advance(1 / 30)
        for _ in range(8): await asyncio.sleep(0)

    async def test_startup_clones_nested_data_context_and_broadcast_isolation(self):
        first = self.player.clone(); second = first.clone(); seen = []; started = []
        async def cloned(payload):
            sprite = self.scene.current_sprite; sprite.data['items'].append(sprite.id)
            await self.events.wait(0)
            self.assertIs(self.scene.current_sprite, sprite); seen.append((sprite.id, payload['source']))
        async def startup(_): started.append(self.scene.current_sprite.id)
        self.scene.on('player', 'clone', cloned); self.scene.on('player', 'start', startup)
        self.start(); await until(lambda: len(seen) == 2 and started)
        self.assertEqual(started, ['player']); self.assertEqual(seen, [(first.id, 'player'), (second.id, 'player')])
        self.assertEqual(self.player.data['items'], [1]); self.assertEqual(first.data['items'], [1, first.id]); self.assertEqual(second.data['items'], [1, second.id])
        self.assertEqual(self.scene.instances(second), [self.player, first, second]); self.assertTrue(second.is_clone)
        with self.assertRaisesRegex(RuntimeError, 'only inside'): _ = self.scene.current_sprite

    async def test_instance_and_global_handlers_share_order_and_payload_copies(self):
        clone = self.player.clone(); seen = []
        async def owned(payload):
            seen.append((self.scene.current_sprite.id, payload['items'][:])); payload['items'].append(99)
        async def global_handler(payload): seen.append(('project', payload['items'][:]))
        self.events.on('message', global_handler); self.scene.on('player', 'message', owned); self.events.on('message', global_handler)
        self.events.emit('message', {'items': [1]}); self.start(); await until(lambda: len(seen) == 4)
        self.assertEqual(seen, [('project', [1]), ('player', [1]), (clone.id, [1]), ('project', [1])])

    async def test_update_coalesces_slow_instances_and_does_not_consume_service_slot(self):
        self.events.limits['activeTasks'] = 2; clone = self.player.clone(); seen = []
        async def update(payload):
            seen.append((self.scene.current_sprite.id, payload['dt']))
            await self.events.wait(1)
        self.scene.on('player', 'update', update); task = self.start()
        await self.tick(); self.assertEqual([s[0] for s in seen], ['player', clone.id])
        for _ in range(4): await self.tick()
        self.assertEqual(len(seen), 2); self.assertFalse(task.done()); self.assertTrue(all(0 <= dt <= .25 for _, dt in seen))
        self.clock.advance(1)
        for _ in range(8): await asyncio.sleep(0)
        await self.tick(); self.assertEqual(len(seen), 4)

    async def test_contact_enters_once_and_separates_on_pixels_hide_and_destroy(self):
        other = self.scene.get('friend'); other.go_to(-100, 0); seen = []
        async def enter(payload): seen.append(('enter', self.scene.current_sprite.id, payload['other']))
        async def leave(payload): seen.append(('leave', self.scene.current_sprite.id, payload['other']))
        self.scene.on('player', 'overlap', enter); self.scene.on('player', 'separate', leave); self.start()
        await self.tick(); await self.tick(); self.assertEqual(seen, [('enter', 'player', 'friend')])
        self.contacts = False; await self.tick(); self.assertEqual(seen[-1][0], 'leave')
        self.contacts = True; await self.tick(); other.hide(); await self.tick(); self.assertEqual(len(seen), 4)
        other.show(); await self.tick(); other.destroy(); await self.tick(); self.assertEqual(len(seen), 6)
        self.assertEqual(seen[-1], ('leave', 'player', 'friend'))

    async def test_contacts_survive_physics_catchup_and_keep_update_first(self):
        # Both endpoints miss the target. Intermediate fixed steps must still
        # deliver the enter/leave pair, after the frame's update event.
        self.scene.assets['small'] = {'id': 'small', 'width': 8, 'height': 8}
        other = self.scene.get('friend')
        for sprite in (self.player, other):
            sprite.costume('small'); sprite.set('size', 100)
        self.player.go_to(0, 0); other.go_to(17.5, 0)
        self.player.set_motion('vx', 350); seen = []
        async def update(_): seen.append('update')
        async def enter(_): seen.append('enter')
        async def leave(_): seen.append('leave')
        self.scene.on('player', 'update', update)
        self.scene.on('player', 'overlap', enter)
        self.scene.on('player', 'separate', leave)
        with patch.object(self.behaviors_module, 'time', types.SimpleNamespace(monotonic=lambda: self.clock.now)):
            self.start(); await until(lambda: bool(self.clock.pending))
            self.clock.advance(.1)
            for _ in range(12): await asyncio.sleep(0)
            self.assertAlmostEqual(self.player.x, 35)
            self.assertFalse(self.player.overlaps(other))
            self.assertEqual(seen, ['update', 'enter', 'leave'])

    async def test_contact_catchup_uses_the_existing_queue_budget(self):
        self.player.go_to(0, 0); self.scene.get('friend').go_to(17.5, 0)
        for sprite in self.scene.items.values(): sprite.set('size', 20)
        self.player.set_motion('vx', 350); seen = []
        async def contact(_): seen.append(True)
        self.scene.on('player', 'overlap', contact); self.scene.on('player', 'separate', contact)
        with patch.object(self.behaviors_module, 'time', types.SimpleNamespace(monotonic=lambda: self.clock.now)):
            task = self.start(); await until(lambda: bool(self.clock.pending))
            self.events.limits['queuedEvents'] = 2  # tick + enter leaves no room for separate
            self.clock.advance(.1)
            with self.assertRaisesRegex(self.events_module.EventOverloadError, 'queued contact events'): await task
            self.assertEqual(seen, [])

    async def test_tile_enter_survives_a_frame_with_both_endpoints_outside(self):
        from test_worlds import world
        data = initial(); data.update(worlds=[world('first')], world='first'); self.scene.configure(data)
        self.player = self.scene.get('player'); self.player.set('size', 20); self.player.go_to(0, 8)
        self.scene.tile_set(16, 9, 'star', False); self.player.set_motion('vx', 700); seen = []
        async def entered(payload): seen.append((payload['tile']['column'], payload['tile']['row']))
        self.scene.on('player', 'tile:overlap', entered)
        with patch.object(self.behaviors_module, 'time', types.SimpleNamespace(monotonic=lambda: self.clock.now)):
            self.start(); await until(lambda: bool(self.clock.pending)); self.clock.advance(.1)
            for _ in range(12): await asyncio.sleep(0)
            self.assertAlmostEqual(self.player.x, 70); self.assertEqual(seen, [(16, 9)])

    async def test_destroy_cancels_own_handler_and_waiting_siblings_without_failing_session(self):
        clone = self.player.clone(); identity = clone.id; seen = []
        async def wait(_):
            actor = self.scene.current_sprite
            try: await self.events.wait(10); seen.append(('resumed', actor.id))
            finally: seen.append(('ended', actor._state['id']))
        async def clicked(_):
            self.scene.current_sprite.destroy(); seen.append('must not run')
        async def project(_): seen.append('project alive')
        self.scene.on('player', 'message', wait); self.scene.on('player', 'click', clicked); self.events.on('probe', project)
        self.events.emit('message'); task = self.start(); await until(lambda: len(self.clock.pending) == 2)
        self.events.receive('stage:click', {'sprite': identity}); await until(lambda: ('ended', identity) in seen)
        self.events.emit('probe'); await until(lambda: 'project alive' in seen)
        self.assertNotIn('must not run', seen); self.assertNotIn(('ended', 'player'), seen); self.assertFalse(task.done())
        self.clock.advance(10); await until(lambda: ('resumed', 'player') in seen)

    async def test_error_and_stop_cancel_services_and_instance_work(self):
        ended = []
        async def update(_):
            try: await self.events.wait(10)
            finally: ended.append(True)
        async def broken(_): raise KeyError('missing data')
        self.scene.on('player', 'update', update); self.scene.on('player', 'fail', broken); task = self.start()
        await self.tick(); self.events.emit('fail')
        with self.assertRaisesRegex(KeyError, 'missing data'): await task
        self.assertEqual(ended, [True]); self.assertFalse(self.events._service_tasks); self.assertFalse(self.events._owners)
        self.events = self.events_module.reset_session(); self.scene.configure(initial()); self.scene.on('player', 'update', update); task = self.start()
        await asyncio.sleep(.08); task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        self.assertEqual(ended, [True, True]); self.assertFalse(self.events._service_tasks)

    async def test_fanout_budget_fails_before_partial_delivery_and_reserves_internal_names(self):
        self.events.limits['activeTasks'] = 1; self.player.clone(); seen = []
        async def handler(_): seen.append(True)
        self.scene.on('player', 'message', handler); self.events.emit('message')
        with self.assertRaisesRegex(self.events_module.EventOverloadError, 'active handlers'): await self.start()
        self.assertEqual(seen, [])
        with self.assertRaisesRegex(ValueError, 'reserved'): self.events.emit('_pb:tick')

    async def test_destroyed_startup_clone_is_not_initialized_and_registration_validates(self):
        clone = self.player.clone(); clone.destroy(); seen = []
        async def handler(_): seen.append(True)
        for event in ('', None, 'x' * 65):
            with self.assertRaises(ValueError): self.scene.on('player', event, handler)
        with self.assertRaises(ValueError): self.scene.on('missing', 'clone', handler)
        with self.assertRaises(TypeError): self.scene.on('player', 'clone', lambda _: None)
        self.scene.on('player', 'clone', handler); task = self.start()
        for _ in range(8): await asyncio.sleep(0)
        self.assertEqual(seen, []); self.assertFalse(task.done())
        with self.assertRaisesRegex(RuntimeError, 'before'): self.scene.on('player', 'message', handler)
