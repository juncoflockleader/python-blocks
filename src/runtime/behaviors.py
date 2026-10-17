"""Instance behavior routing atop the cooperative event session."""
from contextvars import ContextVar
import copy
import inspect
import time

_current = ContextVar('sprite_behavior', default=None)
# Longest a new sprite waits for its created handlers before moving anyway.
STARTING_LIMIT = .25


def current_sprite():
    sprite = _current.get()
    if sprite is None: raise RuntimeError('This sprite is available only inside a sprite behavior.')
    sprite._check()
    return sprite


class Behaviors:
    def __init__(self, scene, events):
        self.scene, self.events = scene, events
        self.contacts = set(); self.tile_contacts = set()
        self.overlap_targets = []
        self.signals = {}
        self.starting = {}
        self.clock_started = False

    def ensure_clock(self):
        if not self.clock_started:
            self.events._service(self.clock); self.clock_started = True

    def register(self, template, event, handler, by_kind=False):
        if self.events.state != 'setup': raise RuntimeError('Register sprite behaviors before the session starts.')
        if not by_kind and not any(s['id'] == template for s in self.scene.worlds.authored): raise ValueError('Choose an authored sprite for this behavior.')
        if not inspect.iscoroutinefunction(handler): raise TypeError('Sprite behaviors must be async handlers.')
        from _playground_events import check_name
        check_name(event, self.events.limits)
        if event.startswith('_pb:'): raise ValueError('This event name is reserved.')
        matches = lambda sprite: sprite.kind == template if by_kind else sprite.template_id == template
        if event in ('update', 'overlap', 'separate', 'collision', 'tile:hit', 'tile:overlap'): self.ensure_clock()
        if event in ('overlap', 'separate'): self.overlap_targets.append(matches)
        self.signals.setdefault(event, []).append(matches)

        def resolve(name, payload):
            targets = []
            if name.startswith('_pb:') and 'epoch' in payload and payload['epoch'] != self.scene.worlds.epoch: return []
            if (name in ('_pb:created', '_pb:collision', '_pb:tile:hit', '_pb:tile:overlap') and event == name[4:]) or (name == '_pb:created' and event == 'clone' and payload.get('clone')):
                sprite = self.scene.items.get(payload['sprite'])
                if sprite and matches(sprite): targets = [sprite]
            elif name == '_pb:tick' and event == 'update':
                targets = [s for s in self.scene.items.values() if matches(s)]
            elif name in ('_pb:overlap', '_pb:separate') and event == name[4:]:
                sprite = self.scene.items.get(payload['sprite'])
                if sprite and matches(sprite): targets = [sprite]
            elif name == 'stage:click' and event == 'click':
                sprite = self.scene.items.get(payload.get('sprite'))
                if sprite and matches(sprite): targets = [sprite]
            elif name == event and event not in ('clone', 'created', 'collision', 'tile:hit', 'tile:overlap', 'update', 'overlap', 'separate', 'click'):
                targets = [s for s in self.scene.items.values() if matches(s) and (event != 'start' or not s.is_clone)]
            result = []
            for sprite in targets:
                async def deliver(value, sprite=sprite, starting=name == '_pb:created'):
                    if not sprite._alive: return
                    if starting: self.started(sprite)
                    token = _current.set(sprite)
                    try: await handler(value)
                    finally: _current.reset(token)
                # Update handlers are at most one invocation per handler/instance.
                key = (id(handler), sprite.id) if event == 'update' else None
                result.append((deliver, copy.deepcopy(payload), sprite.id, key))
            return result
        self.events._route(resolve)

    async def clock(self, _payload):
        previous = time.monotonic()
        while self.events.state == 'running':
            await self.events.wait(1 / 30)
            now = time.monotonic(); dt = min(.25, max(0, now - previous)); previous = now
            pending = []
            def retain(name, payload):
                # Substeps do not run learner handlers. Retain transitions in
                # order, within the same event budget (including the tick).
                if len(pending) + len(self.events._queue) + 1 >= self.events.limits['queuedEvents']:
                    from _playground_events import EventOverloadError
                    raise EventOverloadError('Too many queued contact events. Use fewer overlapping sprites or slower motion.')
                pending.append((name, payload))
            def scan():
                self.scan_tiles(retain); self.scan_contacts(retain)
            if not self.scene._physics or not self.scene._physics.step(dt, scan): scan()
            self.scene.worlds.update_camera()
            self.events._enqueue('_pb:tick', {'dt': dt, 'epoch': self.scene.worlds.epoch})
            for name, payload in pending: self.events._enqueue(name, payload)

    def scan_contacts(self, emit):
        current = set()
        sprites = [s for s in self.scene.items.values() if not self.holding(s)]
        for sprite in sprites:
            if not any(matches(sprite) for matches in self.overlap_targets) or not sprite.visible: continue
            for other in sprites:
                if sprite is other or not other.visible or not sprite.overlaps(other): continue
                if sprite.touching_pixels(other): current.add((sprite.id, other.id))
        for pair in sorted(current - self.contacts): emit('_pb:overlap', {'sprite': pair[0], 'other': pair[1], 'kind': self.scene.items[pair[0]].kind, 'other_kind': self.scene.items[pair[1]].kind, 'epoch': self.scene.worlds.epoch})
        for pair in sorted(self.contacts - current):
            if pair[0] in self.scene.items: emit('_pb:separate', {'sprite': pair[0], 'other': pair[1], 'epoch': self.scene.worlds.epoch})
        self.contacts = current

    def scan_tiles(self, emit=None):
        current = set()
        for sprite in self.scene.items.values():
            if not any(matches(sprite) for matches in self.signals.get('tile:overlap', [])) or self.holding(sprite): continue
            for tile in self.scene.worlds.overlaps(sprite):
                key = (sprite.id, tile['column'], tile['row'], tile['costume'])
                current.add(key)
                if key not in self.tile_contacts: self.signal('tile:overlap', sprite, {'sprite': sprite.id, 'kind': sprite.kind, 'tile': tile, 'world': self.scene.world_id}, emit)
        self.tile_contacts = current

    def signal(self, event, sprite, payload, emit=None):
        if self.events.state in ('setup', 'running') and any(matches(sprite) for matches in self.signals.get(event, [])):
            (emit or self.events._enqueue)('_pb:' + event, {**payload, 'epoch': self.scene.worlds.epoch})

    def created(self, sprite):
        # Setup creations must be retained even before a matching registration.
        if self.events.state in ('setup', 'running'):
            payload = {'sprite': sprite.id, 'source': sprite.template_id, 'kind': sprite.kind, 'clone': sprite.is_clone, 'epoch': self.scene.worlds.epoch}
            # Created handlers usually resize or restyle the new sprite first, so it
            # holds still and stays out of contact checks until they have started.
            handlers = sum(1 for matches in self.signals.get('created', []) if matches(sprite)) + (sum(1 for matches in self.signals.get('clone', []) if matches(sprite)) if sprite.is_clone else 0)
            if handlers: self.starting[sprite.id] = [handlers, self.scene.worlds.epoch, time.monotonic() + STARTING_LIMIT]
            self.events._enqueue('_pb:created', payload)

    def holding(self, sprite):
        entry = self.starting.get(sprite.id)
        if entry is None: return False
        if entry[1] != self.scene.worlds.epoch or time.monotonic() > entry[2]: del self.starting[sprite.id]; return False
        return True

    def started(self, sprite):
        entry = self.starting.get(sprite.id)
        if entry is not None:
            entry[0] -= 1
            if entry[0] <= 0: del self.starting[sprite.id]

    def destroyed(self, sprite, defer_current=False):
        self.starting.pop(sprite._state['id'], None)
        self.events._cancel_owner(sprite._state['id'], defer_current)
