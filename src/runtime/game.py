"""Small game state library; Python owns values and the host presents them."""
import math
import time


class Game:
    def __init__(self, scene, clock=time.monotonic):
        self.scene, self.clock = scene, clock
        self.score, self.lives = 0, 3
        self.visible = dict(score=False, lives=False, level=False, countdown=False)
        self._shown = set()
        self.text = ''
        self.result = None
        self._remaining = None
        self._deadline = None
        self._timer_running = False
        self._service_started = False
        self._displayed = None
        self._expiry = 'lose'
        self._life_rule = 'lose'

    def _events(self):
        from _playground_events import events
        return events

    @property
    def level(self):
        """The active world's place in the project's list (Worlds.level); it follows the world, so it is never set."""
        worlds = getattr(self.scene, 'worlds', None)
        return worlds.level if worlds is not None else 1

    @property
    def seconds(self):
        return max(0, self._deadline - self.clock()) if self._deadline is not None else self._remaining

    def _require_playing(self):
        if self.result is not None or self._events().state not in ('setup', 'running'):
            raise RuntimeError('This game has ended. Use Restart to play again.')

    def _send_hud(self):
        seconds = self.seconds
        self._displayed = None if seconds is None else math.ceil(seconds)
        self.scene._send(dict(type='game', state=dict(score=self.score, lives=self.lives, level=self.level,
            seconds=self._displayed, visible=dict(self.visible), text=self.text, result=self.result)))

    def get(self, field):
        if field not in ('score', 'lives', 'level', 'seconds'): raise ValueError('Choose score, lives, level, or seconds.')
        return getattr(self, field)

    def set(self, field, value):
        self._require_playing()
        if field == 'level': raise ValueError('The level follows the world: use next world or switch to world.')
        if field not in ('score', 'lives'): raise ValueError('Choose score or lives.')
        low, high = (-999_999_999, 999_999_999) if field == 'score' else (0, 999)
        if type(value) is not int: raise TypeError('Score and lives need whole Python integers.')
        if not low <= value <= high: raise ValueError(f'{field.title()} needs a value from {low} to {high}.')
        previous = getattr(self, field)
        setattr(self, field, value)
        if field not in self._shown: self.visible[field] = True; self._shown.add(field)
        self._send_hud()
        if field == 'lives' and previous > 0 and value == 0:
            if self._life_rule == 'lose': self.finish(False, 'No lives left. Try again!')
            else: self._events().emit('game:lives_zero', dict(score=self.score, lives=0))

    def change(self, field, amount):
        self._require_playing()
        if field == 'level': raise ValueError('The level follows the world: use next world or switch to world.')
        if field not in ('score', 'lives'): raise ValueError('Choose score or lives.')
        if type(amount) is not int: raise TypeError('Score and lives changes need whole Python integers.')
        self.set(field, max(0, self.lives + amount) if field == 'lives' else self.score + amount)

    def show(self, field, enabled):
        self._require_playing()
        if field not in self.visible: raise ValueError('Choose score, lives, level, or countdown.')
        if type(enabled) is not bool: raise TypeError('HUD visibility needs True or False.')
        self._shown.add(field); self.visible[field] = enabled; self._send_hud()

    def message(self, text):
        self._require_playing()
        if type(text) is not str or len(text.encode('utf-16-le', errors='surrogatepass')) > 240: raise ValueError('HUD text needs at most 120 characters.')
        self.text = text; self._send_hud()

    def lives_rule(self, action):
        self._require_playing()
        if action not in ('lose', 'event'): raise ValueError('Choose lose or event for zero lives.')
        self._life_rule = action

    def countdown(self, seconds, action='lose'):
        self._require_playing()
        if type(seconds) not in (int, float): raise TypeError('Countdown needs a number of seconds.')
        if not math.isfinite(seconds) or not 0 <= seconds <= 3600: raise ValueError('Countdown needs 0–3600 finite seconds.')
        if action not in ('lose', 'event'): raise ValueError('Choose lose or event when time runs out.')
        self._remaining, self._expiry = seconds, action
        self._deadline = self.clock() + seconds if self._events().state == 'running' else None
        self._timer_running = True
        if 'countdown' not in self._shown: self.visible['countdown'] = True; self._shown.add('countdown')
        self._send_hud()
        if not self._service_started:
            self._events()._add_service(self._run_countdown); self._service_started = True

    def stop_countdown(self):
        self._require_playing()
        self._remaining = self.seconds; self._deadline = None; self._timer_running = False; self._send_hud()

    def _update_countdown(self):
        if not self._timer_running: return
        if self._deadline is None: self._deadline = self.clock() + self._remaining
        if self.seconds <= 0:
            self._remaining = 0; self._deadline = None; self._timer_running = False; self._send_hud()
            if self._expiry == 'lose': self.finish(False, "Time’s up! Try again.")
            else: self._events().emit('game:countdown', dict(score=self.score, lives=self.lives, seconds=0))
        elif math.ceil(self.seconds) != self._displayed: self._send_hud()

    async def _run_countdown(self, _):
        while self._events().state == 'running':
            self._update_countdown()
            await self._events().wait(0.05)

    def finish(self, won, message=''):
        self._require_playing()
        if type(won) is not bool: raise TypeError('Win needs True or False.')
        if type(message) is not str or len(message.encode('utf-16-le', errors='surrogatepass')) > 480: raise ValueError('Game result needs text of at most 240 characters.')
        self._remaining = self.seconds; self._deadline = None; self._timer_running = False
        self.result = dict(won=won, message=message); self._send_hud()
        self._events().finish()

    def effect(self, kind, sprite=None, seconds=1):
        self._require_playing()
        from _playground_scene import Sprite, number
        if kind not in ('confetti', 'sparkles', 'rings'): raise ValueError('Choose confetti, sparkles, or rings.')
        number(seconds, 'Effect seconds', 0.02, 10)
        if sprite is not None:
            if not isinstance(sprite, Sprite) or sprite._owner is not self.scene: raise TypeError('Choose a sprite from this scene or None for the screen.')
            sprite._require_alive()
        self.scene._send(dict(type='game_effect', kind=kind, seconds=seconds,
            at=None if sprite is None else dict(x=sprite.x, y=sprite.y)))

    def clear_effects(self):
        self._require_playing(); self.scene._send(dict(type='game_effect_clear'))
