"""Small drawing API for Python Blocks. The browser provides the host bridge.

Coordinates are centered on the stage: x points right, y points up.
Heading zero points right; positive turns rotate clockwise.
"""

import json
import math
import re

from _playground_host import emit


def _number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"{name} needs a number.")
    if not math.isfinite(value) or abs(value) > 1_000_000:
        raise ValueError(f"{name} must be finite and between -1000000 and 1000000.")
    return value


class Pen:
    def __init__(self):
        self.x = 0
        self.y = 0
        self.heading = 0
        self._color = "#267c70"
        self._drawing = True
        self._commands = 0

    def _send(self, command):
        self._commands += 1
        if self._commands > 10_000:
            raise RuntimeError("This drawing has too many steps. Try a smaller repeat count.")
        emit(json.dumps(command))

    def move(self, steps):
        steps = _number(steps, "Steps")
        radians = math.radians(self.heading)
        next_x = _number(self.x + steps * math.cos(radians), "Position")
        next_y = _number(self.y - steps * math.sin(radians), "Position")
        self._send({"type": "move", "x1": self.x, "y1": self.y,
                    "x2": next_x, "y2": next_y, "draw": self._drawing,
                    "color": self._color})
        self.x, self.y = next_x, next_y

    def turn(self, degrees):
        self.heading = (self.heading + _number(degrees, "Degrees")) % 360
        self._send({"type": "turn", "heading": self.heading})

    def color(self, value):
        if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("Choose a color in #RRGGBB format.")
        self._color = value

    def up(self):
        self._drawing = False

    def down(self):
        self._drawing = True


pen = Pen()


def __getattr__(name):
    if name == 'sounds':
        from _playground_scene import scene
        return scene.sounds
    if name == 'game':
        from _playground_scene import scene
        return scene.game
    if name == "events":
        # Import lazily so the pen library can run without an event host.
        from _playground_events import events
        return events
    if name in ("scene", "sprites", "inputs"):
        import _playground_scene
        return getattr(_playground_scene, name)
    raise AttributeError(name)
