# Learner pilot and AI assist implementation audit

Date: 2026-10-07. This is a software audit, not a participant-study report.

| Requirement | Implementation and evidence | Status |
| --- | --- | --- |
| Small pilot before AI assist | Six activities from the existing protocol, a score starter, the existing sprite starter, facilitator observation fields, and manual task timing in `src/pilot/`. The pilot workflow was implemented and browser-tested before the assist integration. | Implemented |
| Preserve the learner's work | Original project and pre-sprite checkpoints are saved before replacing the workspace; final pilot work is saved before returning. Browser tests retain invalid Python drafts across reload and restoration, reject failed backup writes, and recover malformed records. | Verified |
| Honest observation records | Outcomes start unobserved; predictions, observations, interpretation, hint level and discussion are separate. Export includes app revision, browser and timestamps, omitting project backups. No outcome is inferred from a click or automated test. | Verified |
| Recruit and observe 6–8 learners, review after three | Protocol, in-app prompts and exports are ready. No participant observations have been supplied or collected. No finding or learning benefit is claimed. | Pending human sessions |
| Optional, user-supplied key | Initially OpenAI with a user-selected model ID; key held in tab memory only, cleared on page exit, Disable and pilot start. Browser checks inspect project downloads and browser storage. | Verified with a fake key |
| Assistance only, no authoring or execution | Assist integration receives only text readers. There are no write/run/input callbacks or provider tools. Exact catalog-ID responses are validated before display; arbitrary prose, code, extra fields and tool responses are rejected. Authoring requests leave the project unchanged. | Verified |
| Explain, predict, diagnose | Reviewed explanations cover Python concepts, common exceptions, creative-library behavior and draft/recovery. The model selects a concept, question and optional in-excerpt line; it never supplies the prediction's answer or replacement code. | Implemented; real-model relevance unmeasured |
| Explicit choice of shared context | All sharing unchecked initially; question, optional Python, selected-block text and errors/output are captured for review. Send rechecks that selected context has not changed. A browser test sends only a selected excerpt and explicitly chosen diagnostics. | Verified |
| Costs and failure handling | Tab request limit, output/input bounds, provider-reported usage, optional user-rate estimates, unknown cost indication, cancellation, timeout and sanitized provider errors. No automatic retry. | Verified with transport fixtures |
| Pilot remains free of AI | Starting/resuming an active pilot disables assist and clears credentials; finishing permits a new explicit enable action. | Verified |
| Privacy and release scope | No analytics or note upload. Direct fixed provider endpoint, no persistent key, no generated-response HTML, and no key in model input. Production credential/privacy/hostile-code release gates remain open. | Implemented within documented prototype scope |

Verification commands and cases are in `tests/unit/pilot.test.ts`, `tests/unit/assist.test.ts`, `tests/e2e/pilot.spec.ts` and `tests/e2e/assist.spec.ts`. `pnpm check` passed with 689 TypeScript tests and 122 native Python tests before final UI refinements. The final refinements passed type checking, build, and all 16 focused unit tests (including one newly added case). A full browser run exposed an existing asynchronous import race in a test helper: it could capture the prior scene and the newly imported Python as one conversion input. The helper now waits for the imported scene. All 16 affected pilot, assist and creative-library browser cases passed after that correction.

The final full browser regression run passed all **196 tests** in 4.7 minutes. A subsequently added selected-block-only sharing case also passed, giving **197 covered browser cases**. Mobile screenshots of the pilot and assist panels were inspected. No app source changed after the final full run.

No paid provider call was made. Live account access and model relevance must be checked with an explicitly configured user's key. Actual learner sessions, the first-three-session review, and the dated findings report remain outstanding. Do not close the human pilot milestone based on this audit.
