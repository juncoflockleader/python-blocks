"""Scene-owned sounds. Completion comes from Web Audio, never a guessed timer."""
import asyncio
import json
import math
import traceback

INSTRUMENTS = ('sine', 'triangle', 'square', 'sawtooth', 'kick', 'snare', 'hat')
BOUNDS = {'volume': (0, 100), 'pitch': (-24, 24), 'pan': (-100, 100)}


def number(value, low, high, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f'{name} needs a number.')
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name} must be between {low} and {high}.')
    return value


class Sounds:
    def __init__(self, scene):
        self.scene = scene
        self.assets = set(scene._sound_assets)
        self.channels = {}; self.active = {}; self.serial = 0; self.commands = 0
        self.tempo = 120

    def _owner(self, owner):
        if owner is None: return '$stage'
        from _playground_scene import Sprite
        if not isinstance(owner, Sprite) or owner._owner is not self.scene:
            raise TypeError('Sound owner must be a sprite from this scene, or None for the stage.')
        owner._check()
        return owner.id

    def _settings(self, owner):
        return dict(self.channels.get(owner, {'volume': 100, 'pitch': 0, 'pan': 0}))

    def _send(self, command, cleanup=False):
        from _playground_host import audio_emit
        from _playground_scene import event_session
        if not cleanup and event_session().state not in ('setup', 'running'):
            raise RuntimeError('Sounds need an active event session.')
        if not cleanup and self.commands >= 20_000: raise RuntimeError('This run exceeded 20,000 sound changes. Stop and run again.')
        audio_emit(json.dumps(command)); self.commands += 1

    def _start(self, command, owner):
        owner_id = self._owner(owner)
        if len(self.active) >= 32: raise RuntimeError('Too many overlapping sounds (limit 32). Wait or stop sounds before starting more.')
        identity = self.serial + 1
        origin = [{'file': f.filename, 'line': f.lineno, 'name': f.name} for f in traceback.extract_stack()[:-1]]
        self._send(dict(command, id=identity, owner=owner_id, settings=self._settings(owner_id)))
        self.serial = identity; self.active[identity] = {'owner': owner_id, 'waiter': None, 'origin': origin}
        return identity

    def play(self, sound, owner=None):
        if not isinstance(sound, str) or sound not in self.assets: raise ValueError('This sound is unavailable. Choose a sound from Sounds & music.')
        return self._start({'type': 'play', 'sound': sound}, owner)

    async def play_wait(self, sound, owner=None):
        return await self._wait(self.play(sound, owner))

    async def _wait(self, identity):
        future = asyncio.get_running_loop().create_future()
        self.active[identity]['waiter'] = future
        try:
            error = await future
            if error: raise RuntimeError(error)
        finally:
            if self.active.pop(identity, None) is not None:
                self._send({'type': 'cancel', 'id': identity}, cleanup=True)

    def receive(self, identity, error=None):
        item = self.active.pop(identity, None)
        if item is None: return False
        future = item['waiter']
        if future is not None:
            if not future.done(): future.set_result(error)
        elif error:
            from _playground_events import events
            failure = RuntimeError(error); failure.origin_frames = item['origin']; events.fail(failure)
        return True

    def stop(self, owner=None):
        """Stop one owner's playback. None means the stage channel."""
        self._stop(self._owner(owner))

    def stop_all(self): self._stop(None)

    def _stop(self, owner, cleanup=False):
        self._send({'type': 'stop', 'owner': owner}, cleanup=cleanup)
        for identity, item in list(self.active.items()):
            if owner is None or item['owner'] == owner: self.receive(identity)

    def _destroy(self, owner):
        self._stop(owner, cleanup=True); self.channels.pop(owner, None)

    def _clone(self, original, clone):
        if original in self.channels: self.channels[clone] = self._settings(original)

    def set(self, field, value, owner=None):
        if field not in BOUNDS: raise ValueError('Choose volume, pitch or pan.')
        value = number(value, *BOUNDS[field], field.capitalize())
        identity = self._owner(owner); settings = self._settings(identity); settings[field] = value
        self._send({'type': 'settings', 'owner': identity, 'settings': settings}); self.channels[identity] = settings

    def change(self, field, amount, owner=None):
        if field not in BOUNDS: raise ValueError('Choose volume, pitch or pan.')
        amount = number(amount, -1000, 1000, 'Sound change')
        lo, hi = BOUNDS[field]; self.set(field, max(lo, min(hi, self.get(field, owner) + amount)), owner)

    def get(self, field, owner=None):
        if field not in BOUNDS: raise ValueError('Choose volume, pitch or pan.')
        return self._settings(self._owner(owner))[field]

    def clear_effects(self, owner=None):
        identity = self._owner(owner); settings = self._settings(identity); settings.update(pitch=0, pan=0)
        self._send({'type': 'settings', 'owner': identity, 'settings': settings}); self.channels[identity] = settings

    def set_tempo(self, bpm): self.tempo = number(bpm, 30, 300, 'Tempo')

    async def note(self, pitch, beats=1, instrument='triangle', owner=None):
        pitch = number(pitch, 21, 108, 'Note')
        if int(pitch) != pitch: raise ValueError('Use a whole MIDI note number, from 21 (A0) to 108 (C8).')
        beats = number(beats, .0625, 16, 'Beats')
        if instrument not in INSTRUMENTS: raise ValueError('Choose an available instrument.')
        await self._wait(self._start({'type': 'tone', 'pitch': pitch, 'seconds': beats * 60 / self.tempo, 'instrument': instrument}, owner))

    async def rest(self, beats=1):
        from _playground_scene import event_session
        await event_session().wait(number(beats, .0625, 16, 'Beats') * 60 / self.tempo)


def receive_audio(identity, error=None):
    from _playground_scene import scene
    return scene._sounds is not None and scene._sounds.receive(identity, error)
