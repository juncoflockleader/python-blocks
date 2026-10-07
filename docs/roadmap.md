# Roadmap

## 0. Repository scaffold

- [x] Record product intent, architecture, and open decisions.
- [x] Build a Blockly workspace and live Python preview.
- [x] Execute generated Python in a worker with a pen drawing library.
- [x] Provide Run, Stop, reset, source download, output, and bounded execution.
- [x] Add type checks, compiler/lifecycle tests, Python library tests, and browser tests.

## 1. Make projects durable and understandable

- Versioned save/load format with Blockly state and future assets.
- Local autosave with visible save state and recovery from invalid data.
- Python line-to-block mapping and concise learner-facing errors.
- Portable export with its library and a working host.
- Accessibility review: keyboard navigation, focus, zoom, contrast, and touch targets.

Acceptance: a learner can save a drawing, reload it, understand a deliberate error, and run an exported project using its documented instructions.

## 2. Add interaction

- Prototype two independent sprites, keyboard events, and waits.
- Choose and document scheduling, shared state, and cancellation semantics.
- Add sprite movement, appearance, and a small sound API.

Acceptance: two scripts progress together, a non-yielding script can be stopped, and generated Python remains explainable to the intended learner.

## 3. Bridge to written Python

- Specify the first round-trip subset: assignments, expressions, conditionals, loops, functions, and curated library calls.
- Add text editing with explicit handling of unsupported Python and syntax errors.
- Preserve project behavior through supported blocks → text → blocks transformations.
- Run a learner pilot around prediction, code recognition, and small text edits.

Acceptance: switching views never silently loses learner work; pilot results inform whether and how to expand text editing.

## 4. Prepare a release

- Owner chooses project license and confirms product name.
- Audit dependency and runtime notices.
- Define target devices and startup/memory budgets.
- Design untrusted-code isolation before any shared-project import or public gallery.
- Choose hosting and privacy requirements before accounts or analytics.

Each phase can change based on learner feedback. This is sequencing, not a delivery-date commitment.
