# Blocks and Python learner pilot

Status: **the in-app pilot workflow is implemented; no participant sessions have been conducted or results claimed.** Automated browser checks demonstrate software behavior, not learning outcomes. This pilot informs the next expansion of the supported Python subset.

## Running a session

Open **Learner pilot** above the workspace. Enter a participant code, prior experience, and relevant device/accessibility notes. Start saves a return copy of the current project before loading the score starter. If the backup cannot be saved, the project is not replaced. The six activity tabs contain learner prompts; **Facilitator notes** keeps predictions, observed behavior, interpretation, outcome, hint level, and end discussion separate. No outcome is automatically marked successful.

Use **Start task timer** for observed task work. It pauses on task changes, page hiding, reload, and session completion. It measures active observed work, not a full session's wall-clock duration. A browser crash can lose the current timing interval. The sprite activity has an explicit starter button that saves the previous project as a checkpoint first. Invalid Python drafts are included in those project snapshots. The pilot disables AI assist and clears any configured key when it begins.

**Download observations** exports the six tasks, notes, app revision, browser, and session timestamps as JSON, without project backups. Notes stay in this browser; the app does not upload them or collect analytics. **Finish session** stops the timer and unlocks optional AI assist; it does not declare the pilot study complete. Download observations after each session. Use **Saved project checkpoints** to download the original project, work before the sprite starter, or the final pilot project. **Return to original project** saves that final checkpoint before restoring the original. Download files you need before clearing pilot data or starting the next participant's session. Only one pilot session is stored at a time. Avoid simultaneous sessions in multiple tabs; stale pilot writes are rejected.

The facilitator should check that project downloads open before deleting checkpoints. Browser storage can be cleared by the browser or device owner, so a local record is not a durable research archive. Damaged records have a raw recovery download. Keep participant records outside source control unless they have been appropriately reviewed and explicitly approved for sharing.

## Questions

- Can a learner connect a block expression, loop or event to its Python representation and predict its behavior?
- Can they make a small intentional text edit, apply it, inspect the resulting blocks and explain the outcome?
- Do draft, Apply, Run, generated files and recovery make sense without risking lost work?
- Which unsupported constructs do learners actually need, and which diagnostics prevent them from continuing?

## Participants and setting

Recruit 6–8 learners with varied prior block-programming experience for individual 25–35 minute sessions. Use a familiar desktop or laptop with keyboard and a supported browser. Arrange participation with the learner and supervising adult; let the learner stop whenever they choose. A facilitator observes and offers hints, without writing code or operating the learner's project. This is a small qualitative pilot, not a representative estimate of learning improvement. Touch-only authoring needs a separate study.

Use participant codes in notes. Record prior experience and any relevant accessibility needs without collecting names, API keys or account credentials. Start with local example projects; download a copy before recovery/conflict exercises. No AI helper is involved.

## Tasks

| Task | Learner activity | Evidence to observe |
| --- | --- | --- |
| Predict | Inspect a short loop that increments and prints a score; explain what will print before Run. | Prediction, explanation and whether the learner maps loop boundaries and assignment correctly. |
| Edit and compare | Change an initial value or repeat count in Python, Apply, inspect the blocks, then Run. | Independent completion, prediction versus output, and understanding of generated formatting. |
| Repair a draft | Remove a closing parenthesis, attempt Run, follow the diagnostic, reload and repair the retained draft. | Error discovery, use of position links, confidence that invalid text is preserved. |
| Keep assets | Change a message and keyboard movement amount in the sprite example, then compare stage behavior and authored assets. | Recognition of library calls, event ownership and code versus scene properties. |
| Handle a conflict | Begin a draft, change a sprite property with the scene editor, try Apply, then start from current blocks and recover the previous text. | Interpretation of conflict, explicit choice of a base, and ability to retrieve earlier work. |
| Deliver | Export a playable project and reopen its saved editable project; explain what each contains. | Distinction between exact draft, generated source and captured playable behavior. Facilitator may launch the local server. |

If the learner attempts unsupported Python, preserve it and ask what they intended. Observe the diagnostic rather than supplying a replacement solution. End with a brief discussion: which control surprised them, what they expected to happen, and one change they want to make next.

## Notes and decisions

For each task, record completion, elapsed time, prediction, actual result, hint level (none / conceptual / step-specific), learner explanation, errors and recovery. Mark facilitator interventions explicitly. Separate observed behavior from interpretation; an unfinished task is useful evidence, not a participant failure.

Use this session record:

| Participant code / experience | Task | Prediction | Outcome / time | Hint level | Observed confusion or recovery | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — |

Review after the first three sessions for blocking usability problems before recruiting the remainder. Any reproducible work-loss or silent stale-execution issue takes priority over new language features. Repeated confusion about Apply, generated files, or conflicts calls for a workflow change and another trial. Prioritize additional syntax only when it supports observed learner intentions and has a faithful block representation. Do not interpret success on these tasks as evidence of long-term learning; a later study would need delayed tasks and a comparison design.

Publish actual findings in a separate dated report, including device/browser, app revision, task modifications, assistance given and sample limitations. Until sessions occur, the roadmap's learner-pilot milestone remains pending.
