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


class PhysicsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.messages = []; host = types.ModuleType('_playground_host'); host.scene_emit = lambda s: self.messages.append(json.loads(s)); host.scene_sense = lambda s: True
        self.modules = patch.dict(sys.modules, {'_playground_host': host}); self.modules.start()
        for name in ('events', 'behaviors', 'physics', 'worlds', 'scene'):
            spec = importlib.util.spec_from_file_location('_playground_' + name, ROOT / (name + '.py')); module = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = module; spec.loader.exec_module(module); setattr(self, name + '_module', module)
        self.events = self.events_module.events; self.scene = self.scene_module.scene
        self.scene.configure(initial()); self.player = self.scene.get('player'); self.friend = self.scene.get('friend')
        self.player.go_to(0, 0); self.player.costume('box'); self.player.rotation_style('none'); self.player.set('size', 50)
        self.scene.enable_motion(); self.physics = self.scene._physics; self.tasks = []

    async def asyncTearDown(self):
        for task in self.tasks: task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True); self.modules.stop()

    def step(self, seconds):
        for _ in range(round(seconds * 120)): self.physics.step(1 / 120)

    def wall(self, x=0, y=-40, width=100, height=4):
        self.scene.assets['wall_test'] = {'id': 'wall_test', 'width': width, 'height': height}
        self.friend.costume('wall_test'); self.friend.go_to(x, y); self.friend.set_motion('body', 'wall'); return self.friend

    def test_velocity_acceleration_drag_and_partition_independence(self):
        p = self.player; p.set_motion('vx', 120); p.set_motion('ay', -120)
        self.step(1); self.assertAlmostEqual(p.x, 120); self.assertAlmostEqual(p.y, -60.5); self.assertAlmostEqual(p.motion_value('vy'), -120)
        p.set_motion('vx', 100); p.set_motion('dragX', 50); self.step(1); self.assertAlmostEqual(p.motion_value('vx'), 50)
        p.set_motion('dragX', 1000); self.step(1); self.assertEqual(p.motion_value('vx'), 0)
        p.stop_motion(); p.go_to(0, 0); p.set_motion('vx', 120); p.set_motion('dragX', 0)
        for _ in range(30): self.physics.step(1 / 30)
        self.assertAlmostEqual(p.x, 120)

    def test_gravity_grounding_jump_and_platform_edge_departure(self):
        self.wall(); p = self.player; p.set_motion('ay', -500); self.step(1)
        self.assertAlmostEqual(p.y, -27); self.assertEqual(p.motion_value('vy'), 0); self.assertTrue(p.motion_value('grounded'))
        self.assertTrue(p.jump(150)); self.step(.1); self.assertGreater(p.y, -27); self.assertFalse(p.motion_value('grounded')); self.assertFalse(p.jump(150))
        self.step(1); p.set_motion('vx', 200); self.step(.5); self.assertFalse(p.motion_value('grounded')); self.assertLess(p.y, -27)

    def test_sweep_stops_max_speed_at_one_pixel_wall_in_both_directions(self):
        self.wall(15, 0, 1, 100); p = self.player; p.set('size', 5); p.set_motion('vx', 2000)
        self.physics.step(.1); self.assertAlmostEqual(p.x, 13.4); self.assertEqual(p.motion_value('vx'), 0)
        p.go_to(30, 0); p.set_motion('vx', -2000); self.physics.step(.1); self.assertAlmostEqual(p.x, 16.6); self.assertEqual(p.motion_value('vx'), 0)

    def test_diagonal_slide_stop_bounce_and_destroy_responses(self):
        self.wall(30, 0, 4, 200); p = self.player
        for mode in ('slide', 'stop', 'bounce'):
            p.go_to(0, 0); p.set_motion('vx', 200); p.set_motion('vy', 40); p.set_motion('response', mode); self.physics.step(.1)
            self.assertLessEqual(p.x, 17 + 1e-8)
            if mode == 'slide': self.assertAlmostEqual(p.y, 4); self.assertEqual(p.motion_value('vx'), 0); self.assertEqual(p.motion_value('vy'), 40)
            if mode == 'stop': self.assertLess(p.y, 4); self.assertEqual(p.motion_value('vy'), 0)
            if mode == 'bounce': self.assertLess(p.x, 17); self.assertEqual(p.motion_value('vx'), -200)
        p.go_to(0, 0); p.set_motion('vx', 200); p.set_motion('response', 'destroy'); self.physics.step(.1); self.assertNotIn('player', self.scene.items)

    def test_corner_reflects_both_components_and_repeated_impacts_stay_bounded(self):
        p = self.player; p.go_to(229, 149); p.set_motion('edges', 'bounce'); p.set_motion('vx', 2000); p.set_motion('vy', 2000)
        self.physics.step(1 / 120); self.assertEqual(p.motion_value('vx'), -2000); self.assertEqual(p.motion_value('vy'), -2000)
        self.step(1); self.assertTrue(-229 <= p.x <= 229 and -149 <= p.y <= 149)
        p.set_motion('edges', 'stop'); p.set_motion('vx', 100); p.set_motion('vy', 100); p.go_to(999, 999); self.physics.step(1 / 120); self.assertEqual((p.x, p.y), (229, 149))
        p.set_motion('edges', 'destroy'); p.set_motion('vx', 20); self.physics.step(.1); self.assertNotIn('player', self.scene.items)

    def test_initial_penetration_hidden_walls_and_oversized_edge_geometry(self):
        self.wall(0, -10, 100, 10); self.friend.hide(); p = self.player; p.set_motion('ay', -100); self.physics.step(.1)
        self.assertAlmostEqual(p.y, 6); self.assertTrue(p.motion_value('grounded'))
        self.friend.destroy(); self.scene.assets['large'] = {'id': 'large', 'width': 256, 'height': 256}; p.costume('large'); p.set('size', 400)
        p.set_motion('edges', 'bounce'); p.set_motion('vx', 100); self.physics.step(.1); self.assertEqual((p.x, p.y), (0, 0)); self.assertEqual(p.motion_value('vx'), 0)

    def test_controller_axes_opposites_focus_reset_and_disabled_axis_gravity(self):
        p = self.player; p.control('arrows', 120, 0); p.set_motion('ay', -120); keys = self.scene_module.inputs._keys
        keys.add('ArrowRight'); self.step(.5); self.assertAlmostEqual(p.x, 60); self.assertLess(p.y, 0)
        keys.add('ArrowLeft'); self.step(.1); self.assertAlmostEqual(p.x, 60)
        self.scene_module.inputs.reset(); self.step(.1); self.assertAlmostEqual(p.x, 60)
        p.control('wasd', 60, 60); keys.add('a'); keys.add('w'); p.set_motion('ay', 0); y = p.y; self.step(.5)
        self.assertAlmostEqual(p.x, 30); self.assertAlmostEqual(p.y - y, 30)
        keys.clear(); keys.add('d'); p.control('wasd', 60, 0); p.set_motion('edges', 'stop'); p.set_motion('ay', -600); p.go_to(0, -149)
        self.step(.5); self.assertAlmostEqual(p.x, 30); self.assertAlmostEqual(p.y, -149)

    def test_projectile_kind_lifetime_auto_destroy_and_clone_independence(self):
        p = self.player; p.control('arrows'); p.set_motion('ay', -300); p.set_kind('hero')
        shot = p.projectile('ball', 200, 0, .2)
        self.assertEqual(shot.kind, 'projectile'); self.assertEqual(shot.motion_value('ay'), 0); self.assertEqual(shot.motion_value('controller'), 'none')
        self.assertEqual(self.scene.of_kind('projectile'), [shot]); self.step(.1); self.assertAlmostEqual(shot.x, 20); self.step(.1); self.assertNotIn(shot, self.scene.all())
        shot = p.projectile('ball', 2000, 0, 0); self.step(.2); self.assertNotIn(shot, self.scene.all())
        clone = p.clone(); clone.set_motion('ay', -500); self.assertEqual(p.motion_value('ay'), -300); self.assertEqual(clone.kind, 'hero')

    async def test_kind_handlers_receive_new_projectiles_and_physics_collision_payload_once(self):
        self.wall(30, 0, 4, 200); seen = []
        async def created(payload): seen.append(('created', self.scene.current_sprite.id, payload['kind']))
        async def hit(payload): seen.append(('hit', self.scene.current_sprite.id, payload['other'], payload['normal_x']))
        self.scene.on_kind('projectile', 'created', created); self.scene.on_kind('projectile', 'collision', hit)
        shot = self.player.projectile('ball', 400, 0, 3); shot.set_motion('response', 'slide')
        task = asyncio.create_task(self.events.run()); self.tasks.append(task)
        await until(lambda: bool(seen)); self.physics.step(.1); await until(lambda: len(seen) == 2)
        self.assertEqual(seen, [('created', shot.id, 'projectile'), ('hit', shot.id, 'friend', -1)])
        self.physics.step(.1)
        for _ in range(5): await asyncio.sleep(0)
        self.assertEqual(len(seen), 2)
        shot.go_to(0, 0); self.physics.step(.01); shot.set_motion('vx', 400); self.physics.step(.1); await until(lambda: len(seen) == 3)
        shot.go_to(52, 0); shot.set_motion('vx', -400); self.physics.step(.1); await until(lambda: len(seen) == 4)
        self.assertEqual(seen[-1][-1], 1); self.assertTrue(all(entry[3] == 1 for entry in self.physics.contacts))

    async def test_motion_services_start_inside_running_handler_and_stop_with_session(self):
        # A library helper can enable motion after the session has already begun.
        self.scene.configure(initial()); self.player = self.scene.get('player')
        async def start(_): self.player.set_motion('vx', 120)
        self.events.on('start', start); task = asyncio.create_task(self.events.run()); self.tasks.append(task)
        await asyncio.sleep(.08); self.assertGreater(self.player.x, -100); task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        x = self.player.x; await asyncio.sleep(.05); self.assertEqual(self.player.x, x)

    async def test_invalid_settings_are_atomic_glide_conflicts_and_elapsed_time_is_bounded(self):
        p = self.player; before = dict(p._state['motion'])
        for prop, value in [('vx', True), ('vx', 2001), ('ay', float('nan')), ('body', 'other'), ('autoDestroy', 1), ('lifetime', -1)]:
            with self.assertRaises((ValueError, TypeError)): p.set_motion(prop, value)
        with self.assertRaises(ValueError): p.control('arrows', 100, 2001)
        self.assertEqual(p._state['motion'], before)
        p.set_motion('vx', 100)
        with self.assertRaisesRegex(RuntimeError, 'automatic motion'): await p.glide(1, 0, 0)
        self.physics.step(10); self.assertAlmostEqual(p.x, 10)
        p.stop_motion(); self.step(1); self.assertAlmostEqual(p.x, 10)
        for dt in (-1, float('inf'), True):
            with self.assertRaises(ValueError): self.physics.step(dt)
