"""Checks a game the way a player would (academy practice): tap sprites, press keys
and wait, then compare what the sprites say and show with what was wanted.

A script is a list of steps: {"tap": "Fox"}, {"key": "Space"}, {"wait": 0.5}, and
{"expect": {...}}, where an expectation names a sprite and one thing about it
("says", "thinks", "costume", "visible", "x", "y", "size") or the game ("score",
"lives", "finished"). Numbers match within 1, or within a [low, high] range.
Each expectation is reported as {"index", "ok", "got"}: the step's index in the
script, whether it held, and what was there instead. The browser's worker runs
this, and so do the tests that prove every academy answer passes and every
starter fails, so both judge a program the same way.
"""
import json


def _sprite(scene, name):
    for sprite in scene.items.values():
        if sprite.name == name and not sprite.is_clone: return sprite
    return None


def observe(scene, expect):
    """What the scene shows for one expectation: the value it is compared with."""
    if 'sprite' in expect:
        sprite = _sprite(scene, expect['sprite'])
        if sprite is None or not sprite._alive: return None
        if 'says' in expect or 'thinks' in expect:
            text, style = sprite._said
            return text if style == ('say' if 'says' in expect else 'think') else ''
        for field in ('costume', 'visible', 'x', 'y', 'size', 'direction'):
            if field in expect: return sprite._state[field]
        return True
    game = scene._game
    if 'finished' in expect:
        result = game.result if game else None
        return None if result is None else ('won' if result.get('won') else 'lost')
    for field in ('score', 'lives'):
        if field in expect: return getattr(game, field) if game else (0 if field == 'score' else 3)
    raise ValueError('An expectation needs a sprite or score, lives or finished.')


def holds(expect, got):
    for field in ('says', 'thinks', 'costume', 'visible', 'finished'):
        if field in expect:
            wanted = expect[field]
            return (got is not None) if wanted == 'any' else got == wanted
    for field in ('x', 'y', 'size', 'direction', 'score', 'lives'):
        if field in expect:
            wanted = expect[field]
            if got is None: return False
            if isinstance(wanted, list): return wanted[0] <= got <= wanted[1]
            return abs(got - wanted) <= 1
    return got is not None


def judge(scene, index, step, report):
    expect = step['expect']
    got = observe(scene, expect)
    report(json.dumps({'index': index, 'ok': holds(expect, got), 'got': got}))


async def play(scene, receive_input, sleep, steps, report, done):
    """Run the script while the game runs; `done` records how far it got, in case the game ends first."""
    await sleep(0.05)
    for index, step in enumerate(steps):
        if 'tap' in step:
            sprite = _sprite(scene, step['tap'])
            if sprite is not None and sprite._alive:
                receive_input(json.dumps({'kind': 'click', 'x': sprite.x, 'y': sprite.y, 'sprite': sprite.id}))
            await sleep(0.05)
        elif 'key' in step:
            receive_input(json.dumps({'kind': 'key', 'key': step['key'], 'down': True}))
            await sleep(step.get('hold', 0.05))
            receive_input(json.dumps({'kind': 'key', 'key': step['key'], 'down': False}))
            await sleep(0.05)
        elif 'wait' in step:
            await sleep(step['wait'])
        elif 'expect' in step:
            judge(scene, index, step, report)
        done.append(index)


def finish_after(scene, steps, report, done):
    """The game ended before the script did: what is left is judged on the last picture."""
    for index in range(len(done), len(steps)):
        if 'expect' in steps[index]: judge(scene, index, steps[index], report)
