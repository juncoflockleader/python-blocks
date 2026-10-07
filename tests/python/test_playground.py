import importlib.util
import json
import math
from pathlib import Path
import sys
import types
import unittest


class PenTests(unittest.TestCase):
    def setUp(self):
        self.commands = []
        host = types.ModuleType("_playground_host")
        host.emit = lambda value: self.commands.append(json.loads(value))
        sys.modules["_playground_host"] = host
        path = Path(__file__).parents[2] / "src/runtime/playground.py"
        spec = importlib.util.spec_from_file_location("playground", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.pen = module.pen

    def tearDown(self):
        sys.modules.pop("_playground_host", None)

    def test_square_returns_to_origin(self):
        for _ in range(4):
            self.pen.move(100)
            self.pen.turn(90)
        self.assertAlmostEqual(self.pen.x, 0)
        self.assertAlmostEqual(self.pen.y, 0)
        self.assertEqual(len(self.commands), 8)
        self.assertEqual(self.commands[2]["y2"], -100)

    def test_pen_up_moves_without_drawing(self):
        self.pen.up()
        self.pen.move(20)
        self.pen.down()
        self.pen.move(10)
        self.assertFalse(self.commands[0]["draw"])
        self.assertTrue(self.commands[1]["draw"])
        self.assertEqual(self.pen.x, 30)

    def test_invalid_numbers_do_not_corrupt_state(self):
        for value in [True, "100", None, math.nan, math.inf, 1_000_001]:
            with self.subTest(value=value):
                with self.assertRaises((TypeError, ValueError)):
                    self.pen.move(value)
        self.assertEqual(self.pen.x, 0)
        self.assertEqual(self.commands, [])

    def test_invalid_color_has_a_readable_error(self):
        with self.assertRaisesRegex(ValueError, "#RRGGBB"):
            self.pen.color("purple")

    def test_command_limit_stops_large_drawings(self):
        for _ in range(10_000):
            self.pen.turn(0)
        with self.assertRaisesRegex(RuntimeError, "smaller repeat"):
            self.pen.move(1)
        self.assertEqual(len(self.commands), 10_000)
        self.assertEqual(self.pen.x, 0)


if __name__ == "__main__":
    unittest.main()
