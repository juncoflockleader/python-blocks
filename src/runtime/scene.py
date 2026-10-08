"""Python-owned sprite state. The host renders snapshots and supplies input.

Positions use centered stage pixels, y up, and clockwise degrees from right.
Overlap uses enclosing rectangles; explicit pixel queries use the read-only host bridge.
"""
import json
import math
import time
import sys
import copy
import re
from _playground_worlds import Worlds
from _playground_host import scene_emit
from _playground_physics import Physics, defaults as motion_defaults, checked as checked_motion, kind as checked_kind


def number(value, label, minimum=-1_000_000, maximum=1_000_000):
    if type(value) not in (int, float):
        raise TypeError(f'{label} needs a number.')
    if not minimum <= value <= maximum or not math.isfinite(value):
        raise ValueError(f'{label} needs a finite number from {minimum} to {maximum}.')
    return value


def event_session():
    from _playground_events import events
    return events


EFFECT_LIMITS = {'color': (0, 360), 'brightness': (-100, 100), 'ghost': (0, 100),
                 'whirl': (-360, 360), 'fisheye': (-100, 1000), 'pixelate': (0, 128), 'mosaic': (0, 15)}


class Appearance:
    def _effect_check(self, effect):
        self._check()
        if type(effect) is not str or effect not in EFFECT_LIMITS: raise ValueError('Choose color, brightness, ghost, whirl, fisheye, pixelate, or mosaic.')

    def get_effect(self, effect):
        self._effect_check(effect)
        return self._effects.get(effect, 0)

    def set_effect(self, effect, value):
        self._effect_check(effect)
        value = number(value, 'Effect value')
        low, high = EFFECT_LIMITS[effect]
        self._effects[effect] = value % 360 if effect == 'color' else max(low, min(high, value))
        self._send_effects()

    def change_effect(self, effect, amount):
        self.set_effect(effect, self.get_effect(effect) + number(amount, 'Effect change'))

    def clear_effects(self):
        self._check(); self._effects.clear(); self._send_effects()


class Sprite(Appearance):
    def __init__(self, owner, state):
        self._owner, self._state = owner, dict(state)
        self._alive = True
        self._runtime_world = False
        self._motion = self._animation = 0
        self._speech = 0
        self._state.setdefault('rotationStyle', 'all')
        self._state['costumes'] = list(state.get('costumes', [state['costume']]))
        self._state.setdefault('frameSeconds', 0.1)
        self._state['pen'] = dict(state.get('pen', {'down': False, 'color': '#267c70', 'width': 3, 'opacity': 100}))
        self._state['effects'] = dict(state.get('effects', {}))
        self._effects = self._state['effects']
        self._frame_index = self._state['costumes'].index(state['costume']) if state['costume'] in self._state['costumes'] else -1
        self.data = copy.deepcopy(self._state.pop('data', {}))
        self.template_id = self._state['id']
        self.is_clone = False
        self._state['motion'] = {**motion_defaults(), **state.get('motion', {})}
        self._state.setdefault('kind', 'sprite')

    def __getattr__(self, name):
        if name in ('id', 'name', 'x', 'y', 'direction', 'size', 'layer', 'visible', 'kind'):
            self._check()
            return self._state[name]
        if name in ('width', 'height'):
            self._check()
            return self._bounds()[0 if name == 'width' else 1]
        if name in ('frames', 'costume_id', 'frame_seconds'):
            self._check()
            return list(self._state['costumes']) if name == 'frames' else self._state['costume' if name == 'costume_id' else 'frameSeconds']
        raise AttributeError(name)

    def _check(self):
        if not self._alive:
            raise RuntimeError('This sprite was destroyed. Create or choose another sprite.')

    def _send(self):
        self._check()
        self._owner._send({'type': 'sprite', 'sprite': dict(self._state)})
        self._owner.worlds.update_camera()

    def _send_effects(self): self._send()

    def set_kind(self, value):
        self._check(); self._state['kind'] = checked_kind(value); self._send()

    def motion_value(self, property):
        self._check()
        if property == 'grounded':
            return (self._owner._physics or Physics(self._owner, inputs)).grounded(self)
        if property not in self._state['motion']: raise ValueError('Choose a motion property.')
        return self._state['motion'][property]

    def set_motion(self, property, value):
        self._check(); value = checked_motion(property, value)
        self._owner.enable_motion()
        self._state['motion'][property] = value
        if property in ('vx', 'vy', 'ax', 'ay', 'controller') and self._state['motion']['body'] == 'off': self._state['motion']['body'] = 'moving'
        self._motion += 1; self._send()

    def change_motion(self, property, amount):
        if property not in ('vx', 'vy', 'ax', 'ay', 'dragX', 'dragY', 'speedX', 'speedY', 'lifetime'): raise ValueError('Choose a numeric motion property.')
        self.set_motion(property, self.motion_value(property) + number(amount, 'Motion change'))

    def control(self, scheme, speed_x=120, speed_y=120):
        checked_motion('controller', scheme); checked_motion('speedX', speed_x); checked_motion('speedY', speed_y)
        self._check(); self._owner.enable_motion()
        self._state['motion'].update(body='moving', controller=scheme, speedX=speed_x, speedY=speed_y); self._motion += 1; self._send()

    def jump(self, speed):
        speed = number(speed, 'Jump speed', 0, 2000)
        if self.motion_value('grounded'): self.set_motion('vy', speed); return True
        return False

    def stop_motion(self):
        self._check(); self._state['motion'].update(body='off', vx=0, vy=0, ax=0, ay=0, controller='none'); self._send()

    def projectile(self, costume, vx, vy, lifetime=3):
        self._check(); checked_motion('vx', vx); checked_motion('vy', vy); checked_motion('lifetime', lifetime)
        if costume not in self._owner.assets: raise ValueError('Choose an available costume.')
        self._owner.enable_motion()
        state = {'name': 'Projectile', 'kind': 'projectile', 'x': self.x, 'y': self.y, 'direction': 0, 'size': 100, 'layer': self.layer, 'visible': True, 'costume': costume,
                 'motion': {**motion_defaults(), 'body': 'moving', 'vx': vx, 'vy': vy, 'lifetime': lifetime, 'autoDestroy': True, 'response': 'destroy'}}
        return self._owner._create(state)

    def pen_value(self, property):
        self._check()
        if type(property) is not str or property not in self._state['pen']: raise ValueError('Choose down, color, width, or opacity.')
        return self._state['pen'][property]

    def set_pen(self, property, value):
        self._check()
        if property == 'color':
            if type(value) is not str or not re.fullmatch(r'#[0-9a-fA-F]{6}', value): raise ValueError('Pen color needs #RRGGBB text.')
        elif property in ('width', 'opacity'): value = number(value, 'Pen ' + property, 1 if property == 'width' else 0, 1200 if property == 'width' else 100)
        else: raise ValueError('Choose color, width, or opacity; use pen_up or pen_down to lift or lower the pen.')
        self._state['pen'][property] = value
        self._send()

    def change_pen(self, property, amount):
        if property not in ('width', 'opacity'): raise ValueError('Choose pen width or opacity.')
        self.set_pen(property, self.pen_value(property) + number(amount, 'Pen change'))

    def pen_up(self):
        self._check(); self._state['pen']['down'] = False; self._send()

    def pen_down(self):
        self._check()
        if not self._state['pen']['down']:
            self._state['pen']['down'] = True
            self._trace(self.x, self.y, self.x, self.y)
            self._send()

    def _trace(self, x1, y1, x2, y2):
        pen = self._state['pen']
        if pen['down']:
            self._owner._ink({'type': 'pen_line', 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                              'color': pen['color'], 'width': pen['width'], 'opacity': pen['opacity']})

    def _position(self, x, y):
        if x != self.x or y != self.y: self._trace(self.x, self.y, x, y)
        self._state.update(x=x, y=y)
        self._send()

    def stamp(self):
        self._check()
        self._owner._ink({'type': 'stamp', 'sprite': copy.deepcopy(self._state)})

    def go_to(self, x, y):
        self._check()
        x, y = number(x, 'x'), number(y, 'y')
        self._motion += 1
        self._position(x, y)

    def move(self, distance):
        distance = number(distance, 'Distance')
        angle = math.radians(self.direction)
        self.go_to(self.x + math.cos(angle) * distance, self.y - math.sin(angle) * distance)

    def turn(self, degrees):
        self.set('direction', self.direction + number(degrees, 'Degrees'))

    def change(self, property, amount):
        if property not in ('x', 'y', 'direction', 'size', 'layer'):
            raise ValueError('Choose x, y, direction, size, or layer.')
        self.set(property, getattr(self, property) + number(amount, 'Change'))

    def point_towards(self, x, y):
        x, y = number(x, 'x'), number(y, 'y')
        dx, dy = x - self.x, y - self.y
        if dx or dy: self.set('direction', math.degrees(math.atan2(-dy, dx)))

    def distance_to(self, x, y):
        return math.hypot(number(x, 'x') - self.x, number(y, 'y') - self.y)

    def rotation_style(self, style):
        self._check()
        if style not in ('all', 'left-right', 'none'): raise ValueError('Choose all, left-right, or none for rotation style.')
        self._state['rotationStyle'] = style
        self._send()

    def to_layer(self, place):
        self._check()
        if place not in ('front', 'back'): raise ValueError('Choose front or back.')
        # Compact the order first so repeated front/back operations never hit a numeric limit.
        ordered = sorted(self._owner.items.values(), key=lambda s: s.layer)
        ordered.remove(self)
        ordered.insert(len(ordered) if place == 'front' else 0, self)
        for index, sprite in enumerate(ordered):
            sprite._state['layer'] = index
            sprite._send()

    def touching_point(self, x, y):
        x, y = number(x, 'x'), number(y, 'y')
        self._check()
        if not self.visible: return False
        w, h = self._bounds()
        return abs(self.x - x) <= w / 2 and abs(self.y - y) <= h / 2

    def touching_edge(self, edge='any'):
        self._check()
        if edge not in ('any', 'left', 'right', 'top', 'bottom'): raise ValueError('Choose any, left, right, top, or bottom edge.')
        w, h = self._bounds()
        left, right, bottom, top = self._owner.worlds.view()
        hits = {'left': self.x - w / 2 <= left, 'right': self.x + w / 2 >= right,
                'top': self.y + h / 2 >= top, 'bottom': self.y - h / 2 <= bottom}
        return any(hits.values()) if edge == 'any' else hits[edge]

    def bounce(self):
        self._check()
        if not self.touching_edge(): return
        dx, dy = math.cos(math.radians(self.direction)), -math.sin(math.radians(self.direction))
        if (self.touching_edge('left') and dx < 0) or (self.touching_edge('right') and dx > 0): dx = -dx
        if (self.touching_edge('bottom') and dy < 0) or (self.touching_edge('top') and dy > 0): dy = -dy
        self._state['direction'] = math.degrees(math.atan2(-dy, dx)) % 360
        w, h = self._bounds()
        # An oversized sprite cannot fit along that axis; center it deterministically.
        cx, cy = self._owner.worlds.x, self._owner.worlds.y
        x = cx if w >= 480 else max(cx - 240 + w / 2, min(cx + 240 - w / 2, self.x))
        y = cy if h >= 320 else max(cy - 160 + h / 2, min(cy + 160 - h / 2, self.y))
        self.go_to(x, y)

    def say(self, text, style='say'):
        self._check()
        if type(text) is not str: raise TypeError('Speech needs text. Convert numbers to text first.')
        if len(text.encode('utf-16-le', errors='surrogatepass')) > 480: raise ValueError('Speech supports up to 240 text characters.')
        if style not in ('say', 'think'): raise ValueError('Choose say or think.')
        self._speech += 1
        self._owner._send({'type': 'bubble', 'id': self.id, 'text': text, 'style': style})

    async def say_for(self, text, seconds, style='say'):
        seconds = number(seconds, 'Speech seconds', 0, 60)
        events = event_session()
        if events.state != 'running': raise RuntimeError('Timed speech needs a running event handler or async function.')
        self.say(text, style)
        token = self._speech
        await events.wait(seconds)
        if self._alive and token == self._speech: self.say('', style)

    def set(self, property, value):
        self._check()
        limits = {'x': (-1e6, 1e6), 'y': (-1e6, 1e6), 'direction': (-1e6, 1e6), 'size': (5, 400), 'layer': (-1000, 1000)}
        if property not in limits:
            raise ValueError('Choose x, y, direction, size, or layer.')
        value = number(value, property, *limits[property])
        if property == 'direction': value %= 360
        if property in ('x', 'y'):
            self.go_to(value if property == 'x' else self.x, value if property == 'y' else self.y)
            return
        self._state[property] = value
        self._send()

    def show(self):
        self._check(); self._state['visible'] = True; self._send()

    def hide(self):
        self._check(); self._state['visible'] = False; self._send()

    def costume(self, costume):
        self._check()
        if costume not in self._owner.assets: raise ValueError('This costume is unavailable in the scene.')
        self._animation += 1
        self._state['costume'] = costume
        self._frame_index = self._state['costumes'].index(costume) if costume in self._state['costumes'] else -1
        self._send()

    def next_costume(self):
        self._check()
        frames = self.frames
        index = (self._frame_index + 1) % len(frames)
        self.costume(frames[index])
        self._frame_index = index

    async def play_animation(self):
        await self.animate(self.frames, self.frame_seconds)

    def clone(self):
        self._check()
        clone = self._owner._create(dict(self._state), template=self.template_id, data=copy.deepcopy(self.data), is_clone=True)
        clone._frame_index = self._frame_index
        if self._owner._sounds: self._owner._sounds._clone(self.id, clone.id)
        return clone

    def destroy(self, _defer_cancel=False):
        self._check()
        if self._owner._sounds: self._owner._sounds._destroy(self.id)
        self._owner._send({'type': 'delete', 'id': self.id})
        del self._owner.items[self.id]
        self._alive = False
        self._motion += 1; self._animation += 1
        if self._owner._behaviors: self._owner._behaviors.destroyed(self, _defer_cancel)

    def _bounds(self):
        asset = self._owner.assets[self._state['costume']]
        angle, scale = math.radians(self.direction if self._state['rotationStyle'] == 'all' else 0), self.size / 100
        c, s = abs(math.cos(angle)), abs(math.sin(angle))
        return scale * (c * asset['width'] + s * asset['height']), scale * (s * asset['width'] + c * asset['height'])

    def overlaps(self, other):
        self._check()
        if not isinstance(other, Sprite) or other._owner is not self._owner: raise TypeError('Overlap needs another sprite from this scene.')
        other._check()
        if self is other or not self.visible or not other.visible: return False
        w, h = self._bounds(); ow, oh = other._bounds()
        return abs(self.x - other.x) < (w + ow) / 2 and abs(self.y - other.y) < (h + oh) / 2

    def touching_pixels(self, other):
        if not self.overlaps(other): return False
        from _playground_host import scene_sense
        return bool(scene_sense(json.dumps({'kind': 'overlap', 'a': self._state, 'b': other._state, 'world': bool(self._owner.worlds.definitions), 'camera': {'x': self._owner.worlds.x, 'y': self._owner.worlds.y}})))

    def touching_pixel(self, x, y):
        x, y = number(x, 'x'), number(y, 'y')
        self._check()
        if not self.visible: return False
        from _playground_host import scene_sense
        return bool(scene_sense(json.dumps({'kind': 'point', 'a': self._state, 'x': x, 'y': y, 'world': bool(self._owner.worlds.definitions), 'camera': {'x': self._owner.worlds.x, 'y': self._owner.worlds.y}})))

    def touching_color(self, color, own_color=None, tolerance=10):
        self._check()
        for value in (color, own_color):
            if value is not None and (type(value) is not str or not re.fullmatch(r'#[0-9a-fA-F]{6}', value)):
                raise ValueError('Colors need #RRGGBB text.')
        if color is None: raise ValueError('Choose a target color in #RRGGBB format.')
        tolerance = number(tolerance, 'Color tolerance', 0, 255)
        if not self.visible: return False
        from _playground_host import scene_sense
        return bool(scene_sense(json.dumps({'kind': 'color', 'a': self._state, 'color': color, 'ownColor': own_color, 'tolerance': tolerance})))

    async def glide(self, seconds, x, y):
        self._check()
        if self._state['motion']['body'] == 'moving': raise RuntimeError('Stop automatic motion before using glide on this sprite.')
        seconds = number(seconds, 'Glide seconds', 0, 60)
        x, y = number(x, 'x'), number(y, 'y')
        events = event_session()
        if events.state != 'running': raise RuntimeError('Glide needs a running event handler or async function.')
        self._motion += 1; token = self._motion
        start_x, start_y, started = self.x, self.y, time.monotonic()
        while self._alive and self._motion == token:
            progress = 1 if seconds == 0 else min(1, (time.monotonic() - started) / seconds)
            self._position(start_x + (x - start_x) * progress, start_y + (y - start_y) * progress)
            if progress == 1: break
            await events.wait(min(1 / 30, seconds))
        if seconds == 0: await events.wait(0)

    async def animate(self, frames, seconds):
        self._check()
        if type(frames) not in (list, tuple) or not 1 <= len(frames) <= 100 or any(type(f) is not str or f not in self._owner.assets for f in frames):
            raise ValueError('Animation needs 1–100 available costume IDs.')
        frames = tuple(frames)
        seconds = number(seconds, 'Seconds per costume', 0.02, 10)
        events = event_session()
        if events.state != 'running': raise RuntimeError('Animation needs a running event handler or async function.')
        self._animation += 1; token = self._animation
        authored = frames == tuple(self.frames)
        for index, frame in enumerate(frames):
            if not self._alive or self._animation != token: break
            self._state['costume'] = frame
            self._frame_index = index if authored else self._state['costumes'].index(frame) if frame in self._state['costumes'] else -1
            self._send()
            await events.wait(seconds)


class Scene(Appearance):
    def __init__(self):
        self.items = {}; self.assets = {}; self._serial = 0; self._commands = 0
        self.backdrops = {}; self.backdrop_id = None
        self._effects = {}; self._ink_commands = 0
        self._behaviors = None; self._pending_clones = []
        self._physics = None
        self._game = None
        self._sounds = None; self._sound_assets = []
        self.worlds = Worlds(self)

    @property
    def sounds(self):
        if self._sounds is None:
            from _playground_sounds import Sounds
            self._sounds = Sounds(self)
        return self._sounds

    @property
    def game(self):
        if self._game is None:
            from _playground_game import Game
            self._game = Game(self)
        return self._game

    @property
    def current_sprite(self):
        from _playground_behaviors import current_sprite
        return current_sprite()

    def on(self, template, event, handler):
        self._ensure_behaviors().register(template, event, handler)

    def on_kind(self, kind, event, handler):
        self._ensure_behaviors().register(checked_kind(kind), event, handler, by_kind=True)

    def enable_motion(self):
        if self._physics is None:
            manager = self._ensure_behaviors(); manager.ensure_clock()
            self._physics = Physics(self, inputs)

    @property
    def world_id(self): return self.worlds.active

    @property
    def world_name(self): return self.worlds.name

    @property
    def camera_x(self): return self.worlds.x

    @property
    def camera_y(self): return self.worlds.y

    def switch_world(self, identity): self.worlds.switch(identity)
    def restart_world(self): self.worlds.switch(self.world_id, True)
    def camera_go(self, x, y): self.worlds.move_camera(x, y)
    def camera_follow(self, sprite): self.worlds.follow(sprite)
    def camera_clamp(self, enabled): self.worlds.clamp(enabled)
    def tile_at(self, x, y): return self.worlds.at(x, y)
    def tile_get(self, column, row): return self.worlds.tile(column, row)
    def tile_set(self, column, row, costume, solid=False): self.worlds.set_tile(column, row, costume, solid)
    def tile_wall(self, column, row, solid): self.worlds.set_wall(column, row, solid)
    def tiles_of(self, costume): return self.worlds.of_costume(costume)
    def tile_place(self, sprite, column, row): self.worlds.place(sprite, column, row)

    def map_value(self, property):
        if property not in ('columns', 'rows', 'tileSize', 'width', 'height'): raise ValueError('Choose a map dimension.')
        m = self.worlds.map
        if not m: return 0
        return m['columns' if property == 'width' else 'rows'] * m['tileSize'] if property in ('width', 'height') else m[property]

    def _ensure_behaviors(self):
        from _playground_behaviors import Behaviors
        if self._behaviors is None:
            self._behaviors = Behaviors(self, event_session())
            for sprite in self._pending_clones:
                if sprite._alive: self._behaviors.created(sprite)
            self._pending_clones.clear()
        return self._behaviors

    def all(self): return list(self.items.values())

    def of_kind(self, kind):
        checked_kind(kind)
        return [s for s in self.items.values() if s.kind == kind]

    def instances(self, sprite):
        if not isinstance(sprite, Sprite) or sprite._owner is not self: raise TypeError('Choose a sprite from this scene.')
        sprite._check()
        return [s for s in self.items.values() if s.template_id == sprite.template_id]

    def _check(self): pass

    def _send_effects(self): self._send({'type': 'effects', 'effects': dict(self._effects)})

    def _ink(self, command):
        if self._ink_commands >= 10_000: raise RuntimeError('This run exceeded 10,000 pen lines and stamps. Stop and run again.')
        self._ink_commands += 1
        self._send(command)

    def clear_pen(self): self._send({'type': 'pen_clear'})

    def _send(self, command):
        self._commands += 1
        if self._commands > 50_000: raise RuntimeError('This run exceeded 50,000 sprite changes. Stop and run again.')
        scene_emit(json.dumps(command))

    def load(self, filename):
        with open(filename, encoding='utf-8') as file: data = json.load(file)
        self.configure(data)

    def configure(self, data):
        if self._sounds: self._sounds._stop(None, cleanup=True)
        self._sounds = None; self._sound_assets = [s['id'] for s in data.get('sounds', [])]
        for old in self.items.values(): old._alive = False
        self.items = {}; self._serial = 0; self._commands = 0
        self._behaviors = None; self._pending_clones = []
        self._physics = None
        self._game = None
        self._ink_commands = 0; self.clear_pen()
        self._effects = dict(data.get('effects', {})); self._send_effects()
        self.assets = {a['id']: a for a in [
            {'id': 'bird', 'width': 48, 'height': 40}, {'id': 'star', 'width': 44, 'height': 44},
            {'id': 'ball', 'width': 40, 'height': 40}, {'id': 'box', 'width': 44, 'height': 44}, *data['assets']]}
        inputs.reset_session()
        inputs.pointer_x = inputs.pointer_y = 0
        self.background(data['background'])
        self.backdrops = {a['id']: a for a in [
            {'id': 'backdrop_meadow', 'name': 'Meadow'}, {'id': 'backdrop_night', 'name': 'Night'}, *data.get('backdrops', [])]}
        self.backdrop_id = data.get('backdrop')
        self._send({'type': 'backdrop', 'id': self.backdrop_id})
        self.worlds = Worlds(self); self.worlds.configure(data)
        for state in data['sprites']:
            if state.get('world') is not None and state['world'] != self.worlds.active: continue
            sprite = Sprite(self, state); self.items[sprite.id] = sprite; sprite._send()
        self.worlds.update_camera()
        if self.worlds.active: self.worlds.enter()

    def background(self, color):
        import re
        if type(color) is not str or not re.fullmatch(r'#[0-9a-fA-F]{6}', color): raise ValueError('Use a background color in #RRGGBB format.')
        self._send({'type': 'background', 'color': color})

    @property
    def backdrop_name(self):
        return self.backdrops[self.backdrop_id]['name'] if self.backdrop_id else 'Plain color'

    def set_backdrop(self, identity):
        if identity is not None and (type(identity) is not str or identity not in self.backdrops): raise ValueError('Choose an available backdrop or None for plain color.')
        if identity == self.backdrop_id: return
        self.backdrop_id = identity
        self._send({'type': 'backdrop', 'id': identity})
        module = sys.modules.get('_playground_events')
        if module and module.events.state in ('setup', 'running'):
            payload = {'id': identity, 'name': self.backdrop_name}
            module.events.emit('backdrop:change', payload)
            if identity: module.events.emit('backdrop:' + identity, payload)

    def next_backdrop(self):
        values = list(self.backdrops)
        current = values.index(self.backdrop_id) if self.backdrop_id in values else -1
        self.set_backdrop(values[(current + 1) % len(values)])

    def get(self, name):
        if type(name) is not str: raise TypeError('Choose a sprite by name or ID.')
        if name in self.items: return self.items[name]
        for sprite in self.items.values():
            if sprite.name == name: return sprite
        raise KeyError(f'Sprite {name!r} is unavailable.')

    def named(self, name):
        for sprite in self.items.values():
            if sprite.name == name: return sprite
        raise KeyError(f'Sprite {name!r} is unavailable.')

    def _create(self, state, *, template=None, data=None, is_clone=False):
        if len(self.items) >= 128: raise RuntimeError('A run supports at most 128 sprites. Destroy unused clones.')
        base = state['name']
        while len(base.encode('utf-16-le', errors='surrogatepass')) > 60: base = base[:-1]
        while True:
            self._serial += 1; identity = f'runtime_{self._serial}'
            name = f'{base} copy {self._serial}'
            if identity not in self.items and not any(s['id'] == identity for s in self.worlds.authored) and all(s.name != name for s in self.items.values()): break
        state.update(id=identity, name=name)
        state.pop('world', None)
        if self.worlds.active: state['world'] = self.worlds.active
        sprite = Sprite(self, state); sprite._runtime_world = True; self.items[identity] = sprite
        sprite.template_id = template or identity; sprite.is_clone = is_clone
        if data is not None: sprite.data = data
        sprite._send()
        if self._behaviors: self._behaviors.created(sprite)
        else: self._pending_clones.append(sprite)
        return sprite

    def create(self, costume):
        if costume not in self.assets: raise ValueError('Choose an available costume.')
        return self._create({'name': 'Sprite', 'x': 0, 'y': 0, 'direction': 0, 'size': 100, 'layer': 0, 'visible': True, 'costume': costume})


class Inputs:
    def __init__(self, clock=None):
        self._clock = clock or time.monotonic; self._timer_started = self._clock()
        self._questions = None
        self._keys = set()
        self.pointer_x = self.pointer_y = 0
        self.pointer_down = self.pointer_inside = False

    def reset(self):
        self._keys.clear()
        self.pointer_down = self.pointer_inside = False

    @property
    def timer(self): return max(0, self._clock() - self._timer_started)

    def reset_timer(self): self._timer_started = self._clock()

    @property
    def answer(self): return self._questions.answer if self._questions else ''

    async def ask(self, text):
        if self._questions is None:
            from _playground_questions import Questions
            self._questions = Questions()
        return await self._questions.ask(text)

    def cancel_questions(self):
        if self._questions: self._questions.cancel_all()

    def reset_session(self):
        self.reset(); self.reset_timer(); self.cancel_questions(); self._questions = None

    def key_down(self, key):
        if type(key) is not str: raise TypeError('A key needs its text name.')
        return key in self._keys


scene = sprites = Scene()
inputs = Inputs()


def receive_input(message):
    value = json.loads(message); events = event_session()
    if events.state != 'running': return False
    kind = value['kind']
    if kind == 'reset': inputs.reset(); return True
    if kind == 'key':
        key = value['key']; down = value['down']; was_down = key in inputs._keys
        if down: inputs._keys.add(key)
        else: inputs._keys.discard(key)
        if down and not was_down: events.receive('key:' + key, {'key': key})
        if not down and was_down: events.receive('release:' + key, {'key': key})
    elif kind == 'pointer':
        was_down = inputs.pointer_down
        inputs.pointer_x, inputs.pointer_y = value['x'], value['y']
        inputs.pointer_down, inputs.pointer_inside = value['down'], value['inside']
        if was_down != inputs.pointer_down:
            events.receive('stage:press' if inputs.pointer_down else 'stage:release', {'x': value['x'], 'y': value['y'], 'inside': value['inside']})
    elif kind == 'click':
        payload = {'x': value['x'], 'y': value['y'], 'sprite': value['sprite']}
        events.receive('stage:click', payload)
        sprite = scene.items.get(value['sprite'])
        if sprite and sprite.visible: events.receive('click:' + sprite.id, payload)
    else: raise ValueError('Unknown stage input.')
    return True
