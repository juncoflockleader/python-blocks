import json
import unittest

from scene_check import check

HEADER = 'from playground import scene as _pb_scene\n_pb_scene.load("scene.json")\nfrom playground import sprites as _pb_sprites\nfrom playground import game\n'


def scene():
    def sprite(id, name, x, costume, costumes):
        return dict(id=id, name=name, x=x, y=0, direction=0, size=100, layer=0, visible=True, costume=costume, costumes=costumes)
    return dict(version=1, background='#fdfdf9', assets=[{'id': 'fox-a', 'width': 40, 'height': 40}, {'id': 'fox-b', 'width': 40, 'height': 40}],
                sprites=[sprite('fox', 'Fox', -100, 'fox-a', ['fox-a', 'fox-b']), sprite('robot', 'Robot', 100, 'box', ['box'])])


TALKS = HEADER + '''
async def on_fox_click(payload):
    await (_pb_sprites.named("Fox")).say_for("Hello!", 2)

async def on_space(payload):
    (_pb_sprites.named("Fox")).next_costume()
    game.change("score", 1)

_pb_scene.on("fox", "click", on_fox_click)
_pb_scene.on("fox", "key:Space", on_space)
'''


class SceneCheckTests(unittest.TestCase):
    def test_taps_keys_and_waits_are_judged_like_a_player_sees_them(self):
        steps = [
            {'expect': {'sprite': 'Fox', 'says': ''}},
            {'tap': 'Fox'}, {'wait': 0.5},
            {'expect': {'sprite': 'Fox', 'says': 'Hello!'}},
            {'expect': {'sprite': 'Robot', 'says': ''}},
            {'wait': 2},
            {'expect': {'sprite': 'Fox', 'says': ''}},   # said for 2 seconds, then the bubble went
            {'key': 'Space'},
            {'expect': {'sprite': 'Fox', 'costume': 'fox-b'}},
            {'expect': {'score': 1}},
            {'expect': {'sprite': 'Fox', 'x': [-110, -90]}},
        ]
        result, reports = check(TALKS, scene(), steps)
        self.assertEqual(result['type'], 'done')
        self.assertEqual([r['index'] for r in reports], [0, 3, 4, 6, 8, 9, 10])
        self.assertTrue(all(r['ok'] for r in reports), reports)

    def test_a_wrong_program_fails_and_says_what_was_there(self):
        wrong = TALKS.replace('_pb_scene.on("fox", "click"', '_pb_scene.on("robot", "click"').replace('"Hello!"', '"Hi"')
        result, reports = check(wrong, scene(), [{'tap': 'Fox'}, {'wait': 0.3}, {'expect': {'sprite': 'Fox', 'says': 'Hello!'}}, {'tap': 'Robot'}, {'wait': 0.3}, {'expect': {'sprite': 'Fox', 'says': 'Hello!'}}])
        self.assertEqual(result['type'], 'done')
        self.assertEqual([(r['ok'], r['got']) for r in reports], [(False, ''), (False, 'Hi')])

    def test_a_game_that_ends_is_judged_on_its_last_picture_and_errors_are_reported(self):
        ends = HEADER + '''
async def on_space(payload):
    game.finish(True, "You win!")

_pb_scene.on("fox", "key:Space", on_space)
'''
        result, reports = check(ends, scene(), [{'key': 'Space'}, {'wait': 1}, {'tap': 'Fox'}, {'expect': {'finished': 'won'}}, {'expect': {'sprite': 'Fox', 'says': ''}}])
        self.assertEqual(result['type'], 'done')
        self.assertEqual([(r['index'], r['ok']) for r in reports], [(3, True), (4, True)])
        broken = HEADER + 'async def on_fox_click(payload):\n    raise ValueError("oops")\n_pb_scene.on("fox", "click", on_fox_click)\n'
        result, reports = check(broken, scene(), [{'tap': 'Fox'}, {'wait': 0.2}, {'expect': {'sprite': 'Fox', 'says': 'x'}}])
        self.assertEqual(result['type'], 'error'); self.assertEqual(result['message'], 'oops')


if __name__ == '__main__':
    unittest.main()
