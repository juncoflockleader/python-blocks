# AI assist: learner authorship contract

Implemented after the pilot workflow, with human pilot sessions still pending. This is an optional browser feature, initially supporting OpenAI's Responses API. A user supplies their own key and chooses a model ID; no project, exported player, or account requires AI. Provider calls are covered by deterministic transport fixtures; a real paid call requires the user's key and has not been made during implementation.

## Interaction

Open **AI assist** above the workspace. Choose the provider/model, enter a key, and set a tab request limit (1–20). Optionally enter the model's current input/output prices per million tokens for estimates. Enable stores the key only in a closure in that tab and clears the password field. Reload, leaving the page, Disable, or starting a learner pilot clears it. There is no persistent key option. On a shared device, close the tab when finished.

Choose understanding, prediction, or debugging and ask a question. All project-context sharing starts off. Opt in to any of:

- The selected Python text, or current visible Python file if no text is selected. This may be an unapplied draft or an inspected generated module.
- The last selected block's text description, including its nested expressions.
- Visible compile/draft errors and program output. Output may contain learner-entered data.

**Review what will be shared** captures exactly those sources and the question. Read the snapshot before **Send this snapshot to OpenAI**. The app adds fixed coaching instructions and the reviewed concept/question catalog; it sends no history, images, audio, recovery copies, pilot notes, or other project files. If the chosen context changes before Send, the snapshot must be reviewed again. A response is labeled as advice for that snapshot; it can be mistaken. Neither sending nor receiving calls Run or changes the project.

## Enforcing the boundary

The helper receives only text-reading callbacks. It has no Blockly workspace, project loader, Python runner, scene editor, tool dispatcher, or mutation callback. The provider request declares no tools.

The model classifies the question and context into one concept ID, one guiding-question ID, and an optional line number in the shared Python excerpt. Only locally reviewed catalog text is displayed. The response must contain exactly those three fields, existing IDs, and a line within the shared excerpt. Extra prose, code, replacement solutions, tool calls, incomplete responses, unknown IDs, and refusals are rejected without showing provider text. Text is rendered using `textContent`, never HTML or Markdown execution. This makes the no-authoring boundary deterministic; it is not a claim that a prompt or a code-detection regex can reliably stop arbitrary generated solutions.

Explicit requests to author or execute are often redirected locally, without a paid call. The local language matcher is only a convenience: obfuscated requests still cannot bypass the catalog or obtain editing capabilities. The catalog covers core Python, common errors, drafts/recovery, and the creative libraries. It deliberately does not give the exact answer to a prediction or propose replacement statements. The limitation is that explanations are selected and generic, rather than free-form personalized tutoring. Expand the reviewed catalog based on learner observations; do not add an unchecked prose fallback.

## Connection, privacy, and costs

Requests go directly from the browser to the fixed `https://api.openai.com/v1/responses` endpoint. Redirects are rejected, cookies and referrers omitted, and the key appears only in the Authorization header. Key-like text in selected context is rejected, including an exact match for the configured key. This is a helpful check, not a general secret detector: inspect every snapshot yourself. Error bodies are never shown or logged. No code logs keys or responses.

The provider uses structured output, `store: false`, no streaming, and a maximum of 400 output tokens. These parameters follow the [Responses API migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses) and [structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs). `store: false` is not a promise of zero provider retention; see [provider data controls](https://developers.openai.com/api/docs/guides/your-data).

Each call contains at most 1,500 question characters and 12,000 context characters, plus the fixed coaching catalog. The response reader stops at 64,000 bytes. Calls time out after 30 seconds and can be cancelled. There are no automatic retries. Rate limits, invalid keys, inaccessible models, and connection failures get distinct local messages. Clearing a key or beginning a pilot aborts a pending request and ignores any late result.

Reported token usage and estimates using the user's entered prices are shown separately from unknown usage/cost. Failed, cancelled, rejected, or timed-out responses can still incur charges. Request counts persist across Disable/Enable in the tab but reset on reload; they are not an account budget. Check [current pricing](https://developers.openai.com/api/docs/pricing) and use provider-side spending controls for an account limit.

This personal-key browser prototype requires trust in the served app and browser extensions. A browser-held secret is accessible to compromised page code. A public deployment needs its own credential architecture, age-appropriate access, privacy review, and hostile-code isolation before claiming production security; the existing release gates still apply. [OpenAI's production guidance](https://developers.openai.com/api/docs/guides/production-best-practices) recommends secure key management. We do not embed a shared provider key or proxy participant data through an app-owned server.

## Validation and remaining evidence

Unit tests cover exact response schemas, the authoring boundary, credential exclusion, bounded response reading, provider errors, and cancellation. Browser tests use a fake key and intercepted provider responses to check explicit opt-in, unchanged projects, export/storage exclusion, stale context, cancellation, request limits, reload, and pilot isolation. These establish software behavior only.

Real learner sessions and a live call with an explicitly configured user key remain separate validation tasks. Do not infer improved learning, age suitability, model quality, or live account access from mocked browser checks. Pilot sessions remain AI-free so observations of the core language bridge are interpretable. The [implementation audit](learner-pilot-assist-audit.md) maps each requirement to its evidence and remaining gaps.
