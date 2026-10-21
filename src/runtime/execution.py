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


def _reads_number(frames):
    """Whether the failing line of the program is a read a number block's int(input())."""
    ours = [frame for frame in frames if frame["file"] == "program.py"]
    return bool(ours) and "int(input())" in linecache.getline("program.py", ours[-1]["line"])


def error_result(error):
    frames = [
        {"file": frame.filename, "line": frame.lineno, "name": frame.name}
        for frame in traceback.extract_tb(error.__traceback__)
    ]
    if isinstance(error, SyntaxError):
        frames.append({"file": error.filename or "program.py", "line": error.lineno or 1, "name": "<module>"})
    origin = getattr(error, "origin_frames", [])
    details = "".join(traceback.format_exception(type(error), error, error.__traceback__))
    message = str(error)
    # Read blocks: say what went wrong in the learner's words, not Python's.
    if isinstance(error, EOFError):
        message = "Your program read more lines than its input has. Each read block reads the next line."
    elif isinstance(error, ValueError) and message.startswith("invalid literal for int() with base 10: ") and _reads_number(frames):
        message = f"A read a number block got {message.split(': ', 1)[1]}, which is not a whole number."
    if origin:
        details += "\nEvent queued at:\n" + "".join(f'  {f["file"]}, line {f["line"]}, in {f["name"]}\n' for f in origin)
    return json.dumps({
        "type": "error",
        "message": message,
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
                if '_playground_events' in sys.modules and isinstance(error, sys.modules['_playground_events'].SessionFinished):
                    return json.dumps({'type': 'done'})
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
                from _playground_events import SessionFinished
                if isinstance(error, SessionFinished): return json.dumps({'type': 'done'})
                if session.state == 'setup': session.state = 'closed'   # a later program must not join a session that never ran
                return error_result(error)
    except BaseException as error:
        return error_result(error)


class _Printed:
    """What one test printed, kept in the run and bounded like the page's output."""
    def __init__(self):
        self.parts, self.size = [], 0

    def write(self, text):
        self.size += len(text)
        if self.size > 20_000:
            raise RuntimeError("Too much printed output. Try a smaller repeat count.")
        self.parts.append(text)
        return len(text)

    def flush(self):
        pass

    def getvalue(self):
        return "".join(self.parts)


def check_program(source, files, inputs, report):
    """Run a program once per input (a puzzle's tests), each with its own input and
    printed output, and report each as it finishes so a test that never ends is known."""
    import io
    with generated_modules(source, files):
        try:
            code = compile(source, "program.py", "exec")
        except BaseException as error:
            return error_result(error)
        for index, data in enumerate(inputs):
            printed, saved = _Printed(), sys.stdout
            sys.stdin = io.StringIO(data)
            sys.stdout = printed
            error = None
            try:
                exec(code, {"__name__": "__main__"})
            except BaseException as caught:
                if not ('_playground_events' in sys.modules and isinstance(caught, sys.modules['_playground_events'].SessionFinished)):
                    error = json.loads(error_result(caught))
                    error.pop("type", None); error.pop("details", None); error.pop("originFrames", None)
            finally:
                sys.stdout = saved
            report(json.dumps({"index": index, "output": printed.getvalue(), **({"error": error} if error else {})}))
    return json.dumps({"type": "done"})


async def check_scene(source, files, steps, report, sleep=None):
    """Run an event program with a scripted player (checks.py): taps, keys and waits while the
    game runs, then each expectation reported as it is judged. A game that ends early is judged on its last picture."""
    from _playground_events import reset_session
    from _playground_scene import scene, receive_input
    from _playground_checks import play, finish_after
    session = reset_session() if sleep is None else reset_session(sleep=sleep)
    done = []
    async def player(_payload):
        await play(scene, receive_input, session._sleep, steps, report, done)
        session.finish()
    try:
        with generated_modules(source, files):
            try:
                exec(compile(source, "program.py", "exec"), {"__name__": "__main__"})
                session._service(player)
                await session.run()
            except BaseException as error:
                from _playground_events import SessionFinished
                if not isinstance(error, SessionFinished):
                    if session.state == 'setup': session.state = 'closed'
                    return error_result(error)
            finish_after(scene, steps, report, done)
            return json.dumps({"type": "done"})
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
