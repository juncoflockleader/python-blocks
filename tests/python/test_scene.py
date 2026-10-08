import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parents[2] / 'src/runtime'


def initial():
    def sprite(id, x, costume):
        return dict(id=id, name=id.title(), x=x, y=0, direction=0, size=100, layer=0, visible=True, costume=costume)
    return dict(version=1, background='#fdfdf9', assets=[], sprites=[sprite('player', -100, 'bird'), sprite('friend', 100, 'star')])


class SceneTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.messages = []
        host = types.ModuleType('_playground_host')
        host.scene_emit = lambda message: self.messages.append(json.loads(message))
        self.host_patch = patch.dict(sys.modules, {'_playground_host': host})
        self.host_patch.start()
        physics_spec = importlib.util.spec_from_file_location('_playground_physics', ROOT / 'physics.py')
        physics_module = importlib.util.module_from_spec(physics_spec); sys.modules['_playground_physics'] = physics_module; physics_spec.loader.exec_module(physics_module)
        worlds_spec = importlib.util.spec_from_file_location('_playground_worlds', ROOT / 'worlds.py')
        worlds_module = importlib.util.module_from_spec(worlds_spec); sys.modules['_playground_worlds'] = worlds_module; worlds_spec.loader.exec_module(worlds_module)
        spec = importlib.util.spec_from_file_location('scene_test', ROOT / 'scene.py')
        self.module = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.module)
        self.scene = self.module.scene; self.scene.configure(initial())
        self.player = self.scene.get('Player')

    def tearDown(self): self.host_patch.stop()

    def test_transforms_and_failed_update_do_not_mutate_initial_data(self):
        original = initial(); self.scene.configure(original)
        player = self.scene.get('player'); player.move(10); player.turn(90); player.move(20)
        self.assertEqual((player.x, player.y, player.direction), (-90, -20, 90))
        with self.assertRaises(ValueError): player.go_to(42, float('inf'))
        self.assertEqual(player.x, -90)
        for value in (True, '20', None):
            with self.assertRaises(TypeError): player.set('x', value)
        with self.assertRaises(ValueError): player.set('size', 0)
        self.assertEqual(original, initial())
        self.scene.configure(original); self.assertEqual(self.scene.get('Player').x, -100)
        with self.assertRaises(RuntimeError): player.move(1)

    def test_sprite_pen_tracks_all_position_changes_with_independent_clone_settings(self):
        p = self.player; p.set_pen('color', '#123456'); p.set_pen('width', 12); p.set_pen('opacity', 45)
        p.pen_down(); p.hide(); p.move(10); p.set('y', 20); p.change('x', 10)
        marks = [m for m in self.messages if m['type'] == 'pen_line']
        self.assertEqual(len(marks), 4)
        self.assertEqual([(m['x1'], m['y1'], m['x2'], m['y2']) for m in marks], [(-100, 0, -100, 0), (-100, 0, -90, 0), (-90, 0, -90, 20), (-90, 20, -80, 20)])
        self.assertTrue(all(m['color'] == '#123456' and m['width'] == 12 and m['opacity'] == 45 for m in marks))
        clone = p.clone(); clone.set_pen('width', 9); clone.set_pen('color', '#abcdef'); clone.pen_up()
        self.assertEqual(p.pen_value('width'), 12); self.assertTrue(p.pen_value('down'))
        p.pen_up(); p.go_to(20, 20)
        self.assertEqual(len([m for m in self.messages if m['type'] == 'pen_line']), 4)

    async def test_glide_pen_draws_continuous_segments_and_stops_when_superseded(self):
        p = self.player; p.pen_down(); now = [0.0]
        async def wait(seconds): now[0] += seconds
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='running', wait=wait)), patch.object(self.module.time, 'monotonic', side_effect=lambda: now[0]):
            await p.glide(.1, 100, 0)
        marks = [m for m in self.messages if m['type'] == 'pen_line']
        self.assertEqual(marks[-1]['x2'], 100)
        for first, second in zip(marks, marks[1:]): self.assertEqual(first['x2'], second['x1'])
        async def replace(seconds): p.pen_up(); p.go_to(7, 8)
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='running', wait=replace)):
            await p.glide(.1, 100, 100)
        self.assertEqual((p.x, p.y), (7, 8))

    def test_stamps_snapshot_hidden_sprites_and_clear_does_not_reset_pen_or_position(self):
        p = self.player; p.hide(); p.pen_down(); p.set_effect('color', 120); p.rotation_style('left-right'); p.turn(180); p.stamp()
        stamped = self.messages[-1]['sprite']; p.clear_effects(); p.costume('ball'); p.go_to(50, 20)
        self.assertEqual(stamped['effects'], {'color': 120}); self.assertEqual(stamped['costume'], 'bird'); self.assertFalse(stamped['visible'])
        self.scene.clear_pen(); self.assertEqual(self.messages[-1], {'type': 'pen_clear'})
        self.assertEqual((p.x, p.y), (50, 20)); self.assertTrue(p.pen_value('down'))
        p.destroy()
        for action in [lambda: p.stamp(), lambda: p.pen_down(), lambda: p.set_effect('ghost', 30)]:
            with self.assertRaises(RuntimeError): action()

    def test_effects_wrap_color_clamp_other_values_and_copy_without_aliasing(self):
        p = self.player; p.set_effect('color', -20); p.change_effect('color', 50)
        p.set_effect('ghost', 400); p.set_effect('brightness', -200); p.set_effect('whirl', 20)
        clone = p.clone(); clone.clear_effects()
        self.assertEqual(p.get_effect('color'), 30); self.assertEqual(p.get_effect('ghost'), 100); self.assertEqual(p.get_effect('brightness'), -100)
        self.assertEqual(clone.get_effect('whirl'), 0)
        self.scene.set_effect('pixelate', 8); self.scene.change_effect('pixelate', 2); self.assertEqual(self.scene.get_effect('pixelate'), 10)
        self.assertEqual(self.messages[-1], {'type': 'effects', 'effects': {'pixelate': 10}})
        data = initial(); data['effects'] = {'ghost': 40}; data['sprites'][0]['effects'] = {'color': 80}; data['sprites'][0]['pen'] = dict(down=True, color='#abcdef', width=5, opacity=60)
        self.scene.configure(data); self.scene.clear_effects(); self.scene.get('Player').clear_effects()
        self.assertEqual(data['effects']['ghost'], 40); self.assertEqual(data['sprites'][0]['effects']['color'], 80)
        self.assertTrue(self.scene.get('Player').pen_value('down'))

    def test_invalid_pen_and_effect_values_leave_state_and_rendering_unchanged(self):
        p = self.player; before = self.messages[:]
        for prop, value in [('width', 0), ('width', 1201), ('opacity', -1), ('opacity', True), ('color', 'red'), ('down', 1)]:
            with self.assertRaises((ValueError, TypeError)): p.set_pen(prop, value)
        for name, value in [('missing', 3), ('ghost', float('inf')), ('color', True), ('brightness', '2')]:
            with self.assertRaises((ValueError, TypeError)): p.set_effect(name, value)
        self.assertEqual(self.messages, before)
        self.scene._ink_commands = 10_000
        with self.assertRaisesRegex(RuntimeError, '10,000'): p.stamp()
        self.scene.clear_pen()
        with self.assertRaisesRegex(RuntimeError, '10,000'): p.stamp()

    def test_clones_share_assets_but_have_independent_state_and_lifetime(self):
        clone = self.player.clone(); clone.set('x', 90); clone.costume('ball'); clone.hide()
        self.assertNotEqual(clone.id, self.player.id); self.assertEqual(self.player.x, -100); self.assertTrue(self.player.visible)
        identity = clone.id; clone.destroy()
        with self.assertRaises(KeyError): self.scene.get(identity)

    def test_destroyed_reference_and_sprite_limit_are_explicit_errors(self):
        clone = self.player.clone(); identity = clone.id; clone.destroy()
        self.assertEqual(self.messages[-1], {'type': 'delete', 'id': identity})
        with self.assertRaises(RuntimeError): clone.show()
        for _ in range(126): self.player.clone()
        with self.assertRaises(RuntimeError): self.player.clone()

    def test_rotated_bounds_hidden_sprites_and_self_overlap(self):
        other = self.scene.get('Friend'); other.go_to(-100, 0)
        self.assertTrue(self.player.overlaps(other)); self.assertFalse(self.player.overlaps(self.player))
        other.hide(); self.assertFalse(self.player.overlaps(other)); other.show()
        other.go_to(-54, 0); self.assertFalse(self.player.overlaps(other))
        self.player.turn(45); self.assertTrue(self.player.overlaps(other))
        with self.assertRaises(TypeError): self.player.overlaps(3)

    def test_creation_appearance_and_command_limit(self):
        fresh = self.scene.create('ball'); self.assertEqual((fresh.x, fresh.y), (0, 0))
        fresh.set('layer', 4); fresh.set('size', 200); fresh.hide(); fresh.show()
        self.assertTrue(fresh.visible)
        with self.assertRaises(ValueError): fresh.costume('missing')
        with self.assertRaises(ValueError): self.scene.background('red')
        self.scene._commands = 50_000
        with self.assertRaises(RuntimeError): fresh.move(1)

    def test_clone_names_fit_the_browser_limit_for_non_bmp_characters(self):
        initial_state = initial(); initial_state['sprites'][0]['name'] = '🐦' * 24
        self.scene.configure(initial_state); clone = self.scene.get('player').clone()
        self.assertLessEqual(len(clone.name.encode('utf-16-le')) // 2, 48)
        with self.assertRaises(ValueError): clone.set('x', 10 ** 10000)

    def test_aim_distance_and_change_by_keep_native_validation(self):
        p = self.player
        p.go_to(0, 0); p.point_towards(0, 100)
        self.assertEqual(p.direction, 270)
        p.move(10); self.assertAlmostEqual(p.y, 10)
        p.go_to(0, 0); self.assertEqual(p.distance_to(3, 4), 5)
        p.point_towards(0, 0); self.assertEqual(p.direction, 270)
        p.change('x', 12); p.change('direction', 180)
        self.assertEqual((p.x, p.direction), (12, 90))
        with self.assertRaises(ValueError): p.change('visible', 1)
        with self.assertRaises(TypeError): p.distance_to(True, 2)
        with self.assertRaises(ValueError): p.point_towards(0, float('nan'))

    def test_rotation_style_changes_bounds_without_changing_motion(self):
        p = self.player; p.go_to(0, 0); p.turn(90)
        self.assertAlmostEqual(p.width, 40); self.assertAlmostEqual(p.height, 48)
        for style in ('none', 'left-right'):
            p.rotation_style(style)
            self.assertEqual((p.width, p.height), (48, 40))
            self.assertTrue(p.touching_point(23, 0)); self.assertFalse(p.touching_point(25, 0))
        p.move(10); self.assertAlmostEqual(p.y, -10)
        p.hide(); self.assertFalse(p.touching_point(p.x, p.y))
        with self.assertRaises(ValueError): p.rotation_style('random')
        clone = p.clone(); self.assertEqual(clone._state['rotationStyle'], 'left-right')

    def test_bounce_fences_corners_without_turning_an_inward_sprite_outward(self):
        p = self.player
        for x, y, direction, expected in [(250, 0, 0, 180), (-250, 0, 180, 0), (0, 170, 270, 90), (0, -170, 90, 270), (250, 170, 315, 135)]:
            p.go_to(x, y); p.set('direction', direction)
            self.assertTrue(p.touching_edge()); p.bounce()
            self.assertAlmostEqual(p.direction % 360, expected)
            self.assertLessEqual(abs(p.x) + p.width / 2, 240.000001)
            self.assertLessEqual(abs(p.y) + p.height / 2, 160.000001)
            p.bounce(); self.assertAlmostEqual(p.direction % 360, expected)
        p.go_to(250, 0); p.set('direction', 180); p.bounce(); self.assertEqual(p.direction, 180)
        p.go_to(0, 0); self.assertFalse(p.touching_edge())
        with self.assertRaises(ValueError): p.touching_edge('middle')
        self.scene.assets['huge'] = dict(width=256, height=256)
        p.costume('huge'); p.set('size', 400); p.bounce(); self.assertEqual((p.x, p.y), (0, 0))

    def test_front_back_preserve_other_order_and_remain_bounded(self):
        p = self.player; friend = self.scene.get('Friend'); copy = friend.clone()
        p.to_layer('front'); self.assertGreater(p.layer, copy.layer); self.assertLess(friend.layer, copy.layer)
        p.to_layer('back'); self.assertLess(p.layer, friend.layer)
        for _ in range(1200): p.to_layer('front')
        self.assertLess(p.layer, 128)
        with self.assertRaises(ValueError): p.to_layer('middle')

    async def test_timed_speech_clears_only_its_own_bubble(self):
        waits = []
        async def wait(seconds): waits.append(seconds)
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='running', wait=wait)):
            await self.player.say_for('A thought', 0.2, 'think')
        self.assertEqual(waits, [0.2]); self.assertEqual(self.messages[-2]['text'], 'A thought'); self.assertEqual(self.messages[-1]['text'], '')
        async def replace(seconds): self.player.say('New message')
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='running', wait=replace)):
            await self.player.say_for('Old message', 1)
        self.assertEqual(self.messages[-1]['text'], 'New message')
        async def destroy(seconds): self.player.destroy()
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='running', wait=destroy)):
            await self.player.say_for('Goodbye', 1)
        self.assertEqual(self.messages[-1]['type'], 'delete')

    async def test_speech_validation_fails_without_replacing_current_message(self):
        self.player.say('Still here')
        before = self.messages[:]
        for text in (1, None, ['hello']):
            with self.assertRaises(TypeError): self.player.say(text)
        with self.assertRaises(ValueError): self.player.say('🐦' * 121)
        with self.assertRaises(ValueError): self.player.say('Hi', 'shout')
        with self.assertRaises(ValueError): await self.player.say_for('Hi', -1)
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='setup')):
            with self.assertRaises(RuntimeError): await self.player.say_for('Hi', 1)
        self.assertEqual(self.messages, before)

    def test_pointer_queries_transitions_and_reset_use_current_state(self):
        received = []; events = types.SimpleNamespace(state='running', receive=lambda name, payload: received.append((name, payload)))
        def send(value): return self.module.receive_input(json.dumps(value))
        with patch.object(self.module, 'event_session', return_value=events):
            send(dict(kind='pointer', x=20, y=30, down=False, inside=True))
            send(dict(kind='pointer', x=22, y=32, down=True, inside=True))
            send(dict(kind='pointer', x=24, y=34, down=True, inside=True))
            self.assertEqual(len(received), 1); self.assertEqual(received[0][0], 'stage:press')
            self.assertEqual((self.module.inputs.pointer_x, self.module.inputs.pointer_y), (24, 34))
            self.assertTrue(self.module.inputs.pointer_down)
            send(dict(kind='pointer', x=240, y=34, down=False, inside=False))
            self.assertEqual(received[-1], ('stage:release', dict(x=240, y=34, inside=False)))
            send(dict(kind='pointer', x=0, y=0, down=True, inside=True)); send(dict(kind='reset'))
            self.assertFalse(self.module.inputs.pointer_down); self.assertFalse(self.module.inputs.pointer_inside)
            self.assertEqual(len(received), 3)  # Reset does not synthesize release handlers.

    async def test_glide_yields_and_finishes_at_exact_target(self):
        now = [0.0]; waits = []
        async def wait(seconds): waits.append(seconds); now[0] += max(seconds, 0.001); await asyncio.sleep(0)
        events = types.SimpleNamespace(state='running', wait=wait)
        with patch.object(self.module, 'event_session', return_value=events), patch.object(self.module.time, 'monotonic', side_effect=lambda: now[0]):
            await self.player.glide(0.1, 30, 40)
            self.assertEqual((self.player.x, self.player.y), (30, 40)); self.assertGreater(len(waits), 1)
            await self.player.glide(0, 1, 2); self.assertEqual(waits[-1], 0)

    async def test_new_position_cancels_an_older_glide_without_overwriting_it(self):
        async def wait(seconds): self.player.go_to(7, 8)
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='running', wait=wait)):
            await self.player.glide(1, 100, 0)
        self.assertEqual((self.player.x, self.player.y), (7, 8))

    async def test_animation_snapshots_frames_and_manual_costume_supersedes_it(self):
        frames = ['bird', 'star']; waits = []
        async def wait(seconds): waits.append(seconds); frames.clear()
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='running', wait=wait)):
            await self.player.animate(frames, 0.1)
        self.assertEqual(self.player._state['costume'], 'star'); self.assertEqual(waits, [0.1, 0.1])
        async def change(seconds): self.player.costume('ball')
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='running', wait=change)):
            await self.player.animate(['bird', 'star'], 0.1)
        self.assertEqual(self.player._state['costume'], 'ball')

    async def test_authored_animation_frames_and_duration_drive_playback_and_clone_independently(self):
        data = initial(); data['sprites'][0].update(costumes=['bird', 'star', 'ball'], frameSeconds=0.2)
        self.scene.configure(data); p = self.scene.get('Player'); frames = p.frames; frames.clear()
        clone = p.clone(); p.next_costume(); self.assertEqual(p.costume_id, 'star'); self.assertEqual(clone.costume_id, 'bird')
        p.costume('box'); p.next_costume(); self.assertEqual(p.costume_id, 'bird')
        waits = []
        async def wait(seconds): waits.append(seconds)
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='running', wait=wait)):
            await p.play_animation()
        self.assertEqual(waits, [0.2, 0.2, 0.2]); self.assertEqual(p.costume_id, 'ball')
        self.assertEqual(data['sprites'][0]['costume'], 'bird'); self.assertEqual(clone.frames, ['bird', 'star', 'ball'])

    def test_backdrops_notify_only_real_runtime_changes_in_stable_order(self):
        received = []
        events = types.SimpleNamespace(state='running', emit=lambda name, payload: received.append((name, payload)))
        with patch.dict(sys.modules, {'_playground_events': types.SimpleNamespace(events=events)}):
            data = initial(); data['backdrop'] = 'backdrop_meadow'; data['backdrops'] = [dict(id='my_sky', name='My sky')]
            self.scene.configure(data); self.assertEqual(received, [])
            self.scene.set_backdrop('backdrop_night')
            self.assertEqual([name for name, _ in received], ['backdrop:change', 'backdrop:backdrop_night'])
            self.assertEqual(received[0][1], dict(id='backdrop_night', name='Night'))
            self.scene.set_backdrop('backdrop_night'); self.assertEqual(len(received), 2)
            self.scene.next_backdrop(); self.assertEqual(self.scene.backdrop_name, 'My sky')
            self.scene.background('#123456'); self.assertEqual(self.scene.backdrop_id, 'my_sky')
            self.scene.next_backdrop(); self.assertEqual(self.scene.backdrop_name, 'Meadow')
            self.scene.set_backdrop(None); self.assertEqual(received[-1], ('backdrop:change', dict(id=None, name='Plain color')))
            with self.assertRaises(ValueError): self.scene.set_backdrop('missing')
            with self.assertRaises(ValueError): self.scene.set_backdrop(['backdrop_night'])
            self.assertIsNone(self.scene.backdrop_id)
            self.scene.configure(data); self.assertEqual(self.scene.backdrop_id, 'backdrop_meadow')

    def test_backdrops_work_without_an_event_session(self):
        self.scene.set_backdrop('backdrop_night'); self.assertEqual(self.messages[-1], dict(type='backdrop', id='backdrop_night'))
        self.assertEqual(self.scene.backdrop_name, 'Night')

    def test_backdrop_startup_changes_queue_events_but_closed_sessions_do_not(self):
        received = []
        events = types.SimpleNamespace(state='setup', emit=lambda name, payload: received.append((name, payload)))
        with patch.dict(sys.modules, {'_playground_events': types.SimpleNamespace(events=events)}):
            self.scene.set_backdrop('backdrop_night')
            self.assertEqual([name for name, _ in received], ['backdrop:change', 'backdrop:backdrop_night'])
            events.state = 'closed'; self.scene.set_backdrop(None)
            self.assertEqual(len(received), 2)

    def test_next_costume_and_clone_preserve_repeated_frame_positions(self):
        data = initial(); data['sprites'][0]['costumes'] = ['bird', 'star', 'bird', 'ball']; self.scene.configure(data)
        p = self.scene.get('Player'); p.next_costume(); p.next_costume(); clone = p.clone()
        p.next_costume(); clone.next_costume(); self.assertEqual(p.costume_id, 'ball'); self.assertEqual(clone.costume_id, 'ball')
        p.next_costume(); self.assertEqual(p.costume_id, 'bird'); self.assertEqual(clone.costume_id, 'ball')

    async def test_timed_actions_require_running_events_and_valid_inputs(self):
        with patch.object(self.module, 'event_session', return_value=types.SimpleNamespace(state='setup')):
            with self.assertRaises(RuntimeError): await self.player.glide(1, 0, 0)
            with self.assertRaises(RuntimeError): await self.player.animate(['bird'], 0.1)
        for frames in ([], ['missing'], 'bird'):
            with self.assertRaises(ValueError): await self.player.animate(frames, 0.1)

    def test_input_suppresses_repeat_tracks_release_and_clears_on_blur(self):
        received = []; events = types.SimpleNamespace(state='running', receive=lambda name, payload: received.append((name, payload)))
        def send(value): return self.module.receive_input(json.dumps(value))
        with patch.object(self.module, 'event_session', return_value=events):
            send(dict(kind='key', key='ArrowRight', down=True)); send(dict(kind='key', key='ArrowRight', down=True))
            self.assertTrue(self.module.inputs.key_down('ArrowRight')); self.assertEqual(len(received), 1)
            send(dict(kind='key', key='ArrowRight', down=False)); self.assertEqual(received[-1][0], 'release:ArrowRight')
            send(dict(kind='key', key='a', down=True)); send(dict(kind='reset')); self.assertFalse(self.module.inputs.key_down('a'))
            send(dict(kind='click', x=1, y=2, sprite='player'))
            self.assertEqual([v[0] for v in received[-2:]], ['stage:click', 'click:player'])
            self.player.destroy(); send(dict(kind='click', x=1, y=2, sprite='player')); self.assertEqual(received[-1][0], 'stage:click')
            events.state = 'closed'; self.assertFalse(send(dict(kind='key', key='a', down=True)))
