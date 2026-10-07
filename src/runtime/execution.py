"""Execute a generated module and return structured errors to the browser."""
import json
import traceback
import importlib.util
import linecache
import re
import sys
from contextlib import contextmanager


class _GeneratedModules:
    """A standard import hook over the immutable compilation's source files."""
    def __init__(self, sources):
        self.sources = sources

    def find_spec(self, fullname, path=None, target=None):
        if fullname + '.py' in self.sources:
            return importlib.util.spec_from_loader(fullname, self, origin=fullname + '.py')
        return None

    def create_module(self, spec):
        return None  # Python creates an ordinary module and caches it normally.

    def exec_module(self, module):
        filename = module.__name__ + '.py'
        module.__file__ = filename
        exec(compile(self.sources[filename], filename, 'exec'), module.__dict__)


@contextmanager
def generated_modules(source, files=None):
    files = {} if files is None else files
    if not isinstance(files, dict) or len(files) > 32 or any(
        not isinstance(name, str) or not re.fullmatch(r'_pb_module_[0-9]+\.py', name)
        or not isinstance(code, str) for name, code in files.items()
    ) or sum(len(code.encode('utf-8')) for code in files.values()) > 2_000_000:
        raise ValueError('Invalid generated module files or module limits exceeded')
    loader = _GeneratedModules(files)
    missing = object()
    previous = {name[:-3]: sys.modules.pop(name[:-3], missing) for name in files}
    sources = dict(files, **{'program.py': source})
    old_lines = {name: linecache.cache.get(name, missing) for name in sources}
    for name, code in sources.items():
        linecache.cache[name] = (len(code), None, code.splitlines(True), name)
    sys.meta_path.insert(0, loader)
    try:
        yield
    finally:
        sys.meta_path.remove(loader)
        for name, module in previous.items():
            sys.modules.pop(name, None)
            if module is not missing:
                sys.modules[name] = module
        for name, cached in old_lines.items():
            if cached is missing:
                linecache.cache.pop(name, None)
            else:
                linecache.cache[name] = cached


def error_result(error):
    frames = [
        {"file": frame.filename, "line": frame.lineno, "name": frame.name}
        for frame in traceback.extract_tb(error.__traceback__)
    ]
    if isinstance(error, SyntaxError):
        frames.append({"file": error.filename or "program.py", "line": error.lineno or 1, "name": "<module>"})
    origin = getattr(error, "origin_frames", [])
    details = "".join(traceback.format_exception(type(error), error, error.__traceback__))
    if origin:
        details += "\nEvent queued at:\n" + "".join(f'  {f["file"]}, line {f["line"]}, in {f["name"]}\n' for f in origin)
    return json.dumps({
        "type": "error",
        "message": str(error),
        "exceptionType": type(error).__name__,
        "frames": frames,
        "originFrames": origin,
        "details": details,
    })


def run_program(source, files=None):
    try:
        with generated_modules(source, files):
            try:
                namespace = {"__name__": "__main__"}
                exec(compile(source, "program.py", "exec"), namespace)
                return json.dumps({"type": "done"})
            except BaseException as error:
                return error_result(error)
    except BaseException as error:
        return error_result(error)


async def run_event_program(source, on_ready=lambda: None, files=None):
    from _playground_events import reset_session
    session = reset_session()
    try:
        with generated_modules(source, files):
            try:
                namespace = {"__name__": "__main__"}
                exec(compile(source, "program.py", "exec"), namespace)
                await session.run(on_ready)
                return json.dumps({"type": "done"})
            except BaseException as error:
                return error_result(error)
    except BaseException as error:
        return error_result(error)


def receive_host_event(message):
    from _playground_events import events
    try:
        value = json.loads(message)
        return events.receive(value["name"], value["payload"])
    except BaseException as error:
        events.fail(error)
        return False
