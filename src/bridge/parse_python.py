"""Inspect learner source without importing or executing any of it.

The worker installs this module alongside parser-limits.json. Native tests use
the same file. Wire positions are zero-based UTF-16 offsets and columns, with
one-based lines, for direct use by the browser's text selection APIs.
"""
import ast
import io
import json
import re
import sys
import tokenize
import warnings
from pathlib import Path

LIMITS = json.loads(Path(__file__).with_name('parser-limits.json').read_text())
VERSION = 1
PYTHON_VERSION = '.'.join(str(n) for n in sys.version_info[:3])


class ParseLimitError(ValueError):
    pass


def _utf16_length(text):
    return len(text.encode('utf-16-le', errors='surrogatepass')) // 2


class SourcePositions:
    def __init__(self, source):
        pieces = re.split(r'(\r\n|\r|\n)', source)
        self.lines = [pieces[i] + (pieces[i + 1] if i + 1 < len(pieces) else '')
                      for i in range(0, len(pieces), 2)]
        self.starts = []
        offset = 0
        for line in self.lines:
            self.starts.append(offset)
            offset += _utf16_length(line)

    def point(self, line, column, *, byte_column=False):
        line = min(max(line or 1, 1), len(self.lines))
        text = self.lines[line - 1]
        column = max(column or 0, 0)
        prefix = (text.encode('utf-8')[:column].decode('utf-8')
                  if byte_column else text[:column])
        width = _utf16_length(prefix)
        return dict(line=line, column=width, offset=self.starts[line - 1] + width)

    def node(self, node):
        if not hasattr(node, 'lineno'):
            return None
        return dict(start=self.point(node.lineno, node.col_offset, byte_column=True),
                    end=self.point(node.end_lineno, node.end_col_offset, byte_column=True))

    def syntax_error(self, error, *, compiling=False):
        # Parser SyntaxError columns count characters; compilation of an AST
        # reports its UTF-8 columns, since it has no original source text.
        start = self.point(error.lineno, max((error.offset or 1) - 1, 0), byte_column=compiling)
        end = self.point(getattr(error, 'end_lineno', None) or start['line'],
                         max((getattr(error, 'end_offset', None) or error.offset or 1) - 1, 0), byte_column=compiling)
        if end['offset'] < start['offset']:
            end = start.copy()
        return dict(start=start, end=end)


def _literal(value):
    # JSON numbers must never carry Python integers or floating-point literals.
    # Decimal text preserves large ints, signed zero, and infinite literals.
    if value is None:
        return dict(literalType='none')
    if type(value) is bool:
        return dict(literalType='bool', value=value)
    if type(value) is int:
        return dict(literalType='int', text=str(value))
    if type(value) is float:
        return dict(literalType='float', text=repr(value))
    if type(value) is str:
        return dict(literalType='str', text=value)
    if type(value) is bytes:
        return dict(literalType='bytes', text=value.hex())
    if type(value) is complex:
        return dict(literalType='complex', real=repr(value.real), imag=repr(value.imag))
    if value is Ellipsis:
        return dict(literalType='ellipsis')
    raise ValueError('Unrecognized Python literal.')


def parse_source(source, *, limits=None):
    bounds = {**LIMITS, **(limits or {})}
    positions = None
    compiling = False
    try:
        if type(source) is not str:
            raise ValueError('Python source must be text.')
        size = len(source.encode('utf-8'))
        if size > bounds['sourceBytes']:
            raise ParseLimitError('Python source exceeds the 16 MB limit.')
        if len(re.findall(r'\r\n|\r|\n', source)) + 1 > bounds['sourceLines']:
            raise ParseLimitError('Python source has too many lines.')
        positions = SourcePositions(source)
        # CPython treats all three line endings alike. Keep original positions
        # separately so browser offsets still refer to the exact supplied text.
        normalized = source.replace('\r\n', '\n').replace('\r', '\n')
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', SyntaxWarning)
            tree = ast.parse(normalized, filename='program.py', mode='exec')
            count = 0
            pending = [(tree, 0)]
            while pending:
                node, depth = pending.pop()
                count += 1
                if count > bounds['nodes'] or depth > bounds['depth']:
                    raise ParseLimitError('Python syntax is too large or deeply nested to convert.')
                pending.extend((child, depth + 1) for child in ast.iter_child_nodes(node))
            # ast.parse alone accepts return/break/await outside their contexts.
            # Compilation checks those rules but never executes the code object.
            compiling = True
            compile(tree, 'program.py', 'exec', dont_inherit=True)
            compiling = False

        def encode(value):
            if isinstance(value, ast.AST):
                fields = {}
                for key, child in ast.iter_fields(value):
                    fields[key] = _literal(child) if isinstance(value, ast.Constant) and key == 'value' else encode(child)
                result = dict(type=type(value).__name__, fields=fields)
                span = positions.node(value)
                if span is not None:
                    result['span'] = span
                return result
            if isinstance(value, list):
                return [encode(child) for child in value]
            return value

        comments = []
        for token in tokenize.generate_tokens(io.StringIO(normalized).readline):
            if token.type == tokenize.COMMENT:
                if len(comments) >= bounds['comments']:
                    raise ParseLimitError('Python source has too many comments.')
                comments.append(dict(text=token.string, span=dict(
                    start=positions.point(*token.start), end=positions.point(*token.end))))
        return dict(ok=True, version=VERSION, pythonVersion=PYTHON_VERSION,
                    sourceBytes=size, nodeCount=count, tree=encode(tree), comments=comments)
    except SyntaxError as error:
        diagnostic = dict(code='syntax', message=error.msg)
        if positions is not None:
            diagnostic['span'] = positions.syntax_error(error, compiling=compiling)
    except (ParseLimitError, RecursionError, MemoryError) as error:
        diagnostic = dict(code='limit', message=str(error) or 'Python syntax exceeds the parser limits.')
    except (ValueError, UnicodeError, tokenize.TokenError) as error:
        diagnostic = dict(code='invalid-source', message=str(error))
    return dict(ok=False, version=VERSION, pythonVersion=PYTHON_VERSION, diagnostics=[diagnostic])


def parse_source_json(source):
    try:
        result = json.dumps(parse_source(source), ensure_ascii=True, allow_nan=False, separators=(',', ':'))
        if len(result) > LIMITS['resultBytes']:
            raise ParseLimitError('The Python syntax tree exceeds the parser result limit.')
        return result
    except (ParseLimitError, MemoryError, RecursionError) as error:
        return json.dumps(dict(ok=False, version=VERSION, pythonVersion=PYTHON_VERSION,
                               diagnostics=[dict(code='limit', message=str(error) or 'Parser result is too large.')]))
