"""Bounded, read-only previews; never invoke a learner object's repr or getters."""
import json
from itertools import islice


def preview(value, depth=0):
    kind = type(value)
    if value is None: return 'None'
    if kind is bool: return 'True' if value else 'False'
    if kind is int: return str(value) if value.bit_length() < 12000 else '<large integer>'
    if kind is float: return repr(value)
    if kind is str: return value[:80] + ('…' if len(value) > 80 else '')
    if kind in (list, tuple, dict):
        if depth >= 3: return '…'
        if kind is dict:
            parts = [preview(k, depth + 1) + ': ' + preview(v, depth + 1) for k, v in islice(value.items(), 4)]
            left, right = '{', '}'
        else:
            parts = [preview(v, depth + 1) for v in islice(value, 4)]
            left, right = ('[', ']') if kind is list else ('(', ')')
        if len(value) > 4: parts.append('…')
        return left + ', '.join(parts) + right
    return '<object>'


def watch_json(queries):
    from _playground_scene import scene
    values = []
    for query in queries[:12]:
        sprite = scene.items.get(query['sprite']); state = 'value'
        if sprite is None:
            text = 'Sprite not active'; state = 'inactive'
        else:
            key = query['property']
            if key == 'data':
                if type(sprite.data) is not dict: text = '<object>'
                elif query['key'] not in sprite.data: text = 'Key not set'; state = 'missing'
                else: text = preview(sprite.data[query['key']])
            elif key == 'grounded': text = preview(sprite.motion_value('grounded'))
            elif key in ('vx', 'vy'): text = preview(sprite._state['motion'][key])
            else: text = preview(sprite._state.get(key, ''))
        if len(text) > 120: text = text[:119] + '…'
        values.append(dict(id=query['id'], text=text, state=state))
    return json.dumps(values)
