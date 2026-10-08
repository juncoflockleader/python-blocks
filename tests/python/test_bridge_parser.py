import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('bridge_parser', ROOT / 'src/bridge/parse_python.py')
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)


def nodes(tree):
    if isinstance(tree, dict):
        if 'type' in tree and 'fields' in tree:
            yield tree
        for value in tree.values():
            yield from nodes(value)
    elif isinstance(tree, list):
        for value in tree:
            yield from nodes(value)


class BridgeParserTests(unittest.TestCase):
    def parse(self, text):
        result = json.loads(parser.parse_source_json(text))
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['version'], 1)
        self.assertEqual(result['nodeCount'], len(list(nodes(result['tree']))))
        return result

    def test_parsing_and_compilation_do_not_execute_statements_imports_or_decorators(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'must-not-exist'
            source = f'''import a_module_that_does_not_exist
open({str(target)!r}, 'w').write('executed')
@missing_decorator()
def decorated(value=missing_default()):
    raise Exception('not executed')
while True:
    pass
'''
            self.parse(source)
            self.assertFalse(target.exists())

    def test_literals_keep_big_integer_precision_float_identity_and_unsupported_types(self):
        result = self.parse('values = [900719925474099312345678901234567890, 1.0, -0.0, 1e999, "雪🙂", True, None, b"ab", 2j, ...]\n')
        values = [node['fields']['value'] for node in nodes(result['tree']) if node['type'] == 'Constant']
        self.assertEqual(values, [dict(literalType='int', text='900719925474099312345678901234567890'),
            dict(literalType='float', text='1.0'), dict(literalType='float', text='0.0'),
            dict(literalType='float', text='inf'), dict(literalType='str', text='雪🙂'),
            dict(literalType='bool', value=True), dict(literalType='none'),
            dict(literalType='bytes', text='6162'), dict(literalType='complex', real='0.0', imag='2.0'),
            dict(literalType='ellipsis')])
        self.assertEqual([node['type'] for node in nodes(result['tree'])].count('USub'), 1)

    def test_ast_and_comment_positions_select_exact_unicode_in_original_line_endings(self):
        for newline in ['\n', '\r\n', '\r']:
            source = f'# intro{newline}雪 = "🙂"; print(雪) # tail🙂{newline}'
            result = self.parse(source)
            encoded = source.encode('utf-16-le')
            def selected(span):
                return encoded[span['start']['offset'] * 2:span['end']['offset'] * 2].decode('utf-16-le')
            call = next(n for n in nodes(result['tree']) if n['type'] == 'Call')
            self.assertEqual(selected(call['span']), 'print(雪)')
            self.assertEqual(call['span']['start']['column'], 10)
            self.assertEqual(call['span']['start']['line'], 2)
            for comment in result['comments']:
                self.assertEqual(selected(comment['span']), comment['text'])
            self.assertEqual(result['comments'][-1]['text'], '# tail🙂')

    def test_unicode_line_separator_inside_a_string_does_not_shift_python_line_numbers(self):
        source = 'text = "a\u2028b"\nprint(text)\n'
        result = self.parse(source)
        call = next(n for n in nodes(result['tree']) if n['type'] == 'Call')
        self.assertEqual(call['span']['start']['line'], 2)
        self.assertEqual(call['span']['start']['offset'], len('text = "a\u2028b"\n'))

    def test_syntax_and_context_errors_have_browser_positions_and_are_recoverable(self):
        for source in ['if True\n    pass', 'return 1', 'break', 'await something()', 'def f(x, x):\n    pass', 'def f():\n    x = 1\n    global x']:
            result = parser.parse_source(source)
            self.assertFalse(result['ok'], source)
            diagnostic = result['diagnostics'][0]
            self.assertEqual(diagnostic['code'], 'syntax')
            self.assertGreater(len(diagnostic['message']), 0)
            self.assertGreaterEqual(diagnostic['span']['start']['line'], 1)
            self.assertLessEqual(diagnostic['span']['end']['offset'], len(source))
        self.parse('if True:\n    print(7)\n')
        source = '雪="🙂"; return 1'
        result = parser.parse_source(source)
        self.assertEqual(result['diagnostics'][0]['span']['start']['offset'], 8)

    def test_comments_and_multiline_string_contents_are_not_confused(self):
        result = self.parse('value = """# not a comment\n雪""" # actual\n# trailing\n')
        self.assertEqual([c['text'] for c in result['comments']], ['# actual', '# trailing'])
        self.assertEqual(next(n for n in nodes(result['tree']) if n['type'] == 'Constant')['fields']['value']['text'], '# not a comment\n雪')

    def test_source_node_depth_and_comment_budgets_fail_without_partial_trees(self):
        cases = [('x=1', dict(sourceBytes=2)), ('\n\n', dict(sourceLines=2)),
                 ('x=1+2', dict(nodes=3)), ('x=1+2', dict(depth=1)), ('# a\n# b', dict(comments=1))]
        for source, limits in cases:
            result = parser.parse_source(source, limits=limits)
            self.assertFalse(result['ok'], (source, limits))
            self.assertEqual(result['diagnostics'][0]['code'], 'limit')
            self.assertNotIn('tree', result)
        self.parse('')

    def test_invalid_input_and_unpaired_surrogates_produce_data_not_exceptions(self):
        for source in [None, 123, '\ud800', 'x = \x00']:
            result = json.loads(parser.parse_source_json(source))
            self.assertFalse(result['ok'])
            self.assertIn(result['diagnostics'][0]['code'], ['invalid-source', 'syntax'])
        self.parse('value = "\\ud800"')

    def test_tree_exposes_async_functions_lambdas_and_ordered_event_registration(self):
        result = self.parse('''from playground import events
async def tick(payload):
    await events.wait(0.1)
    return (lambda value: value + 1)(payload)
events.on("tick", tick)
''')
        body = result['tree']['fields']['body']
        self.assertEqual([n['type'] for n in body], ['ImportFrom', 'AsyncFunctionDef', 'Expr'])
        self.assertIn('Await', [n['type'] for n in nodes(body[1])])
        self.assertIn('Lambda', [n['type'] for n in nodes(body[1])])


if __name__ == '__main__':
    unittest.main()
