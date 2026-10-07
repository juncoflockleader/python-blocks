import asyncio
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("events", Path(__file__).parents[2] / "src/runtime/events.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


async def until(predicate):
    for _ in range(100):
        if predicate():
            return
        await asyncio.sleep(0)
    raise AssertionError("The expected scheduler state was not reached.")


class Clock:
    def __init__(self):
        self.now = 0
        self.pending = []

    async def sleep(self, seconds):
        if seconds == 0:
            await asyncio.sleep(0)
            return
        future = asyncio.get_running_loop().create_future()
        self.pending.append((self.now + seconds, future))
        await future

    def advance(self, seconds):
        self.now += seconds
        for deadline, future in self.pending:
            if deadline <= self.now and not future.done():
                future.set_result(None)
        self.pending = [(deadline, future) for deadline, future in self.pending if not future.done()]


class EventTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.running = []

    async def asyncTearDown(self):
        for task in self.running:
            task.cancel()
        await asyncio.gather(*self.running, return_exceptions=True)

    def start(self, session):
        task = asyncio.create_task(session.run())
        self.running.append(task)
        return task

    async def test_registration_order_waits_and_independent_progress_with_fake_clock(self):
        clock = Clock()
        session = runtime.EventSession(sleep=clock.sleep)
        output = []

        async def first(payload):
            output.append("first starts")
            await session.wait(2)
            output.append("first ends")

        async def second(payload):
            output.append("second starts")
            await session.wait(1)
            output.append("second ends")

        session.on("start", first)
        session.on("start", second)
        task = self.start(session)
        await until(lambda: len(output) == 2)
        self.assertEqual(output, ["first starts", "second starts"])
        clock.advance(1)
        await until(lambda: len(output) == 3)
        self.assertEqual(output[-1], "second ends")
        clock.advance(1)
        await until(lambda: len(output) == 4)
        self.assertEqual(output[-1], "first ends")
        self.assertFalse(task.done(), "An idle event session must stay alive.")
        self.assertEqual(session.state, "running")

    async def test_emit_is_fifo_and_does_not_yield_and_payloads_are_snapshots_per_receiver(self):
        session = runtime.EventSession()
        output = []

        async def sender(payload):
            value = {"items": [1]}
            session.emit("message", value)
            value["items"].append(99)
            session.emit("message", {"items": [2]})
            output.append("sender finished")

        async def first(payload):
            output.append(("first", payload["items"][:]))
            payload["items"].append(7)
            await session.wait(0)
            output.append("first resumed")

        async def second(payload):
            output.append(("second", payload["items"][:]))

        session.on("start", sender)
        session.on("message", first)
        session.on("message", second)
        self.start(session)
        await until(lambda: len(output) == 7)
        self.assertEqual(output, ["sender finished", ("first", [1]), ("second", [1]), ("first", [2]), ("second", [2]), "first resumed", "first resumed"])

    async def test_repeated_deliveries_have_independent_locals_and_shared_project_state(self):
        session = runtime.EventSession()
        output = []
        shared = 0

        async def receiver(payload):
            nonlocal shared
            local = payload
            shared += 1
            await session.wait(0)
            output.append((local, shared))

        session.on("tick", receiver)
        session.emit("tick", 1)
        session.emit("tick", 2)
        self.start(session)
        await until(lambda: len(output) == 2)
        self.assertEqual(output, [(1, 2), (2, 2)])

    async def test_startup_emissions_start_and_host_input_keep_queue_order(self):
        session = runtime.EventSession()
        output = []

        async def receiver(payload):
            output.append(payload)

        session.emit("message", "startup")
        session.on("message", receiver)
        session.on("start", receiver)
        task = asyncio.create_task(session.run(lambda: session.receive("message", "host")))
        self.running.append(task)
        await until(lambda: len(output) == 3)
        self.assertEqual(output, ["startup", None, "host"])

    async def test_zero_wait_yields_to_another_handler(self):
        session = runtime.EventSession()
        output = []

        async def first(payload):
            output.append(1)
            await session.wait(0)
            output.append(3)

        async def second(payload):
            output.append(2)

        session.on("start", first)
        session.on("start", second)
        self.start(session)
        await until(lambda: len(output) == 3)
        self.assertEqual(output, [1, 2, 3])

    async def test_handler_failure_cancels_peers_and_preserves_original_exception(self):
        session = runtime.EventSession()
        cancelled = []

        async def waiting(payload):
            try:
                await session.wait(86400)
                self.fail("Cancelled handler resumed normally.")
            finally:
                cancelled.append(True)

        async def broken(payload):
            raise KeyError("missing")

        session.on("start", waiting)
        session.on("start", broken)
        with self.assertRaisesRegex(KeyError, "missing"):
            await self.start(session)
        self.assertEqual(cancelled, [True])
        self.assertEqual(session.state, "closed")
        self.assertFalse(session.receive("message", None))

    async def test_system_exit_is_a_session_failure(self):
        session = runtime.EventSession()

        async def broken(payload):
            raise SystemExit(4)

        session.on("start", broken)
        with self.assertRaises(SystemExit):
            await session.run()

    async def test_unexpected_handler_cancellation_ends_the_session(self):
        session = runtime.EventSession()

        async def broken(payload):
            raise asyncio.CancelledError()

        session.on("start", broken)
        with self.assertRaises(asyncio.CancelledError):
            await session.run()
        self.assertEqual(session.state, "closed")

    async def test_active_task_overload_fails_before_partial_delivery_of_an_event(self):
        session = runtime.EventSession(limits={"activeTasks": 1})
        output = []

        async def receiver(payload):
            output.append(payload)

        session.on("start", receiver)
        session.on("start", receiver)
        with self.assertRaisesRegex(runtime.EventOverloadError, "active handlers"):
            await self.start(session)
        self.assertEqual(output, [])

    async def test_queue_overload_from_handler_fails_session(self):
        session = runtime.EventSession(limits={"queuedEvents": 2})

        async def flood(payload):
            for _ in range(3):
                session.emit("tick", None)

        session.on("start", flood)
        with self.assertRaisesRegex(runtime.EventOverloadError, "queued events"):
            await self.start(session)

    async def test_start_occurs_once_and_registration_is_sealed(self):
        session = runtime.EventSession()
        seen = []

        async def receiver(payload):
            seen.append(payload)

        session.on("start", receiver)
        task = self.start(session)
        await until(lambda: len(seen) == 1)
        self.assertEqual(seen, [None])
        with self.assertRaisesRegex(ValueError, "sent once"):
            session.emit("start")
        with self.assertRaisesRegex(RuntimeError, "before"):
            session.on("tick", receiver)
        with self.assertRaisesRegex(RuntimeError, "once"):
            await session.run()
        task.cancel()

    async def test_invalid_host_event_fails_an_idle_session(self):
        session = runtime.EventSession()
        task = self.start(session)
        await until(lambda: session.state == "running")
        self.assertFalse(session.receive("message", {1: "unsupported"}))
        with self.assertRaises(runtime.EventPayloadError):
            await task

    async def test_wait_rejects_invalid_values(self):
        session = runtime.EventSession()
        self.start(session)
        await until(lambda: session.state == "running")
        for value in [True, "1", None]:
            with self.subTest(value=value), self.assertRaises(TypeError):
                await session.wait(value)
        for value in [-1, float("nan"), float("inf"), 86401, 10**1000]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                await session.wait(value)


class BoundaryTests(unittest.TestCase):
    def test_payload_roundtrip_preserves_supported_values_and_does_not_preserve_aliases(self):
        nested = [1]
        value = [None, True, "snow 雪", 2**53-1, -2**53+1, 0.5, {"a": nested, "b": nested}]
        copied = json.loads(runtime.snapshot_payload(value))
        self.assertEqual(copied, value)
        self.assertIsNot(copied[-1]["a"], copied[-1]["b"])

    def test_unsupported_payloads_and_explicit_limits(self):
        cycle = []
        cycle.append(cycle)
        deep = None
        for _ in range(17):
            deep = [deep]
        for value in [cycle, deep, (1, 2), {1: 2}, {1, 2}, float("nan"), float("inf"), 2**53, float(2**53), lambda: 1, "x" * 16384, [None] * 1024]:
            with self.subTest(kind=type(value)), self.assertRaises(runtime.EventPayloadError):
                runtime.snapshot_payload(value)
        self.assertEqual(len(runtime.snapshot_payload("x" * 16382)), 16384)

    def test_handler_and_name_limits(self):
        session = runtime.EventSession(limits={"handlers": 1})

        async def handler(payload):
            pass

        for name in ["", "x" * 65, None]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                session.on(name, handler)
        with self.assertRaises(TypeError):
            session.on("tick", lambda payload: None)
        session.on("tick", handler)
        with self.assertRaises(runtime.EventOverloadError):
            session.on("tick", handler)
