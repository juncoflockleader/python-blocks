import asyncio
import copy
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


def world(identity):
    return dict(id=identity, name=identity.title(), background='#ddffaa', map=dict(columns=64, rows=20, tileSize=16, tiles=[None] * 1280, walls=[False] * 1280), camera=dict(x=0, y=0, follow=None, clamp=True))


class WorldTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.messages = []; host = types.ModuleType('_playground_host'); host.scene_emit = lambda s: self.messages.append(json.loads(s)); host.scene_sense = lambda s: True
        self.modules = patch.dict(sys.modules, {'_playground_host': host}); self.modules.start()
        for name in ('events', 'behaviors', 'physics', 'worlds', 'scene'):
            spec = importlib.util.spec_from_file_location('_playground_' + name, ROOT / (name + '.py')); module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module); setattr(self, name + '_module', module)
        self.scene = self.scene_module.scene; self.events = self.events_module.events; self.tasks = []
        self.initial = initial(); self.initial.update(worlds=[world('first'), world('second')], world='first')
        self.initial['sprites'][0].update(x=0, y=40, kind='player')
        self.initial['sprites'][1].update(world='first', data={'items': [1]})
        other = copy.deepcopy(self.initial['sprites'][1]); other.update(id='other', name='Other', world='second'); self.initial['sprites'].append(other)
        self.scene.configure(self.initial); self.player = self.scene.get('player'); self.scene.enable_motion(); self.physics = self.scene._physics

    async def asyncTearDown(self):
        for task in self.tasks: task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True); self.modules.stop()

    def step(self, n=12):
        for _ in range(n): self.physics.step(1 / 120)

    def test_tile_coordinates_queries_atomic_edits_and_placement(self):
        self.assertEqual(self.scene.tile_get(0, 0), dict(column=0, row=0, x=-232, y=152, costume=None, solid=False))
        self.assertEqual(self.scene.tile_at(-240, 160)['column'], 0); self.assertIsNone(self.scene.tile_at(-240.01, 160)); self.assertIsNone(self.scene.tile_at(784, 0))
        self.scene.tile_set(40, 10, 'star', True); self.assertEqual(self.scene.tiles_of('star')[0]['x'], 408); self.assertEqual(self.scene.map_value('width'), 1024)
        self.scene.tile_place(self.player, 40, 10); self.assertEqual((self.player.x, self.player.y), (408, -8))
        before = copy.deepcopy(self.scene.worlds.map)
        for args in [(0.5, 0, 'star', True), (64, 0, 'star', True), (0, 0, 'missing', False), (0, 0, 'star', 1)]:
            with self.assertRaises((ValueError, IndexError, TypeError)): self.scene.tile_set(*args)
        self.assertEqual(before, self.scene.worlds.map); self.assertIsNone(self.initial['worlds'][0]['map']['tiles'][680])
        self.scene.tile_wall(40, 10, False); self.assertFalse(self.scene.tile_get(40, 10)['solid'])

    def test_fast_sweep_tile_surfaces_grounding_and_runtime_removal(self):
        p = self.player; p.costume('box'); p.set('size', 5); p.go_to(190, 8); p.set_motion('vx', 2000)
        self.scene.tile_set(30, 9, None, True); self.step(); self.assertAlmostEqual(p.x, 238.9); self.assertEqual(p.motion_value('vx'), 0)
        p.go_to(280, 8); p.set_motion('vx', -2000); self.step(); self.assertAlmostEqual(p.x, 257.1)
        p.go_to(248, 17.1); p.set_motion('vx', 0); p.set_motion('ay', -600); self.step(); self.assertTrue(p.motion_value('grounded')); self.assertTrue(p.jump(200))
        self.scene.tile_wall(30, 9, False); p.go_to(190, 8); p.set_motion('ay', 0); p.set_motion('vy', 0); p.set_motion('vx', 2000); self.step(); self.assertGreater(p.x, 300)

    def test_camera_clamp_follow_pointer_coordinates_and_visible_edge_rules(self):
        self.scene.camera_go(900, -200); self.assertEqual((self.scene.camera_x, self.scene.camera_y), (544, 0))
        self.scene.camera_clamp(False); self.scene.camera_go(300, -200); self.assertEqual((self.scene.camera_x, self.scene.camera_y), (300, -200))
        self.scene.camera_follow(self.player); self.player.go_to(400, -70); self.assertEqual((self.scene.camera_x, self.scene.camera_y), (400, -70))
        self.scene_module.inputs.pointer_x = 410; self.scene_module.inputs.pointer_y = -60; self.player.go_to(430, -40); self.assertEqual((self.scene_module.inputs.pointer_x, self.scene_module.inputs.pointer_y), (440, -30))
        self.scene.camera_follow(None); self.player.go_to(800, -40); self.assertEqual(self.scene.camera_x, 430); self.assertTrue(self.player.touching_edge('right')); self.player.bounce(); self.assertLessEqual(self.player.x + self.player.width / 2, 670)
        shot = self.player.projectile('ball', 0, 0, 3); self.step(); self.assertTrue(shot._alive)
        shot.go_to(900, -40); self.step(); self.assertFalse(shot._alive)
        previous = copy.deepcopy(self.scene.worlds.camera)
        with self.assertRaises(ValueError): self.scene.camera_go(42, float('inf'))
        self.assertEqual(previous, self.scene.worlds.camera)
        self.scene.camera_follow(self.player); before = (self.scene.camera_x, self.scene.camera_y); self.player.destroy(); self.scene.worlds.update_camera(); self.assertEqual((self.scene.camera_x, self.scene.camera_y), before)
        self.scene.camera_clamp(True); self.scene.camera_go(0, 0); self.assertEqual(self.scene.camera_x, 0)

    async def test_switch_resets_locals_and_map_preserves_globals_and_cancels_old_tasks(self):
        calls = []; old = self.scene.get('friend'); old.data['items'].append(2); self.player.data['score'] = 7
        async def owned(_):
            calls.append(('start', self.scene.current_sprite.id)); await self.events.wait(10); calls.append('must not finish')
        async def created(_): calls.append(('created', self.scene.current_sprite.id, list(self.scene.current_sprite.data['items'])))
        self.scene.on('friend', 'start', owned); self.scene.on('other', 'created', created)
        self.tasks.append(asyncio.create_task(self.events.run(lambda: None))); await until(lambda: calls)
        self.scene.tile_set(1, 1, 'box', True); self.scene.switch_world('second'); await until(lambda: any(x[0] == 'created' for x in calls))
        self.assertFalse(old._alive); self.assertNotIn('friend', self.scene.items); self.assertIs(self.scene.get('player'), self.player); self.assertEqual(self.player.data['score'], 7)
        self.assertFalse(self.scene.tile_get(1, 1)['solid']); self.assertEqual(calls[-1], ('created', 'other', [1])); self.assertNotIn('must not finish', calls)
        self.scene.switch_world('first'); self.assertIsNot(self.scene.get('friend'), old); self.assertEqual(self.scene.get('friend').data, {'items': [1]}); self.assertFalse(self.scene.tile_get(1, 1)['solid'])
        self.scene.get('friend').go_to(333, 44); self.scene.restart_world(); self.assertEqual(self.scene.get('friend').x, 100)
        with self.assertRaises(ValueError): self.scene.switch_world('missing')
        self.assertEqual(self.scene.world_id, 'first')

    async def test_tile_entries_hit_payloads_and_epoch_discard_stale_delivery(self):
        seen = []; p = self.player; p.costume('box'); p.set('size', 5); p.go_to(0, 8); p.set_motion('vx', 2000)
        async def hit(payload): seen.append(('hit', payload))
        async def overlap(payload): seen.append(('overlap', payload))
        self.scene.on_kind('player', 'tile:hit', hit); self.scene.on_kind('player', 'tile:overlap', overlap)
        self.scene.tile_set(16, 9, 'box', True)
        self.tasks.append(asyncio.create_task(self.events.run(lambda: None))); await until(lambda: self.events.state == 'running')
        self.step(); await until(lambda: seen); self.assertEqual(seen[0][0], 'hit'); self.assertEqual(seen[0][1]['tile']['column'], 16); self.assertEqual(seen[0][1]['normal_x'], -1); self.assertIsNone(seen[0][1]['other'])
        self.scene.tile_set(20, 9, 'star', False); p.stop_motion(); p.go_to(88, 8); self.scene._behaviors.scan_tiles(); await until(lambda: len(seen) == 2)
        for _ in range(3): self.scene._behaviors.scan_tiles()
        await asyncio.sleep(0); self.assertEqual(len(seen), 2)
        p.go_to(0, 8); self.scene._behaviors.scan_tiles(); p.go_to(88, 8); self.scene._behaviors.scan_tiles()
        # This queued entry belongs to the old world and must not hit the global player in the new one.
        self.scene.switch_world('second'); await asyncio.sleep(.02); self.assertEqual(len(seen), 2)

    async def test_transition_from_local_handler_cancels_its_remaining_statements(self):
        seen = []
        async def leave(_):
            self.scene.switch_world('second')
            seen.append('must not continue after leaving own world')
        async def entered(payload): seen.append(payload['world'])
        self.scene.on('friend', 'go', leave); self.events.on('world:enter', entered)
        self.tasks.append(asyncio.create_task(self.events.run(lambda: None))); await until(lambda: self.events.state == 'running')
        self.events.emit('go', None); await until(lambda: 'second' in seen)
        self.assertNotIn('must not continue after leaving own world', seen); self.assertEqual(self.events.state, 'running')

    def test_transitions_discard_runtime_clones_and_restore_authored_capture(self):
        self.initial['sprites'][2]['id'] = 'runtime_1'; self.scene.configure(self.initial); self.player = self.scene.get('player')
        clone = self.player.clone(); self.assertNotEqual(clone.id, 'runtime_1'); shot = self.player.projectile('ball', 0, 0, 3); self.scene.get('friend').hide()
        self.scene.switch_world('second'); self.assertFalse(clone._alive); self.assertFalse(shot._alive); self.assertEqual(set(self.scene.items), {'player', 'runtime_1'})
        self.scene.configure(self.initial); self.assertEqual(set(self.scene.items), {'player', 'friend'}); self.assertTrue(self.scene.get('friend').visible); self.assertEqual(self.scene.camera_x, 0)
        self.scene.switch_world(None); self.assertEqual(set(self.scene.items), {'player'}); self.assertIsNone(self.scene.tile_at(0, 0)); self.assertEqual(self.scene.map_value('width'), 0)
