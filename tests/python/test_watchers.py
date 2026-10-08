import importlib.util
import json
import sys
import unittest
from unittest.mock import patch
import test_scene


class WatchTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_scene.SceneTests(); self.fixture.setUp()
        self.patch = patch.dict(sys.modules, {'_playground_scene': self.fixture.module}); self.patch.start()
        spec = importlib.util.spec_from_file_location('watch_test', test_scene.ROOT / 'watchers.py')
        self.module = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.module)

    def tearDown(self): self.patch.stop(); self.fixture.tearDown()

    def test_watch_snapshots_track_mutation_missing_keys_grounding_and_destroyed_targets(self):
        player = self.fixture.player
        queries = [dict(id='x',sprite='player',property='x'), dict(id='data',sprite='player',property='data',key='score'), dict(id='ground',sprite='player',property='grounded')]
        values = json.loads(self.module.watch_json(queries)); self.assertEqual(values[0]['text'], '-100'); self.assertEqual(values[1]['state'], 'missing'); self.assertEqual(values[2]['text'], 'False')
        player.data['score'] = [1, 2]; player.set('x', 20)
        values = json.loads(self.module.watch_json(queries)); self.assertEqual(values[0]['text'],'20'); self.assertEqual(values[1]['text'],'[1, 2]')
        player.data['score'].append(None); self.assertIn('None',json.loads(self.module.watch_json(queries))[1]['text'])
        player.destroy(); self.assertTrue(all(v['state'] == 'inactive' for v in json.loads(self.module.watch_json(queries))))

    def test_previews_are_bounded_and_never_call_learner_repr_or_collection_overrides(self):
        class Unsafe:
            def __repr__(self): raise AssertionError('repr must not run')
        class UnsafeList(list):
            def __iter__(self): raise AssertionError('iterator must not run')
        cycle = []; cycle.append(cycle)
        self.assertEqual(self.module.preview(Unsafe()),'<object>'); self.assertEqual(self.module.preview(UnsafeList()),'<object>')
        self.assertLess(len(self.module.preview(cycle)),20); self.assertEqual(self.module.preview(10 ** 4000),'<large integer>')
        player = self.fixture.player; player.data['score'] = ['🙂'*1000]*10000
        result = json.loads(self.module.watch_json([dict(id='w',sprite='player',property='data',key='score')]))[0]
        self.assertLessEqual(len(result['text'].encode('utf-16-le'))//2,240); self.assertEqual(len(player.data['score']),10000)
