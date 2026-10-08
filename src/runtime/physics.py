"""Fixed-step arcade motion with swept rectangles against static solid sprites.

Y increases up. Velocities are pixels/second; accelerations pixels/second².
There are no implicit yields or learner tasks inside a simulation step.
"""
import math

STEP = 1 / 120
EPSILON = 1e-8
NUMBERS = {'vx': (-2000, 2000), 'vy': (-2000, 2000), 'ax': (-10000, 10000), 'ay': (-10000, 10000),
           'dragX': (0, 10000), 'dragY': (0, 10000), 'speedX': (0, 2000), 'speedY': (0, 2000), 'lifetime': (0, 3600)}
ENUMS = {'body': ('off', 'moving', 'wall'), 'response': ('slide', 'stop', 'bounce', 'destroy'),
         'edges': ('none', 'stop', 'bounce', 'destroy'), 'controller': ('none', 'arrows', 'wasd')}


def defaults():
    return dict(body='off', vx=0, vy=0, ax=0, ay=0, dragX=0, dragY=0, response='slide', edges='none',
                controller='none', speedX=120, speedY=120, lifetime=0, autoDestroy=False)


def checked(property, value):
    if property in NUMBERS:
        low, high = NUMBERS[property]
        if type(value) not in (int, float): raise TypeError(property + ' needs a number.')
        if not low <= value <= high or not math.isfinite(value): raise ValueError(f'{property} needs finite numbers from {low} to {high}.')
    elif property in ENUMS:
        if value not in ENUMS[property]: raise ValueError('Choose ' + ', '.join(ENUMS[property]) + ' for ' + property + '.')
    elif property == 'autoDestroy':
        if type(value) is not bool: raise TypeError('Auto destroy needs True or False.')
    else: raise ValueError('Choose a supported motion property.')
    return value


def kind(value):
    if type(value) is not str or not value or value.strip() != value or len(value.encode('utf-16-le', errors='surrogatepass')) > 64 or any(ord(c) < 32 for c in value): raise ValueError('A sprite kind needs 1–32 characters without surrounding spaces or control characters.')
    return value


def swept(x, y, dx, dy, left, right, bottom, top):
    """Point versus expanded obstacle; return earliest time and outward normal."""
    entry, exit, nx, ny = -math.inf, math.inf, 0, 0
    for position, delta, low, high, horizontal in ((x, dx, left, right, True), (y, dy, bottom, top, False)):
        if abs(delta) < EPSILON:
            if position <= low + EPSILON or position >= high - EPSILON: return None
            continue
        a, b = (low - position) / delta, (high - position) / delta
        near, far = min(a, b), max(a, b); normal = -1 if delta > 0 else 1
        if near > entry + EPSILON: entry, nx, ny = near, normal if horizontal else 0, 0 if horizontal else normal
        elif abs(near - entry) <= EPSILON:
            if horizontal: nx = normal
            else: ny = normal
        exit = min(exit, far)
    if entry < -EPSILON or entry > 1 + EPSILON or exit < max(0, entry) - EPSILON: return None
    return max(0, min(1, entry)), nx, ny


class Physics:
    def __init__(self, scene, inputs):
        self.scene, self.inputs = scene, inputs
        self.accumulator = 0
        self.contacts = set()

    def walls(self, sprite, dx=0, dy=0):
        return [s for s in self.scene.items.values() if s is not sprite and s._state['motion']['body'] == 'wall'] + self.scene.worlds.walls(sprite, dx, dy)

    def grounded(self, sprite):
        w, h = sprite._bounds(); bottom = sprite.y - h / 2
        if sprite._state['motion']['edges'] in ('stop', 'bounce') and abs(bottom - (self.scene.worlds.y - 160)) < 1e-6: return True
        return any(abs(bottom - (s.y + s.height / 2)) < 1e-6 and abs(sprite.x - s.x) < (w + s.width) / 2 - EPSILON for s in self.walls(sprite))

    def position(self, sprite, x, y):
        if abs(x) > 1_000_000 or abs(y) > 1_000_000: raise ValueError('Motion left the supported coordinate range.')
        if x != sprite.x or y != sprite.y:
            sprite._trace(sprite.x, sprite.y, x, y); sprite._state.update(x=x, y=y)

    def contact(self, sprite, other, nx, ny, edge, seen):
        key = (sprite.id, other.id if other else None, edge, nx, ny); seen.add(key)
        if key not in self.contacts:
            self.contacts.add(key)
            tile = self.scene.worlds.tile(other.column, other.row) if other and hasattr(other, 'column') else None
            payload = {'sprite': sprite.id, 'other': other.id if other and not tile else None,
                'kind': sprite.kind, 'other_kind': other.kind if other and not tile else None, 'normal_x': nx, 'normal_y': ny, 'edge': edge}
            if tile: payload.update(tile=tile, world=self.scene.world_id)
            self.scene._behaviors.signal('collision', sprite, payload)
            if tile: self.scene._behaviors.signal('tile:hit', sprite, payload)


    def respond(self, sprite, nx, ny, mode):
        m = sprite._state['motion']
        if mode == 'destroy': sprite.destroy(); return
        for key, normal in (('vx', nx), ('vy', ny)):
            if mode == 'stop': m[key] = 0
            elif normal and m[key] * normal < 0: m[key] = -m[key] if mode == 'bounce' else 0

    def move(self, sprite, seconds, seen):
        m = sprite._state['motion']; w, h = sprite._bounds(); rx, ry = w / 2, h / 2
        walls = self.walls(sprite, m['vx'] * seconds, m['vy'] * seconds)
        cx, cy = self.scene.worlds.x, self.scene.worlds.y
        # Resolve initial penetration deterministically before sweeping. Teleports
        # and costume changes may place an actor inside a wall.
        for _ in range(8):
            overlap = next((s for s in walls if abs(sprite.x - s.x) < rx + s.width / 2 - EPSILON and abs(sprite.y - s.y) < ry + s.height / 2 - EPSILON), None)
            if overlap is None: break
            choices = [(overlap.x - overlap.width / 2 - rx - sprite.x, 0, -1, 0), (overlap.x + overlap.width / 2 + rx - sprite.x, 0, 1, 0),
                       (0, overlap.y - overlap.height / 2 - ry - sprite.y, 0, -1), (0, overlap.y + overlap.height / 2 + ry - sprite.y, 0, 1)]
            dx, dy, nx, ny = min(choices, key=lambda v: abs(v[0]) + abs(v[1]))
            self.position(sprite, sprite.x + dx, sprite.y + dy); self.contact(sprite, overlap, nx, ny, None, seen)
            self.respond(sprite, nx, ny, m['response'])
            if not sprite._alive: return
        else:
            # An impossible packed layout has no safe travel path this step.
            m['vx'] = m['vy'] = 0; return
        if m['edges'] != 'none':
            for axis, radius, limit in (('x', rx, 240), ('y', ry, 160)):
                center = cx if axis == 'x' else cy
                value = getattr(sprite, axis) - center; fixed = max(-limit + radius, min(limit - radius, value)) if radius < limit else 0
                if fixed != value:
                    nx = (1 if value < 0 else -1) if axis == 'x' else 0; ny = (1 if value < 0 else -1) if axis == 'y' else 0
                    self.position(sprite, fixed + center if axis == 'x' else sprite.x, fixed + center if axis == 'y' else sprite.y)
                    self.contact(sprite, None, nx, ny, ('left' if nx > 0 else 'right') if nx else ('bottom' if ny > 0 else 'top'), seen)
                    self.respond(sprite, nx, ny, 'slide' if m['edges'] == 'stop' else m['edges'])
                    if not sprite._alive: return
                if radius >= limit: m['vx' if axis == 'x' else 'vy'] = 0
        remaining = seconds
        for _ in range(8):
            dx, dy = m['vx'] * remaining, m['vy'] * remaining
            if abs(dx) + abs(dy) < EPSILON: break
            hits = []
            for wall in self.walls(sprite, dx, dy):
                hit = swept(sprite.x, sprite.y, dx, dy, wall.x - wall.width / 2 - rx, wall.x + wall.width / 2 + rx, wall.y - wall.height / 2 - ry, wall.y + wall.height / 2 + ry)
                if hit: hits.append((*hit, wall, None, m['response']))
            if m['edges'] != 'none':
                for delta, position, extent, radius, nx, ny, edge in ((dx, sprite.x - cx, 240, rx, -1, 0, 'right'), (-dx, cx - sprite.x, 240, rx, 1, 0, 'left'), (dy, sprite.y - cy, 160, ry, 0, -1, 'top'), (-dy, cy - sprite.y, 160, ry, 0, 1, 'bottom')):
                    if delta > EPSILON:
                        when = (extent - radius - position) / delta
                        if -EPSILON <= when <= 1 + EPSILON: hits.append((max(0, min(1, when)), nx, ny, None, edge, m['edges']))
            if not hits: self.position(sprite, sprite.x + dx, sprite.y + dy); break
            time = min(hit[0] for hit in hits)
            self.position(sprite, sprite.x + dx * time, sprite.y + dy * time)
            for _, nx, ny, other, edge, mode in (hit for hit in hits if abs(hit[0] - time) <= EPSILON):
                self.contact(sprite, other, nx, ny, edge, seen); self.respond(sprite, nx, ny, 'slide' if edge and mode == 'stop' else mode)
                if not sprite._alive: return
            remaining *= 1 - time
            if remaining <= EPSILON: break
        # At the bounded impact count, discard remaining travel instead of tunneling.

    def step(self, dt, after_step=None):
        if type(dt) not in (int, float) or not math.isfinite(dt) or dt < 0: raise ValueError('Motion step needs finite nonnegative seconds.')
        self.accumulator += min(.1, dt)
        advanced = False
        snapshots = {s.id: (s.x, s.y, dict(s._state['motion'])) for s in self.scene.items.values()}
        while self.accumulator + EPSILON >= STEP:
            self.accumulator = max(0, self.accumulator - STEP); seen = set()
            for sprite in list(self.scene.items.values()):
                m = sprite._state['motion']
                if m['lifetime'] > 0:
                    m['lifetime'] = max(0, m['lifetime'] - STEP)
                    if m['lifetime'] < EPSILON: sprite.destroy(); continue
                if m['body'] != 'moving': continue
                if m['controller'] != 'none':
                    left, right, up, down = ('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown') if m['controller'] == 'arrows' else ('a', 'd', 'w', 's')
                    if m['speedX']: m['vx'] = m['speedX'] * ((right in self.inputs._keys) - (left in self.inputs._keys))
                    if m['speedY']: m['vy'] = m['speedY'] * ((up in self.inputs._keys) - (down in self.inputs._keys))
                for axis in ('x', 'y'):
                    velocity = max(-2000, min(2000, m['v' + axis] + m['a' + axis] * STEP))
                    m['v' + axis] = math.copysign(max(0, abs(velocity) - m['drag' + axis.upper()] * STEP), velocity)
                self.move(sprite, STEP, seen)
                if sprite._alive and m['autoDestroy'] and (sprite.x - sprite.width / 2 > self.scene.worlds.x + 240 or sprite.x + sprite.width / 2 < self.scene.worlds.x - 240 or sprite.y - sprite.height / 2 > self.scene.worlds.y + 160 or sprite.y + sprite.height / 2 < self.scene.worlds.y - 160): sprite.destroy()
            # Preserve resting contacts as long as their surfaces still touch;
            # otherwise zero velocity would emit duplicate contact events.
            for entry in self.contacts:
                identity, other_id, edge, nx, ny = entry; sprite = self.scene.items.get(identity); other = self.scene.items.get(other_id) or self.scene.worlds.wall(other_id)
                if not sprite: continue
                if other and other._state['motion']['body'] == 'wall':
                    gap = (sprite.x - other.x) * nx - (sprite.width + other.width) / 2 if nx else (sprite.y - other.y) * ny - (sprite.height + other.height) / 2
                    cross = abs(sprite.y - other.y) < (sprite.height + other.height) / 2 - EPSILON if nx else abs(sprite.x - other.x) < (sprite.width + other.width) / 2 - EPSILON
                    if abs(gap) < 1e-6 and cross: seen.add(entry)
                elif edge and sprite._state['motion']['edges'] != 'none':
                    if abs((sprite.x - nx * sprite.width / 2 if nx else sprite.y - ny * sprite.height / 2) - (self.scene.worlds.x - nx * 240 if nx else self.scene.worlds.y - ny * 160)) < 1e-6: seen.add(entry)
            self.contacts = seen
            advanced = True
            if after_step: after_step()
        for sprite in self.scene.items.values():
            if snapshots.get(sprite.id) != (sprite.x, sprite.y, sprite._state['motion']): sprite._send()
        return advanced
