"""Tile worlds, scene transitions and camera state. Coordinates use x right/y up."""
import copy
import math


def coordinate(value):
    if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 999000: raise ValueError('Camera coordinates need finite numbers from -999000 to 999000.')
    return value


class TileWall:
    def __init__(self, column, row, size):
        self.id = f'tile:{column}:{row}'; self.kind = 'tile'
        self.column, self.row = column, row
        self.width = self.height = size
        self.x, self.y = -240 + (column + .5) * size, 160 - (row + .5) * size
        self._state = {'motion': {'body': 'wall'}}


class Worlds:
    def __init__(self, scene):
        self.scene = scene; self.definitions = {}; self.active = None; self.map = None
        self.camera = dict(x=0, y=0, follow=None, clamp=True); self.x = self.y = 0
        self.epoch = 0; self.authored = []; self.base = {}

    def configure(self, data):
        self.definitions = {w['id']: copy.deepcopy(w) for w in data.get('worlds', [])}
        self.authored = copy.deepcopy(data['sprites']); self.base = copy.deepcopy(data)
        self.active = data.get('world'); self.epoch = 0
        self.load_map()

    def load_map(self):
        world = self.definitions.get(self.active)
        self.map = copy.deepcopy(world['map']) if world else None
        self.camera = copy.deepcopy((world or self.base).get('camera', dict(x=0, y=0, follow=None, clamp=True)))
        self._follow_seen = False
        self.scene._send({'type': 'world', 'id': self.active})
        self.scene.background((world or self.base)['background'])
        self.scene.backdrop_id = (world or self.base).get('backdrop')
        self.scene._send({'type': 'backdrop', 'id': self.scene.backdrop_id})

    def switch(self, identity, restart=False):
        if identity is not None and (type(identity) is not str or identity not in self.definitions): raise ValueError('Choose an available world or None for the base stage.')
        if type(restart) is not bool: raise TypeError('Restart needs True or False.')
        if identity == self.active and not restart: return
        from _playground_behaviors import _current
        caller = _current.get()
        previous = self.active; self.epoch += 1; self.active = identity
        for sprite in list(self.scene.items.values()):
            if sprite._state.get('world') is not None or sprite._runtime_world: sprite.destroy(_defer_cancel=True)
        self.scene._pending_clones = [s for s in self.scene._pending_clones if s._alive]
        if self.scene._physics: self.scene._physics.contacts.clear()
        if self.scene._behaviors: self.scene._behaviors.contacts.clear(); self.scene._behaviors.tile_contacts.clear()
        self.scene.clear_pen(); self.load_map()
        from _playground_scene import Sprite
        for state in self.authored:
            if state.get('world') is not None and state['world'] == identity:
                sprite = Sprite(self.scene, state); self.scene.items[sprite.id] = sprite; sprite._send()
                if self.scene._behaviors: self.scene._behaviors.created(sprite)
                else: self.scene._pending_clones.append(sprite)
        self.update_camera()
        if any(s._state['motion']['body'] != 'off' or s._state['motion']['lifetime'] > 0 for s in self.scene.items.values()): self.scene.enable_motion()
        self.enter(previous)
        if caller is not None and not caller._alive:
            import asyncio
            raise asyncio.CancelledError()

    def enter(self, previous=None):
        import sys
        module = sys.modules.get('_playground_events')
        if module and module.events.state in ('setup', 'running'):
            payload = {'world': self.active, 'name': self.name, 'previous': previous}
            module.events.emit('world:enter', payload)
            if self.active: module.events.emit('world:' + self.active, payload)

    @property
    def name(self): return self.definitions[self.active]['name'] if self.active else 'Base stage'

    def view(self): return self.x - 240, self.x + 240, self.y - 160, self.y + 160

    def update_camera(self):
        target = self.scene.items.get(self.camera.get('follow'))
        x, y = (target.x, target.y) if target else (self.x, self.y) if self.camera.get('follow') and getattr(self, '_follow_seen', False) else (self.camera['x'], self.camera['y'])
        if target: self._follow_seen = True
        if self.camera['clamp'] and self.map:
            width, height = self.map['columns'] * self.map['tileSize'], self.map['rows'] * self.map['tileSize']
            x = (width - 480) / 2 if width < 480 else max(0, min(width - 480, x))
            y = (320 - height) / 2 if height < 320 else max(320 - height, min(0, y))
        x, y = max(-999000, min(999000, x)), max(-999000, min(999000, y))
        if (x, y) != (self.x, self.y):
            from _playground_scene import inputs
            inputs.pointer_x += x - self.x; inputs.pointer_y += y - self.y
        self.x, self.y = x, y
        if getattr(self, '_sent', None) != (x, y):
            self._sent = (x, y); self.scene._send({'type': 'camera', 'x': x, 'y': y})

    def move_camera(self, x, y):
        x, y = coordinate(x), coordinate(y)
        self.camera.update(x=x, y=y, follow=None); self.update_camera()

    def follow(self, sprite):
        if sprite is not None:
            from _playground_scene import Sprite
            if not isinstance(sprite, Sprite) or sprite._owner is not self.scene: raise TypeError('Camera follow needs a sprite from this scene, or None.')
            sprite._check(); self.scene._ensure_behaviors().ensure_clock()
        self.camera.update(follow=sprite.id if sprite else None, x=self.x, y=self.y); self.update_camera()

    def clamp(self, enabled):
        if type(enabled) is not bool: raise TypeError('Camera clamp needs True or False.')
        self.camera['clamp'] = enabled; self.update_camera()

    def cell(self, column, row):
        if not self.map: raise RuntimeError('Choose a world with a tilemap first.')
        if type(column) is not int or type(row) is not int: raise TypeError('Tile column and row need whole numbers.')
        if not 0 <= column < self.map['columns'] or not 0 <= row < self.map['rows']: raise IndexError('That tile is outside this world.')
        return row * self.map['columns'] + column

    def tile(self, column, row):
        index = self.cell(column, row); size = self.map['tileSize']
        return {'column': column, 'row': row, 'costume': self.map['tiles'][index], 'solid': self.map['walls'][index], 'x': -240 + (column + .5) * size, 'y': 160 - (row + .5) * size}

    def at(self, x, y):
        from _playground_scene import number
        x, y = number(x, 'x'), number(y, 'y')
        if not self.map: return None
        c, r = math.floor((x + 240) / self.map['tileSize']), math.floor((160 - y) / self.map['tileSize'])
        return self.tile(c, r) if 0 <= c < self.map['columns'] and 0 <= r < self.map['rows'] else None

    def set_tile(self, column, row, costume, solid=False):
        index = self.cell(column, row)
        if costume is not None and (type(costume) is not str or costume not in self.scene.assets): raise ValueError('A tile needs an available costume or None.')
        if type(solid) is not bool: raise TypeError('Tile solid needs True or False.')
        self.map['tiles'][index] = costume; self.map['walls'][index] = solid
        self.scene._send({'type': 'tile', 'column': column, 'row': row, 'costume': costume, 'solid': solid})

    def set_wall(self, column, row, solid): self.set_tile(column, row, self.tile(column, row)['costume'], solid)

    def of_costume(self, costume):
        if not self.map: return []
        if costume is not None and (type(costume) is not str or costume not in self.scene.assets): raise ValueError('Choose an available tile costume or None.')
        return [self.tile(i % self.map['columns'], i // self.map['columns']) for i, value in enumerate(self.map['tiles']) if value == costume]

    def place(self, sprite, column, row):
        from _playground_scene import Sprite
        if not isinstance(sprite, Sprite) or sprite._owner is not self.scene: raise TypeError('Place needs a sprite from this scene.')
        tile = self.tile(column, row); sprite.go_to(tile['x'], tile['y'])

    def cells(self, sprite, dx=0, dy=0):
        if not self.map: return []
        size = self.map['tileSize']; w, h = sprite._bounds()
        left = min(sprite.x, sprite.x + dx) - w / 2; right = max(sprite.x, sprite.x + dx) + w / 2
        bottom = min(sprite.y, sprite.y + dy) - h / 2; top = max(sprite.y, sprite.y + dy) + h / 2
        # Include exact shared surfaces for grounding and swept collision.
        c0, c1 = max(0, math.floor((left + 240 - 1e-7) / size)), min(self.map['columns'] - 1, math.floor((right + 240 + 1e-7) / size))
        r0, r1 = max(0, math.floor((160 - top - 1e-7) / size)), min(self.map['rows'] - 1, math.floor((160 - bottom + 1e-7) / size))
        return [(c, r) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]

    def walls(self, sprite, dx=0, dy=0):
        return [TileWall(c, r, self.map['tileSize']) for c, r in self.cells(sprite, dx, dy) if self.map['walls'][r * self.map['columns'] + c]]

    def wall(self, identity):
        if not self.map or not identity or not identity.startswith('tile:'): return None
        _, c, r = identity.split(':'); c, r = int(c), int(r)
        return TileWall(c, r, self.map['tileSize']) if 0 <= c < self.map['columns'] and 0 <= r < self.map['rows'] and self.map['walls'][r * self.map['columns'] + c] else None

    def overlaps(self, sprite):
        if not sprite.visible: return []
        w, h = sprite._bounds(); size = self.map['tileSize'] if self.map else 0
        result = []
        for c, r in self.cells(sprite):
            tile = self.tile(c, r)
            if tile['costume'] is not None and abs(sprite.x - tile['x']) < (w + size) / 2 - 1e-8 and abs(sprite.y - tile['y']) < (h + size) / 2 - 1e-8: result.append(tile)
        return result
