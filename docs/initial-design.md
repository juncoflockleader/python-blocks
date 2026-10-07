# Initial design: Python Blocks

Status: initial direction, 2026-10-06. Product name is provisional.

## Product idea

Children make creative programs with visual blocks. Those blocks generate ordinary, readable Python that runs on CPython, supported by a small library for graphics, sound, and interaction.

The learning hypothesis is that seeing the same program in both forms helps a learner move gradually from blocks to written Python. This is a hypothesis to test with learners, not a proven outcome of choosing Python.

The first audience is learners comfortable with basic reading and block programming who are beginning to explore text coding. Exact age range, accessibility requirements, and classroom use need discovery.

## Principles

1. Immediate creative feedback: a small program should produce a visible result.
2. Readable generated Python: prefer common Python statements and a small, documented API.
3. Consistent behavior: use Python's types, zero-based indexing, comparisons, and explicit conversions in both views.
4. Deterministic translation: the same project generates the same source. Code generation does not depend on AI.
5. Progressive exposure: begin with blocks and a live Python preview; introduce text editing deliberately.
6. Useful errors: eventually highlight the responsible block and explain the problem in language a learner understands.
7. Portable intent: exports should eventually include the library, assets, and instructions necessary to run outside the editor.

## Intended learning flow

1. Open a starter project and run it.
2. Change a block value and predict the result.
3. Observe how the corresponding Python changes.
4. Assemble a small program using a loop and a variable.
5. Later, edit a supported Python statement and see the change reflected in blocks.
6. Eventually, move into unrestricted Python with a clear explanation of which code can still be represented visually.

The scaffold implements steps 1–4. The Python pane is read-only; it does not imply arbitrary Python can convert back into blocks.

## Core program model

Blocks are the visual syntax. Python is the execution language. Our library provides domain concepts such as pens and, later, sprites and sounds. For example:

```python
from playground import pen

for side in range(4):
    pen.move(100)
    pen.turn(90)
```

This remains ordinary Python, although the `playground` module is an application dependency. Choosing Python does not provide Scratch's stage, animation scheduler, asset editor, project sharing, or safety model automatically.

## Scope

The first usable learning prototype should include drawing, a few sprites, keyboard input, variables, loops, functions, Python preview, and portable project export.

The repository scaffold takes one complete slice of that goal: blocks → Python → drawing. It also establishes module boundaries, Stop, limits, documentation, and automated verification. Scheduling and sprite semantics are deliberately unresolved rather than embedded in a throwaway imitation.

Accounts, social features, a marketplace, arbitrary package installation, mobile editing, and Scratch project compatibility are outside the initial scope.

## Main tradeoffs

| Decision | Initial position | Cost or open question |
| --- | --- | --- |
| Build foundation | Blockly plus a new application | We must build the stage and creative tools |
| Python implementation | Pyodide / CPython in the browser | Startup download, memory use, and browser package limitations |
| Code preview | Read-only source generated from blocks | Text editing requires a defined supported subset and conflict rules |
| Core semantics | Python behavior from the start | Some rules differ from Scratch and need teaching support |
| Libraries | Curated APIs and pinned versions | Each library needs an accessible block design and error handling |
| Execution | Fresh worker per run | More startup work, but predictable state and hard cancellation |
| License | Pending owner decision | Do not assume a permissive or copyleft license |

## Concurrency decision to validate

Scratch-style behavior requires multiple scripts to make progress together. Merely generating several infinite Python loops does not accomplish that.

Explore Python `async`/`await` with explicit yield points versus a simpler callback/update API. Evaluate the generated code that a child would actually read, cancellation behavior, fairness between scripts, shared state, broadcast ordering, and what happens when a script never yields. Use a two-sprite demo before committing to an API.

## Library strategy

Start with our pen and sprite APIs, then add selected Python libraries as the curriculum needs them. Browser support must be checked per dependency; a desktop Python package is not automatically compatible with WebAssembly. Each addition needs understandable blocks and a versioned dependency declaration, not just a successful `import`.

The current pen API is synchronous and sends drawing commands to a host. It is not yet a reusable published package. Desktop execution will require a host adapter or a portable renderer.

## Validation

With a small learner pilot, observe whether learners can predict a loop's output, identify the matching Python, explain a variable change, and eventually make a small text edit. Also measure first-run startup, restart latency, and whether errors and Stop are understandable. Do not assign numerical success targets before we know the audience and devices.

## References

- [Blockly Python generation](https://docs.blockly.com/guides/create-custom-blocks/code-generation/overview/)
- [Pyodide / CPython in WebAssembly](https://pyodide.org/en/stable/)
- [Pyodide worker execution](https://pyodide.org/en/stable/usage/webworker.html)
- [Browser compatibility constraints](https://pyodide.org/en/stable/usage/wasm-constraints.html)
- [Scratch editor and license](https://github.com/scratchfoundation/scratch-editor)
- [Scratch trademark guidelines](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232107-scratch-trademark-guidelines)

Sources checked during initial design. Dependency versions are pinned in `package.json` and the lockfile; upstream documentation may change.
