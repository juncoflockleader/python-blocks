# Learner experience plan: one-screen editor, guidance, academy and assets

Status: Track A (one-screen editor) implemented on 2026-10-15. The owner accepted the desktop baseline in place of the physical-iPad run for now and deferred that measurement; see [section 2.10](#210-implementation-record). Track B (guidance) implemented on 2026-10-15 and accepted by the owner on 2026-10-18, with timed tester sessions for the guided builds deferred to the pilot (the app records them) and the blind match rate accepted as the matching result; see [section 3.8](#38-implementation-record). The first guided lesson, Brick Breaker, was added on 2026-10-18 ([section 3.12](#312-first-guided-lesson-brick-breaker)), Flappy Flight and Super Hopper on 2026-10-19 ([section 3.13](#313-lessons-flappy-flight-and-super-hopper)), and Stage view with big worlds on 2026-10-18 ([section 2.11](#211-stage-view-and-big-worlds)). Tracks C and D remain proposals. UI/UX mocks for all four tracks are on a private design canvas: https://claude.ai/artifact/BaCsQC2dTj5s4vAwErxBgZ (board A1 is interactive; share from the page before sending the link to anyone else). This plan sits on top of the completed language, 2D, bridge, search/debug and assist work recorded in the [roadmap](roadmap.md). It covers four tracks the owner asked for:

| Track | Problem today | Outcome this plan targets |
| --- | --- | --- |
| A. One-screen editor | Everything exists but is spread over a page almost three tablet screens tall, with 183 buttons and 21 flat toolbox categories. | A fixed app shell that fits an iPad in landscape, with tools disclosed progressively. |
| B. Guidance | A child who wants "the enemy to chase me" cannot find the path from that wish to blocks. The AI helper only answers questions the child already knows how to ask. | Intent-based recipes, a real example gallery, step-by-step guided game builds, and an AI helper that routes to reviewed recipes. |
| C. Academy | No curriculum. The language already supports sequence through recursion and higher-order functions, but nothing teaches it. | A Beast-Academy-style course taught through game building, from events and loops to recursion and algorithms, with automatic checking. |
| D. Assets | 20 single-frame costumes, 6 backdrops, 4 tiles, 7 synthesized instruments, 3 burst effects. No animated characters, no sound effects, no music loops. | Animated character sets, tilesets, parallax backdrops, a sound-effect generator and library, music loops, and richer runtime effects, delivered through a referenced asset pipeline. |

The tracks depend on each other in one direction: A unblocks B and C (there is nowhere to put a lesson panel or recipe drawer in the current page), and D feeds B and C (guided builds and academy games need characters that can walk and jump). Section 6 gives the sequencing.

## 1. Evidence from the current build

Measured on the development build on 2026-10-15 in Chromium emulating a 1024 × 768 viewport (iPad landscape, before browser chrome). The relevant source is the shell in [src/main.ts](../src/main.ts), the layout in [src/style.css](../src/style.css), the toolbox in [src/blocks/index.ts](../src/blocks/index.ts) and the scene inspector in [src/scene/editor.ts](../src/scene/editor.ts).

| Region | Measurement |
| --- | --- |
| Page height | 2224 px, about 2.9 screens. The page scrolls; the Blockly workspace also scrolls, so a wheel or finger over the workspace stops page scrolling. |
| Header and hero intro | 246 px before any control. The "Small blocks. Big possibilities." section is marketing copy on an editing screen. |
| Project bar, save notice, Learner pilot, AI assist | About 300 px of mostly collapsed panels that every learner sees before the workspace. |
| Blocks panel heading | 107 px, because Functions & variables, Events, Modules, Find blocks and Clear search wrap onto three rows at this width. |
| Workspace top | y ≈ 700 px. The first block is below the fold on an iPad. |
| Stage panel | 1122 px tall: the 480 × 320 canvas plus the starting-scene toolbar, sprite toolbar, navigation browser, watchers, a 432 px property form, three collapsed editors and two asset toolbars. |
| Python panel | Starts at y = 1683 px. The product's core idea, seeing Python beside blocks, is two screens away from the blocks. |
| Program output and errors | Appended below the right column after a run. A print or an error is invisible unless the learner scrolls. |
| Buttons in the document at load | 183. Dialogs: 11. |
| Example entry points | 11 buttons in four places: Reset example in the project bar; Sprite, Motion, Story, Drawing, Behavior, Platformer, Worlds and Star game in the scene toolbar; Music example in the audio controls; Input & color example after them. Each replaces the project silently with no description, preview or "what to try". |

Discoverability findings that measurements do not show:

- The toolbox lists 21 categories in one flat column, starting with Program, Sensing & input, Sounds, Game, Worlds, Sprites, Motion. Loops, Logic and Numbers are tenth to twelfth. The order is roughly the reverse of a learning path.
- Event handlers are not blocks a learner drags. The Events category holds a **Manage handlers** button that opens a dialog with handler kind, sprite, payload parameters and delivery order. A Scratch learner expects to drag "when key pressed" onto the canvas. The same is true for variables and functions, which start from **Manage variables** and **Manage functions** buttons in the flyout.
- Advanced tools (Function values, Modules, Collections, Debug code, Learner pilot, AI assist, Export playable, Watch sprite values) are presented at the same level as Run and Loops. Nothing distinguishes a first session from an expert session.
- Button text is 11 px and buttons are about 35 px tall, below the 44 pt touch target Apple recommends. Block text is 12 px at 0.9 scale.
- The AI helper answers with one concept and one guiding question from the [reviewed catalog](ai-assist.md). It cannot say "use *when overlap* with *point toward*", which is the kind of help a stuck child needs.

## 2. Track A: one-screen editor

### 2.1 Goals and non-goals

Goals: every editing session fits a 1024 × 700 logical viewport without page scrolling; a first-time learner sees only what a first project needs; the three core surfaces (blocks, stage, Python) are each one tap away; touch targets and block sizes suit a tablet; keyboard and screen-reader paths from the existing accessibility work are preserved.

Non-goals: phone-portrait authoring (play-only is fine on phones), a native app, redesigning the artwork, sound and world dialogs beyond fitting them in the viewport, changing any block semantics or the saved project format.

### 2.2 Target devices and budget

| Device class | Logical viewport after browser chrome | Decision |
| --- | --- | --- |
| iPad 10.2" / 10th gen, landscape | about 1080 × 700 | Primary design target. |
| iPad Air / Pro 11", landscape | about 1180 × 740 | Must fit with room to spare. |
| Chromebook / laptop | 1280 × 650 and up | Same shell; Python can show side by side with the stage. |
| Tablet portrait | about 810 × 1000 | Supported in a stacked variant: stage above a shorter workspace, Python and inspector as sheets. |
| Phone | under 600 wide | Play view only; editing shows a "turn your tablet sideways or use a larger screen" message. |

Two risks must be measured on a real iPad before this track is called done, because emulation cannot show them: Pyodide startup time and memory in iPadOS Safari, and whether the cross-origin isolation headers the debugger needs work under the host chosen for release. The roadmap's release phase already lists device and memory budgets; this track supplies the numbers.

### 2.3 Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ◇ My star game   [Undo][Redo]        [▶ Run] [■ Stop]   [Level ▾] [⋯] │ 48 px top bar
├──────────────┬────────────────────────────┬──────────────────────────┤
│ Palette      │ Workspace                  │ Stage 480×320 (3:2)      │
│ (icons +     │                            │ fills column width       │
│  labels,     │                            ├──────────────────────────┤
│  level-      │                            │ Sprite tray: ○ ○ ○ [+]   │
│  filtered)   │                            ├──────────────────────────┤
│              │                            │ Tabs: Sprite | Python |  │
│              │                            │       Output | Help      │
│              │                            │ (tab body scrolls)       │
│ [More…]      │ [Find blocks]  [zoom ± ⌖]  │                          │
└──────────────┴────────────────────────────┴──────────────────────────┘
```

Rules that make the layout hold:

- The shell is `height: 100dvh; display: grid` with no page scroll. Only the workspace, the palette flyout and the active tab body scroll. The body gets `overscroll-behavior: none` and `touch-action: manipulation` so a tablet never rubber-bands the page while dragging blocks.
- The right column width is clamped so the stage is at least 360 px wide and at most 40 % of the viewport. At 1024 wide the stage is about 384 × 256, the workspace about 560 px wide, and the palette 80 px (icon plus label) expanding to a flyout on tap.
- The top bar replaces the header, hero intro and project bar. Run and Stop are the largest controls on screen. Save, Open, Export Python, Export playable, Reset, Debug, Learner pilot and AI settings move into the ⋯ menu; the Level control (section 2.5) sits beside it.
- The Python view becomes a tab in the right column with a **side by side** toggle that splits the workspace horizontally when the viewport is at least 1280 px wide. Live highlighting of the generated line for the selected block is the reason to keep it one tap away, not two screens away.
- Output, printed text, tracebacks, the test-event form and watch readouts live in the Output tab. A run that prints or fails switches to that tab automatically and shows a one-line badge on the stage ("Let's try again · tap to see") when another tab is active.
- Large stage, Artwork & frames, Sounds & music, Worlds & tilemaps and the stock library remain modal dialogs, each sized to `100dvh - 24px` with their own internal scrolling. They already mostly do this.

### 2.4 Information architecture: today versus proposed

| Today | Proposed |
| --- | --- |
| Header, hero, project bar, pilot panel, assist panel stacked above the editor | One 48 px top bar; pilot and assist in the ⋯ menu and in the Help tab |
| 21 flat toolbox categories | 8 categories at the Starter level, 14 at Builder, all 21 at Pro; see 2.5 |
| Events through a Manage handlers dialog | Hat blocks in the Events palette; the dialog remains as the advanced editor (2.6) |
| Manage variables / Manage functions buttons open a shared dialog | **Make a variable** and **Make a function** flyout buttons that ask one question (the name) and insert the block; the full dialog stays behind **Edit…** |
| Scene inspector is a 1100 px form under the stage | Sprite tray with thumbnails plus a compact Sprite tab (name, costume, x, y, size, direction, visible) and a **More settings** sheet for world, layer, rotation, pen, data, motion and watchers (2.7) |
| 11 example buttons in four places | One **Examples** gallery (section 3.3) opened from the top bar and from the empty-workspace card |
| Find blocks bar always visible above the workspace | A search button in the workspace corner that expands into the existing search; the intent search of section 3.2 shares it |
| Output below the page | Output tab plus a stage badge |
| Audio enable/mute, touch controls, questions scattered under the stage | A small stage toolbar: audio, touch controls toggle, large stage; questions render over the stage as they already do in the play view |

### 2.5 Progressive disclosure through levels

Scratch stays discoverable by having few categories; MakeCode hides an **Advanced** group; the academy in section 4 needs the same mechanism to unlock tools unit by unit. Add a `level` field to editor state (not to the project) with three values. The palette, top-bar menu and sprite settings filter on it. A project that uses a block above the current level shows a one-time prompt to switch levels, so opening a shared project never hides its blocks.

| Level | Palette categories | Hidden tools |
| --- | --- | --- |
| Starter (default for new browsers) | Events, Motion, Looks, Sound, Control (repeat, if, wait), Draw, Variables, Game | Debug, Modules, Function values, Collections, Physics, Worlds, Sensing beyond key/pointer/overlap, watchers, pilot, assist settings, Export playable |
| Builder | Starter plus Logic, Numbers, Text, Functions, Sensing & input, Physics | Modules, Function values, Collections, Worlds, Debug |
| Pro | Everything, in today's order with Loops/Logic/Numbers moved above the scene categories | Nothing |

Starter's "Control" category is a presentation grouping of existing blocks (repeat, while, if, wait, break/continue), not a new block set. Category contents at each level are a single table in a new `src/ui/levels.ts`, so the academy can reference the same identifiers.

### 2.6 Events, variables and functions without a dialog

Handlers are real Python functions registered with the runtime, with payload parameters and an owner; the dialog exists because those details matter. The fix is to give the common cases a block-shaped entry that fills the details in:

- Add hat blocks `when [key ▾] pressed`, `when [sprite ▾] clicked`, `when [sprite ▾] overlaps [sprite ▾]`, `when game starts`, `when [sprite ▾] updates`, `when countdown ends`, `when I receive [message]`. Dropping one onto the workspace creates the handler through the existing event editor code path (same owner, payload names and delivery order rules), then attaches the hat to it. The Events palette lists one hat per kind plus existing handlers.
- The Starter palette shows the four most common hats. Builder and Pro show all of them, and the **Manage handlers** button stays for payload renames and ordering.
- **Make a variable** and **Make a function** become flyout buttons that prompt for a name with a native `prompt`-style sheet and then insert the set/get or call block. Blockly's flyout buttons are already in use, so this is a change to [src/language/editor.ts](../src/language/editor.ts) rather than new infrastructure.

Generated Python does not change. A learner who later opens the Python tab sees the same `@handler` registration the dialog produced.

### 2.7 Sprite tray and inspector

- A horizontal tray under the stage shows thumbnails (the navigation browser already renders them) with the selected sprite outlined, plus **+** for the stock library and **Paint** for a new costume. Tapping a sprite selects it in the palette defaults, the inspector and the stage, as today.
- The Sprite tab holds the seven fields a learner changes constantly. Each field commits on change with Undo, replacing the **Apply sprite** submit step, which is a common point of confusion in form-based editors.
- **More settings** opens a sheet with the current property grid, world membership, rotation style, pen and effects, data and behaviors, game motion, and watchers. Nothing is removed; it is layered.
- Stage drag placement, Find on stage and Go to script remain and gain toolbar icons.

### 2.8 Touch and tablet specifics

- Minimum 44 × 44 px hit areas for every button, tab, tray thumbnail and flyout button. Base font 14 px for controls, 13 px for block text at scale 1.0 on tablets (`startScale` by media query).
- Blockly options: `zoom.pinch: true`, larger scrollbars, `trashcan` replaced by drag-to-palette deletion plus an explicit delete in the block context menu (long press). Keep `move.wheel` for laptops.
- Touch controls auto-show on touch devices when the running program registered a key handler, and hide otherwise. Keyboard focus hints ("click the stage to use keys") only appear when a physical keyboard is present (`navigator.maxTouchPoints === 0` or a keydown has been observed).
- Number fields use `inputmode="decimal"`; name fields disable autocorrect.
- The art editor and world editor already set `touch-action: none` on their canvases; verify two-finger scroll inside those dialogs still works.
- Verify on a physical iPad: Pyodide first load and warm start time, memory headroom with a 16 MB project, Web Audio unlock on the first Run tap, microphone permission flow, file save/open through Files, and the Playable ZIP flow (which may need a "Share" sheet alternative to download).

### 2.9 Implementation phases and acceptance

| Phase | Work | Files touched |
| --- | --- | --- |
| A1 Shell | Top bar, grid shell, tabs, Output tab, stage toolbar, menu; delete hero and project bar | `src/main.ts`, `src/style.css`, `src/scene/editor.ts` markup, `src/ui/debugger.ts`, `src/assist/editor.ts`, `src/pilot/editor.ts` mount points |
| A2 Levels | `levels.ts`, filtered toolbox, Level control, upgrade prompt, Starter "Control" grouping | `src/blocks/index.ts`, new `src/ui/levels.ts` |
| A3 Sprite tray and inspector | Tray, compact tab, More settings sheet, commit-on-change | `src/scene/navigation.ts`, `src/scene/editor.ts`, appearance/data/motion editors |
| A4 Hat blocks and make-buttons | Hat block definitions, drop-to-create, flyout buttons | `src/blocks/core/*`, `src/language/event-editor.ts`, `src/language/editor.ts`, compiler mapping tests |
| A5 Tablet pass | Hit areas, scale, pinch, touch-control auto-show, physical-device checklist | `src/style.css`, Blockly options, `src/scene/play-input.ts` |

Acceptance: on a 1024 × 700 viewport a learner can open the app, drag a repeat and a move block, run, see printed output and an error without scrolling the page; a Starter-level palette shows eight categories; a key-press handler is created by dragging a hat block; every existing browser test passes after updating selectors, with new tests for the shell at 1024 × 700, the level filter and hat-block creation; a physical iPad run of the Star game records startup time, memory and any blocked flow in this document.

### 2.10 Implementation record

Implemented 2026-10-15. The editor is now the shell described above; generated Python, the saved project format and block semantics are unchanged.

| Phase | What shipped | Where |
| --- | --- | --- |
| A1 Shell | 52 px top bar (title and save state, Undo/Redo, Run/Stop, Level, Examples, ⋯ menu); blocks panel with corner tools (search, zoom in/out, center); right column with the stage, a stage toolbar (Reset stage, audio, touch controller, Large stage), the sprite tray and Sprite, Python, Output and Help tabs. The hero, project bar and footer are gone. The first print or error of a run opens Output; if the learner is typing in another tab, a stage badge and a tab dot point there instead. Python can sit beside the blocks at 1280 px and wider and marks the lines generated by the selected block. The eleven example buttons are one **Examples** list (the gallery of section 3.3 replaces it). | [shell.ts](../src/ui/shell.ts), [shell.css](../src/ui/shell.css), [main.ts](../src/main.ts) |
| A2 Levels | One table for all palettes: Starter 8 categories, Builder 14 (the six additions listed in 2.5; "13" earlier in this plan was a miscount), Pro the full 21 with Loops, Logic and Numbers moved up. Starter's Control and Game, and Builder's Game, are groupings of existing blocks. The level is stored per browser (`python-blocks-level`, Starter by default) and also filters the ⋯ menu, block search and the More settings sheet. Opening a file or an example, finishing a migration or a pilot load, and the first start of a browser that has never chosen a level each offer, once, the level the project needs, naming the tools it uses; keeping the current level records that choice. | [levels.ts](../src/ui/levels.ts) |
| A3 Sprite tray and inspector | Thumbnail tray with **Sprite library** and **Paint** (a blank costume for the selected sprite). The Sprite tab holds name, costume, x, y, size, direction and visible; each commits on Enter or when the field is left, as one Undo step, and invalid values are refused and restored. **More settings** opens a sheet with layer, rotation, world membership, pen and effects, data and behaviors, game motion and watchers. It is non-modal and covers only the tabs, so the stage and tray stay usable and choosing another sprite updates it. | [scene/editor.ts](../src/scene/editor.ts), [navigation.ts](../src/scene/navigation.ts) |
| A4 Hat blocks and make-buttons | Seven palette hats (game starts, key pressed, sprite clicked, sprite overlaps sprite, sprite updates, countdown ends, I receive). A hat never lands on the workspace: its drag substitutes an ordinary handler definition with the dialog's rules (unique `on_…` name, one `payload` parameter, next delivery position, owner sprite where relevant), created through the same function-model path. "Overlaps Star" starts with `if this sprite overlaps Star`. Handler blocks now share the Events colour and hat shape and describe their event in learner words (presentation only). The Events palette also lists existing handlers. **Make a variable** and **Make a function** ask for a name in a small sheet and insert a `set … to 0` or `define` block; **Manage …** keeps the full dialogs. | [hats.ts](../src/language/hats.ts), [event-names.ts](../src/language/event-names.ts), [language/editor.ts](../src/language/editor.ts), [name-sheet.ts](../src/ui/name-sheet.ts) |
| A5 Tablet pass | 44 px controls and tabs, 14 px control text, 52 px palette rows, 46 px flyout buttons; pinch zoom and Blockly's 25 px touch scrollbars; no trashcan (drag a block back to the palette or use Delete in its long-press menu); scale 1.0 and 13 px block text on touch screens; decimal keypads and no autocorrect on name fields; the on-screen controller appears on touch screens when the running program listens for keys; keyboard hints appear only once a keyboard is detected; tablet portrait stacks stage and tabs above the workspace; phones show a play-only message with **Play project**. Editor dialogs fit `100dvh - 24px` and scroll inside. | [shell.css](../src/ui/shell.css), [touch.ts](../src/scene/touch.ts) |

Verification: [unit tests](../tests/unit/levels.test.ts) cover the level table, palette contents and monotonic levels, required-level reasons, hat signatures, naming, overlap bodies and compilation, and handler labels. [Shell browser tests](../tests/e2e/shell.spec.ts) cover the acceptance scenario at 1024 × 700 (drag repeat and move, run, output and error visible without page scroll), the output badge, hat creation with Undo/Redo, sprite hats, level filtering, persistence and the one-time prompt, the make-buttons, commit-on-change and the sheet, Python side by side, tablet portrait and phone play-only, keyboard use of the menu and tabs, and 44 px targets. Existing browser tests start at the Pro level (seeded in the Playwright configuration) and use [shell helpers](../tests/e2e/shell.ts) to open the tab, menu or sheet that now holds a control; editor checks that ran at a 390 px phone width now run at 744 px, the narrowest editing layout.

Deviations from the plan text: Builder has 14 categories; the More settings sheet is non-modal (above); the top bar is 52 px rather than 48 px so its controls can be 44 px with a border; Run keeps the label **Run code**.

Deferred by the owner (2026-10-15):

- Physical iPad measurements. The paired iPad was offline and no iOS simulator runtime or WebKit build was available, so nothing below has been measured on iPadOS. The owner accepted the desktop baseline below for Track A and deferred this run. Fill the table on an iPad 10.2"/10th generation in landscape before tablet support is announced publicly. Note that serving the editor over plain HTTP on a local network is not a secure context, so Debug code (which needs cross-origin isolation) will only be available from an HTTPS host:

| Check (Star game example unless noted) | Result (deferred) |
| --- | --- |
| Pyodide first load, cold cache (Run tap to "Event session running") | not measured |
| Warm start (second Run) | not measured |
| Memory headroom with a 16 MB project | not measured |
| Web Audio unlock on the first Run tap | not measured |
| Microphone permission (Sounds & music → Record) | not measured |
| Save project / Open project through Files | not measured |
| Export playable download, or need for a Share sheet | not measured |
| Cross-origin isolation on the release host (Debug code available) | not measured |
| Two-finger scroll inside Artwork & frames and Worlds & tilemaps | not measured |
| Pinch zoom, drag-to-palette delete and long-press Delete in the workspace | not measured |

For comparison only, the same flow in headless Chromium 1024 × 700 on an Apple M3 Max laptop (local preview server, fresh browser context per trial, three trials): editor ready in 170–280 ms; Run to "Event session running" for the Star game in 970–990 ms on the first run and about 960 ms on the second, because each run starts a fresh Python worker; main-thread JavaScript heap about 11 MB (the worker's memory is not included). An iPad will be slower; these numbers only set a desktop reference.

### 2.11 Stage view and big worlds

Added 2026-10-18. The owner asked for the stage as the main area, panning across worlds bigger than one screen, and a minimap; of the mocks (the **Stage view** row of the design canvas, boards V0–V6) they chose the separate Stage view (V1–V5) over the split layout (V6), with dragging empty space panning even with Select, and no minimap in exported games.

| Part | What shipped | Where |
| --- | --- | --- |
| Two views | A **Blocks \| Stage** switch in the top bar. Blocks view is the shell above. Stage view puts a tools rail (Select, Pan, Fit world, Start view, Screen lines) left of a large 3 : 2 stage, with the sprite tray and the four tabs on the right. The same stage element moves between the two places, so a run, the canvas and its overlays carry on. The choice is kept per browser (`python-blocks.view.v1`); below 900 px wide the switch hides and Blocks view is used. Under 1100 px the switch, Examples and Lessons show symbols only, so the top bar stays on one line. **Go to script** and starting a guided build open Blocks view. Python side by side is a Blocks-view layout. | [shell.ts](../src/ui/shell.ts), [shell.css](../src/ui/shell.css), [main.ts](../src/main.ts) |
| Editing view | While editing, the stage shows the learner's own view: a centre and a zoom (25 %–150 %, lower when Fit needs it), remembered per world for the session and never saved. Drag empty space (any tool), use the Pan tool, hold Space, the middle button, two fingers, scroll or the arrow keys to look around; pinch, Ctrl/⌘ + scroll, + and − to zoom; F fits the world, Home returns to where the game starts. Outside the world is shaded; worlds bigger than one screen show dashed screen lines, **Screen N** labels and an orange **Game starts here** frame (the Screen lines button hides them). An arrow chip points to the selected sprite when it is out of view. Sprite dragging maps the pointer through the zoom. While the game runs, the stage shows the game camera at 100 % and the view comes back after Reset stage. **Move camera here** in the world editor also moves the view to the new start. | [stage-view.ts](../src/scene/stage-view.ts), [stage.ts](../src/stage.ts) |
| Minimap | Shown while part of the world is out of view: the world, its tiles one pixel each, screen lines, sprites as dots (the selected one ringed), the start frame and the view (or, while playing, the camera). Tap or drag to move the view. For the keyboard, the map holds one button per screen with a single tab stop; arrows choose, Enter jumps. A card in Stage view; in the small Blocks-view stage it starts folded behind a **Map** button. | [stage-view.ts](../src/scene/stage-view.ts) |
| Screens | Worlds are sized in screens (one screen is the 480 × 320 stage). **Add screen** buttons sit at the world's right and bottom edges in Stage view, and **World size** steppers (Screens wide, Screens tall) are in the Sprite tab under Stage & assets. Growing the plain stage makes it a world named Main world with the stage's background, backdrop, camera and sprites; maps grow and shrink at the right and bottom, keeping their top-left tiles; sprites on a removed screen move onto the nearest one that stays (global sprites too while the world is the only one). Each change is one Undo step. Maps may now have up to 256 tiles a side and 4096 px, so 16 px tiles allow 8 screens wide and 12 tall. | [world-size.ts](../src/scene/world-size.ts), [world.ts](../src/scene/world.ts), [editor.ts](../src/scene/editor.ts) |
| Levels | One world bigger than the stage is a Builder tool (**Big world**); several worlds stay Pro. Starter hides Add screen and World size; panning, zoom and the map work at every level. | [levels.ts](../src/ui/levels.ts) |

Fixed on the way: when a block gained or lost a warning, Blockly re-rendered it and could bump a neighbouring block outside any event group, so the next Undo only moved that block back. Warnings now update inside the group of the change that caused them, and scene changes have a group of their own, so one Undo reverts both. In Stage view the workspace stays laid out but invisible rather than removed from layout, because Blockly measures text as it renders.

Verification: [unit tests](../tests/unit/world-size.test.ts) cover screen counts, limits, growing the plain stage, shrinking with sprite moves and refusals; [levels tests](../tests/unit/levels.test.ts) the Big world level; [worlds tests](../tests/unit/worlds.test.ts) the 256-tile maps. [Stage view browser tests](../tests/e2e/stage-view.spec.ts) cover the layout and its memory, the narrow fallback, Add screen with the map, drag-to-pan, zoom, Fit, Home, map taps and keyboard screens, World size steppers with Undo, sprite dragging while zoomed, removing a screen, the off-screen chip, running with the game camera, the Blocks-view Map button, Go to script, and the Starter gating.

Differs from the mocks: the right column keeps the existing Sprite tab rather than the mock's per-sprite script list with **Edit in Blocks** (Go to script does that job); there is no **Move it** control to drag the start frame (the camera fields and **Move camera here** set it); the selection-box drag of V0 was not built (empty-space drag pans, as decided). Not measured on an iPad: pinch and two-finger pan were exercised only with mouse and keyboard in desktop Chromium.

## 3. Track B: guidance

### 3.1 Why the current help misses

The child's complaint, "I want to do X but cannot find how", has three parts. First, the wish is phrased as an outcome ("make it chase me"), not a block name ("point toward" plus "move"). Block search matches labels and tooltips, so it cannot bridge that. Second, outcomes usually need two to five blocks in a specific arrangement, which no single block tooltip shows. Third, the AI helper was deliberately designed to classify a question into a concept and a question; it cannot show an arrangement of blocks, and it requires the learner to type a question in the first place.

The plan below keeps the authorship boundary for the model (it still never writes code) but adds a reviewed library of outcome-shaped help that the app itself can show and insert.

### 3.2 Intent recipes: "How do I…?"

A recipe is a reviewed, deterministic answer to a child-language intent. Format, stored in `content/recipes/*.json` and validated by a unit test:

```json
{
  "id": "chase",
  "title": "Make an enemy chase the player",
  "phrases": ["chase", "follow me", "come after me", "enemy moves toward"],
  "level": "starter",
  "concepts": ["event", "motion"],
  "needs": { "sprites": 2 },
  "steps": [
    { "say": "The enemy needs to run all the time, so start from an update event." },
    { "say": "Point toward the player, then move a little." }
  ],
  "blocks": { "handler": "update", "stack": [ { "type": "scene_point", "..." : "..." }, { "type": "scene_move", "..." : "..." } ] },
  "preview": "chase.webm",
  "tryNext": ["touch-lose-life", "random-start"]
}
```

Rules:

- `blocks` is a Blockly serialization fragment using the existing palette defaults, so insertion goes through the same path as block search insertion today (one Undo step, references resolved to the selected sprite). Nothing in a recipe is generated at runtime.
- Each recipe ships a two-second looping preview rendered from a fixture project by the Playwright suite, so previews can never drift from what the blocks do.
- Phrases are matched by the existing accent-insensitive, every-word search in [src/ui/block-search.ts](../src/ui/block-search.ts), extended with a third scope, **Ideas**, that is the default scope on the Starter level. Typing "jump" shows the recipe card above matching blocks.
- A recipe can require a handler. Inserting it creates the handler through the hat-block path of section 2.6.

Initial recipe set, grouped by what a child asks for. About forty recipes cover most first-month questions; each is one to five blocks.

| Group | Recipes |
| --- | --- |
| Move | arrow keys move me; glide to a point; bounce off edges; jump with gravity; move randomly; chase the player; run away from the pointer; wrap around the screen |
| Look | say something; change costume when I move (walk animation); face left and right; grow and shrink; hide then show; switch backdrop |
| Touch and sense | when I touch the enemy; collect a coin (destroy and score); touch the edge; click a sprite; touch a color; keep a distance |
| Game | keep score; lives and losing one; countdown timer; win screen; game over and play again; next level (world transition); random spawn; spawn every second (clone); shoot a projectile; HUD message |
| Sound | play a sound when something happens; background music loop; make a jump sound; stop all sounds |
| Draw | draw a square; draw a star; spiral; rainbow pen; stamp a trail |
| Data | remember the best score (variable); list of enemies; pick a random item; count how many |
| Fix | my sprite does not move (focus the stage, handler owner); it moves too fast; two things happen at once; my loop never ends |

### 3.3 Example gallery

Replace the eleven buttons with a gallery dialog, also used as the empty-workspace card. Each card has a thumbnail from the fixture screenshot (since Phase 4 of the [art plan](creative-tools-and-art-plan.md), a three-second loop of the game being played, shown on hover, focus, or on screen on a tablet), a one-line description, the concept tags from the level table, **Play**, **Open to edit** and three **Try changing…** prompts shown in the Help tab after opening. Opening an example while the current project has unsaved changes keeps today's confirmation through the Python draft flush.

The ten current examples stay. Add the six small games of section 3.4 and the academy capstones as they land. A gallery entry is a JSON record pointing at the project fixture, so the academy can reuse the same loader.

### 3.4 Guided builds

A guided build is a short, checked tutorial that ends in a playable game. It runs in the Help tab beside the workspace, one step at a time, with the target palette category and block highlighted in the toolbox, and a check that passes when the workspace contains the expected structure. This is the MakeCode and Code.org pattern; its value over a video is that the learner cannot get lost between the video and the editor.

Step format, stored with the recipes:

```json
{ "id": "catch-the-star", "title": "Catch the star", "level": "starter", "minutes": 15,
  "starter": "fixtures/guided/catch-the-star-start.json",
  "steps": [
    { "text": "Add a star from the library.", "check": { "sprites": { "costume": "star" } } },
    { "text": "Make the bird move with the arrow keys.", "highlight": ["Events", "scene_control"], "recipe": "arrow-keys", "check": { "handler": "key", "contains": ["scene_control"] } },
    { "text": "Run it. Can you reach the star?", "check": { "ran": true } },
    { "text": "When the bird overlaps the star, add 1 to the score and move the star somewhere random.", "recipe": "collect-coin", "check": { "handler": "overlap", "contains": ["game_change", "scene_go"] } }
  ] }
```

Checks are static predicates over the compiled project (`compile()` already yields block maps, handlers and scene state) plus two dynamic facts the runner already knows (ran, finished with result). No new runtime hooks are needed for the first set.

Six guided builds for the first release, chosen so that each introduces one new idea and reuses the previous one:

| Build | Game | New ideas | Reuses | Minutes |
| --- | --- | --- | --- | --- |
| 1 | Catch the star | key events, overlap, score, random position | — | 15 |
| 2 | Dodge the balls | clones, update event, lives, countdown, lose screen | 1 | 20 |
| 3 | Pen patterns | repeat, turn, nested repeat, pen color | — | 15 |
| 4 | Maze run | world template, tile walls, camera follow, world transition | 1 | 20 |
| 5 | Jump quest | gravity, controller, jump, projectile, win screen | 2, 4 | 25 |
| 6 | Talking story | say/wait, costumes and frames, backdrop events, sound | — | 20 |

Each build needs assets from Track D (an animated hero and enemy for 2, 4 and 5; a walking character for 6). Builds 1 and 3 can ship with today's art.

### 3.5 Contextual nudges

Small, deterministic prompts that appear in the Help tab and never as modals:

- Empty workspace: three gallery cards and "Or search an idea: *jump*, *chase*, *score*".
- After adding a sprite from the library: "Make it move" and "Make it talk" recipe chips.
- After a runtime error that maps to a block: the existing highlighted block plus a recipe chip for the matching Fix recipe (focus the stage, loop never ends, name not set).
- After thirty seconds idle on a workspace with a single handler: "Try next" chips from the recipe's `tryNext`.
- After finishing a guided build: "Remix it" prompts and the next build.

### 3.6 AI as a router, not an author

Keep the [authorship contract](ai-assist.md) for the model and change what the app does with its answer:

1. The ask box becomes **What do you want to make happen?** with suggestion chips drawn from recipe phrases, so a child does not need to compose a question. Free text is still accepted.
2. The structured response schema gains an optional `recipe` field constrained to recipe IDs, alongside the existing concept, question and line. The model classifies the wish into a recipe; the app displays the reviewed recipe card with its preview and **Insert** button. The model still cannot emit code, and an unknown ID is rejected exactly as today.
3. Before any paid call, the local phrase matcher runs first. Most wishes resolve locally with no key configured, which also makes the feature work in the pilot and in classrooms without keys.
4. A second tier, to decide separately: let the model draft a block fragment that is validated by the existing non-executing parser and shown only as a draggable suggestion the learner must place. This changes the contract in the assist document and should wait for pilot evidence that recipes alone leave real gaps.

### 3.7 Phases and acceptance

| Phase | Work |
| --- | --- |
| B1 | Recipe format, validation test, Ideas search scope, insertion, 20 recipes with previews |
| B2 | Gallery dialog, empty-state card, try-next prompts |
| B3 | Guided-build engine (steps, highlight, checks), builds 1 and 3 |
| B4 | Nudges, AI routing (`recipe` field, chips, local-first matching) |
| B5 | Builds 2, 4, 5, 6 once Track D delivers the animated hero and enemy; remaining 20 recipes |

Acceptance: a child who types or taps "chase" sees a preview and inserts a working chase in one step; each guided build is completed by a tester with no prior exposure in under its listed minutes; recipe previews are generated by tests, not hand-recorded; the AI helper suggests a recipe for ten held-out phrasings of each of the first twenty intents without a key configured.

### 3.8 Implementation record

Implemented 2026-10-15, all five phases. Generated Python, the saved project format and the AI authorship boundary are unchanged: an inserted idea is ordinary blocks, and the model can still only return reviewed IDs.

| Phase | What shipped | Where |
| --- | --- | --- |
| B1 Recipes | 55 recipes in the eight groups of 3.2 (the planned ones plus fall down, a two-sprite conversation, change the scene later, a backdrop event, camera follow, survive the timer, reach the goal and "name not set"). Each declares a level, concept tags, phrases, steps, needs (sprites, worlds) and up to three try-next IDs. A block recipe is one or more handler parts (`handler` kind plus a `stack` of serialized blocks) with placeholders for the selected sprite, the other sprite, a second world and project variables. **Insert** goes through the hat-block path, as one Undo step, to the right of the existing scripts; a recipe that needs another sprite shows a target picker, and one that cannot work says what is missing ("This idea needs 2 sprites…") instead of inserting half of it. The five Fix recipes are checklists without blocks. Block search has a third scope, **Ideas and blocks**, the default at Starter, which lists idea cards above matching blocks. | [recipes.ts](../src/guide/recipes.ts), [card.ts](../src/guide/card.ts), [content/recipes](../content/recipes), [block-search.ts](../src/ui/block-search.ts) |
| B1 Matching | A local matcher replaces every-word search for wishes: accent and case folding, a light stemmer, multiword expressions, an everyday synonym table, one-typo correction against the recipe vocabulary, and rarity-weighted scoring with title, whole-phrase and coverage bonuses. It runs in the browser with no key. | [match.ts](../src/guide/match.ts) |
| B1 Previews | 50 two-second WebM previews (every block recipe) and 16 gallery thumbnails, rendered by the [previews spec](../tests/e2e/previews.spec.ts) from fixture projects through the real editor: load the fixture, insert the idea from the Ideas box, run, replay scripted keys or clicks, record the stage. Each output is keyed by a hash of its inputs (renderer version, blocks, variables, needs, demo, fixture); the spec re-renders stale files locally and fails in CI, and a unit test fails when any key is stale. | [preview-key.ts](../tests/preview-key.ts), [public/recipes](../public/recipes), [public/gallery](../public/gallery) |
| B2 Gallery and empty state | **Examples** (top bar and ⋯ menu) opens a gallery: the ten examples plus the six finished guided-build games, each with a thumbnail, description, concept tags, the level its project needs (computed, and checked by a test), **Play**, **Open to edit**, and **Build it step by step** for the six games. Opening still refuses while an unapplied Python draft exists. After opening, the Help tab shows the entry's three **Try changing…** prompts. An empty workspace shows a start card over the blocks panel with three Starter projects (Catch the star, Pen patterns, Story), wish chips (*jump*, *chase*, *score*), **Start a guided build** and **All examples**. | [gallery.ts](../src/guide/gallery.ts), [content/gallery.json](../content/gallery.json), [nudges.ts](../src/guide/nudges.ts) |
| B3 Guided builds | The Help tab lists the builds. A build loads its starter project (asking again first if the workspace is not empty, and raising the level if needed), then shows one step at a time with a progress meter, highlights the palette category or editor control the step names, selects the step's sprite, and preselects the step's target in idea cards. **Show me how** opens the step's idea; the learner still chooses Insert. Each step's check is re-evaluated after every block change and scene edit (both arrive as workspace events), run and game end; **Next step** unlocks only when it passes. Finishing shows three remix prompts and the next build. Progress survives a reload. Each build also records active time per step (time with the tab hidden does not count) and whether **Show me how** was used; the finish shows the total against the planned minutes, and **Download timing** saves the record as JSON for a facilitator. Nothing is uploaded. | [builds.ts](../src/guide/builds.ts), [checks.ts](../src/guide/checks.ts), [content/builds](../content/builds) |
| B4 Nudges | Help-tab prompts, at most three at a time and each dismissible: the empty-workspace card; "Make it move / Make it talk" after adding a library sprite; the matching Fix checklist after a runtime error about a loop that never ends, an unset name, or keys while the stage lacks focus; try-next chips after 30 seconds idle with one handler; remix prompts after a build. | [nudges.ts](../src/guide/nudges.ts) |
| B4 AI routing | The Help tab's **What do you want to make happen?** box, with chips drawn from recipe phrases, works at every level with no key: it runs the local matcher and shows up to three idea cards. When nothing matches, **Ask the AI helper to pick an idea** carries the wish into the assist panel (Builder and Pro; at Starter it says the helper is not available), which has a new **Making something happen** mode and the same chips. There the local matcher runs again before anything is sent; only an unmatched wish can reach the provider. Whenever ideas are offered, the response schema requires a `recipe` field whose enum is the reviewed recipe IDs plus null; any other value is rejected like an unknown concept. A returned ID only makes the app show that card. | [ideas.ts](../src/guide/ideas.ts), [assist/catalog.ts](../src/assist/catalog.ts), [assist/editor.ts](../src/assist/editor.ts) |
| B5 Builds | All six builds of 3.4: Catch the star (Starter, 15 min, 7 steps), Dodge the balls (Starter, 20, 6), Pen patterns (Starter, 15, 6), Talking story (Builder, 20, 5), Jump quest (Builder, 25, 5) and Maze run (Pro, 20, 6). "Next build" goes through them in that order, so each level's builds come before the next level's. | [content/builds](../content/builds) |

Verification: [recipe unit tests](../tests/unit/recipes.test.ts) validate every recipe (fields, placeholders, try-next and group coverage), check that each uses only its level's palette, insert each into a fixture and compile it without errors and without leftover placeholders, cover the missing-sprite and missing-world messages and variable reuse, and check preview freshness. [Guidance unit tests](../tests/unit/guidance.test.ts) check that each build's starter does not already pass, that each finished game compiles and passes every static step at the build's level, that steps point at real recipes, sprites and categories, the gallery levels and tags, and the AI routing contract (unknown, non-string and prototype IDs rejected; schema enum; instructions). The [recipe tests](../tests/unit/recipes.test.ts) also hold each wish set above at its measured rate. The [guidance browser tests](../tests/e2e/guidance.spec.ts) cover the chase acceptance scenario, the wish box and chips, the gallery, the nudges, AI routing with an intercepted provider (a locally matched wish sends no request; otherwise the request offers the recipe IDs, the returned ID shows its reviewed card, and nothing is inserted for the learner), and a walkthrough of each of the six builds from start to the finish screen (Catch the star also reloads mid-build to check resuming, and downloads its timing record).

Acceptance against 3.7:

- **"chase" in one step: met.** Typing *chase* in the Ideas box (or in block search at Starter) shows the chase card with its preview; one **Insert** adds a handler that points the selected sprite toward the other sprite and moves it, and the run shows it chasing (browser test above).
- **Previews generated by tests: met** (B1 Previews above). The five Fix checklists have no blocks and so no preview.
- **Ten held-out phrasings of each of the first twenty intents, no key: accepted by the owner (2026-10-18) at about 95% on wishes nobody tuned against, not all 200.** Revisit with real pilot wishes. Measured on four sets of ten wishes per intent, all in [recipe-heldout.ts](../tests/unit/recipe-heldout.ts) and [recipe-wishes.json](../tests/unit/recipe-wishes.json). "Shown" means the intended idea is among the three cards the box shows.

  | Set | Written by | Use | First | Shown |
  | --- | --- | --- | --- | --- |
  | Original | the implementer | development (vocabulary was added while reading its misses) | 186 | 200 |
  | A | a separate agent | development | 175 | 196 |
  | B | a separate agent | blind at first: 167 / 188 before any change, 168 / 191 after one round; development since | 173 | 196 |
  | C | a third agent, a different model | **blind**: written after the matcher was frozen and scored once | **164** | **189** |

  Set C is the honest generalization figure: 189 of 200 (94.5%) show the intended idea, 164 (82%) rank it first, and every wish shows at least one card. The weakest intents there are *Move randomly* (often matched to *Random spawn* or *Pick a random item*), *When I touch the enemy* and *Do something when clicked*. Changes between rounds were general vocabulary (collectible nouns, sound words, taller/shorter, "clickable", "swim after", the four arrow directions, keeping *walk* distinct from *move*), one-typo correction, and two recipe phrases; the scoring weights were not retuned. The unit test holds every set at or above its measured numbers. These wishes were written by AI agents imitating children; real children's wishes from the pilot remain the better test.
- **Each build completed by a tester new to it within its minutes: deferred by the owner to the pilot (2026-10-18); it needs people.** The app now measures it: each build records active time per step and whether **Show me how** was used, shows the total against the planned minutes at the finish, and **Download timing** saves the record (build, planned and active minutes, per-step seconds, app revision, browser) for the facilitator. Until testers have done this, the browser walkthroughs only prove each build can be finished as written. They insert ideas through **Show me how** or drag from the palette, and two reach the ending without playing skillfully (Dodge the balls waits for the timer; Jump quest moves the goal next to the explorer). Run timed sessions with new testers and adjust the minute budgets or step text from what they do.

Deviations from the plan text:

- Builds 2, 4, 5 and 6 use today's art; they did not wait for Track D. Swapping in the animated hero, enemy and walker later changes only the build projects and their previews.
- Checks inspect the workspace (handler signatures, block trees, nesting, counts) and scene state (sprites, costumes, frames, worlds, walls, backdrops), plus the two run facts, rather than the output of `compile()`. The same information is there and a half-built project need not compile.
- Highlights mark a palette category or an editor control (Sprite library, Artwork & frames, Worlds & tilemaps), not a single block inside the flyout.
- A build's starter project is stored inline in its JSON, and its finished game is a separate `<id>-game.json` that the gallery also uses.
- Matching uses the new matcher in 3.8 rather than block search's every-word search, which missed most child phrasings.
- The local-first check in the assist panel needs an enabled key, because the panel only opens its review step then; the keyless path is the Ideas box.

### 3.9 Review of Tracks A and B, 2026-10-16: gaps for the next iteration

Reviewed on the development build in Chromium at 1024 × 700, 810 × 1000 and the 375 × 812 phone preset, plus the code. Type checking, the 723 unit tests and the 21 shell and guidance browser tests pass. Nothing has run on an iPad; the table in 2.10 is still unmeasured. The acceptance scenarios of 2.9 and 3.7 hold: no page scroll at 1024 × 700, Starter shows eight categories, dragging a hat creates a real handler, "chase" inserts in one step, previews come from tests.

| # | Gap | Where | Priority |
| --- | --- | --- | --- |
| 1 | The "Start something" card covers the workspace while a guided build is on its first step: `begin()` loads the starter (empty workspace) before setting `active`, so `nudges.empty(... && !guide.active)` fires. The card even offers the same build again. Set `active` before `host.load`, or re-evaluate the empty state after `begin`. | `src/guide/builds.ts` lines 78–89, `src/main.ts` line 294 | Bug |
| 2 | Starting a build when the workspace is not empty needs a second tap on the same card; the first tap only writes "Choose it again to start" and unhides the active panel with Back / Next step / Leave build for a build that has not started. Use explicit Replace project / Cancel buttons. | `src/guide/builds.ts` lines 80–85 | Bug |
| 3 | The project title is not autosaved: after a reload the Star game shows as "My project". | `src/main.ts` title assignments | Small |
| 4 | Pro palette overflow at 700 px tall: 21 rows × 52 px = 1207 px in a 648 px toolbox; 11 categories are fully visible, the twelfth is cut off and nothing says there are more. Builder (14 rows) also overflows. Use denser rows above Starter, two columns, or a scroll hint. | `src/ui/shell.css` palette rules | Tablet |
| 5 | The tab panel is 233 px tall at 1024 × 700 and each idea card is about 500 px (357 × 238 video, steps, buttons); three matches mean 2,400 px of scrolling in a letterbox. Cap preview height in narrow columns, show the best match expanded and the others collapsed. | `src/guide/card.ts`, `src/ui/shell.css` | Tablet |
| 6 | The Help tab stacks everything in a fixed order (nudges, ideas, guided builds, tips). After opening an example and asking an idea, the "Try changing" card, three idea cards and the build list all scroll past each other. Add a sub-navigation (Ideas / Builds) or collapse sections that are not in use. | `src/ui/shell.ts` help panel | Tablet |
| 7 | With a touch pointer and a key-listening program, the on-screen controller overlays the lower 45 % of the 383 × 255 editor stage and hides sprites. Dock the pad under the stage, or open Large stage automatically on Run when the controller is needed. Large stage itself is 847 px tall in a 674 px viewport, so it scrolls. | `src/scene/touch.ts`, `shell.css` `.stage-wrap .touch-controls` | Tablet |
| 8 | Side-by-side Python needs 1280 px, so no iPad (1080, 1180 or 1194 px wide) can ever use it. Lower the threshold to about 1080 px with a narrower stage column, or let Python replace the stage temporarily. | `src/ui/shell.ts` `installPythonPlacement` | Tablet |
| 9 | Sprite tab inputs are 40 px tall and the color input 27 px; the touch-size test only checks buttons. The panel shows about four fields at 700 px; the stage column could give up 40–60 px. | `src/ui/shell.css`, `tests/e2e/shell.spec.ts` | Small |
| 10 | Ideas at Starter rank Builder and Pro recipes beside Starter ones ("Make the camera follow me" was second for "chase") and their button silently switches the level, growing the palette from 8 to 21 categories. Demote or hide above-level recipes at Starter, or confirm the switch. | `src/guide/match.ts`, `src/guide/card.ts` line 59 | Guidance |
| 11 | The gallery is a 640 px, two-column dialog with 3,478 px of scrolling at 1024 wide, no tag chips or search, and examples mixed with guided builds. Use 90 vw with three or four columns and the chips from the mock. | `src/guide/gallery.ts` | Guidance |
| 12 | Recipe previews are WebM only. iPadOS Safari gained WebM playback late (iOS 15) and support varies by device; on error the card removes the video, so the learner sees no preview. Render an H.264 MP4 or animated WebP beside each WebM and use `<source>` fallbacks. | `tests/e2e/previews.spec.ts`, `src/guide/card.ts` | Tablet |
| 13 | The game HUD message bar covers the top quarter of the small editor stage; fine in Large stage. Consider a smaller HUD scale under 400 px wide. | `src/scene/game.ts`, play CSS | Small |
| 14 | At Starter the Ideas box says the AI helper is not available. That follows the level table, but a parent-configured key could reasonably work at Starter. Owner decision. | `src/guide/ideas.ts` | Decision |

Additions to the iPad checklist in 2.10 once a device is available: WebM preview playback (12); block drag with `touch-action: manipulation` on the body (Blockly sets `none` on its own surface); `100dvh` sheets and dialogs while Safari's toolbar collapses; pinch zoom and long-press menus; the controller overlay (7).

### 3.10 Iteration 2 record, 2026-10-16

Everything in 3.9 except item 14 (the owner's decision) is implemented. Verified in Chromium at 1024 × 700, 1080 × 700 and 810 × 1000; the iPad table in 2.10 is still unmeasured.

| # | Resolution | Where |
| --- | --- | --- |
| 1 | A build marks itself active before its starter loads, so the empty-workspace card never appears over a step. The browser walkthrough asserts it. | `src/guide/builds.ts` |
| 2 | Replacing a project is an explicit choice: **Replace and start** / **Keep my project** in the Builds section. The active step panel is mounted above the Help sections, so "Show me how" can open an idea without hiding the step. | `src/guide/builds.ts`, `src/ui/shell.ts` |
| 3 | The project title is kept with the autosave (`python-blocks.title.v1`) and restored on reload. | `src/main.ts` |
| 4 | Builder and Pro palettes use two 80 px columns on tablet-height screens (Pro below 1160 px tall, Builder below 840 px, landscape only), so all 21 categories fit 1024 × 700 and the flyout opens beside the wider palette. Whatever still overflows (portrait) shows a **More** cue that scrolls the palette. | `src/ui/shell.css`, `installPaletteHint` in `src/ui/shell.ts` |
| 5 | Previews are capped at 150 px in a column; only the best match is a full card, the rest are compact cards with a thumbnail beside the title. Three "chase" matches went from 2,436 px of scrolling to about 1,100 px. | `src/guide/guide.css`, `src/guide/card.ts` |
| 6 | The Help tab has Ideas, Builds and More sections (a segmented control); nudges and the active build step stay above them. Ideas, the gallery's "Try changing" prompt, guided builds, the pilot and AI assist each open their own section. | `src/ui/shell.ts`, `src/main.ts` |
| 7 | The on-screen controller starts hidden. On a touch screen, Run with a key-listening program opens Large stage, where the controller docks under the stage; the run's end hides it again. The Large stage sizes its stage to the viewport height (with room for the controller when no keyboard is detected) instead of scrolling. | `src/scene/touch.ts`, `src/main.ts`, `src/ui/shell.css` |
| 8 | Side-by-side Python from 1080 px, with a narrower stage column while it is on, so every iPad in landscape can use it. | `src/ui/shell.ts`, `src/ui/shell.css` |
| 9 | All text, number, select and color inputs are 44 px tall; the browser touch-size check now covers the Sprite tab's inputs and the Help sections. On screens up to 760 px tall the stage column is a little narrower, which gives the tab panel another row. Reset stage becomes icon-only in narrow columns instead of wrapping. | `src/ui/shell.css`, `tests/e2e/shell.spec.ts` |
| 10 | Ideas are ranked for the current level: an above-level idea loses 10 % per level, so a near tie goes to the same-level idea ("jump" at Starter shows the jump sound first and the Builder jump second) while a clear fit still wins ("camera follow me"). Inserting an above-level idea still switches the level, and the status line now says so. | `rankIdeas` in `src/guide/ideas.ts`, `src/main.ts` |
| 11 | The gallery is 1040 px wide at most, four columns at 1024, with filter chips (All, Guided builds, Games, Stories, Drawing, Music, Worlds, Sprites) and a search box; each entry carries a `kind`. | `src/guide/gallery.ts`, `content/gallery.json` |
| 12 | Every preview is rendered three ways by the previews spec: WebM (VP9), MP4 (H.264, which iPadOS plays everywhere) and a PNG still of the last frame. Cards list MP4 then WebM as `<source>`s with the still as poster, and fall back to the still if neither plays. Renderer version 2 re-rendered all 50 previews. | `tests/e2e/previews.spec.ts`, `tests/preview-key.ts`, `src/guide/card.ts` |
| 13 | HUD text scales with the stage it sits on (container query units) rather than the window, so the small editor stage keeps more of its picture. | `src/scene/play.css` |
| 14 | Unchanged: the AI helper stays unavailable at Starter until the owner decides. | — |

### 3.11 Fix flows from a block's warning, 2026-10-16

A block's **!** used to open Blockly's bubble with the compiler's sentence and nothing else. At Starter and Builder it now opens a non-modal popover (title in learner words, the message, **Fix it step by step** / **Not now**); Pro keeps the plain bubble. Starting a flow pins a Fix panel at the top of the Help tab, above the sections and any active guided build. The panel shows why the warning is there, the steps that clear it, a highlight on the palette category or editor button the step needs and an outline on the block, and a one-tap action where the fix is deterministic. Steps are recomputed from the project after every edit (a missing-sprite flow first offers the Sprite library, then "Use Ball 1 here" once a sprite exists), and the panel says **Fixed!** when the warning is gone.

| Warning | Flow | One-tap action |
| --- | --- | --- |
| `missing-input` | the slot is empty, drop a value or let the app fill it | 0, empty text or `true`, by the slot's type or name |
| `missing-sprite` (block) | pick a sprite, or add one first | Use ‹sprite› here · Open the Sprite library |
| `missing-sprite` (script) | choose the script's sprite in Event handlers, or add one | Open Event handlers · Open the Sprite library |
| `missing-costume` / `missing-backdrop` | pick an existing one | Use Bird / Meadow here |
| `missing-sound` / `missing-world` | pick one, or add one first | Use ‹name› here · Open Sounds & music / the World library |
| `inactive-draft` | the block is outside every script | Put it under "when game starts" |
| `event-context` / `wait-context` | live input and waits need an event script | Move Program into "when game starts" |
| `unresolved-symbol` | the variable is gone | Make a variable |
| `unresolved-call` | the function is gone | Remove this block |
| `flow-outside-loop` / `return-outside-function` | drag inside a loop or function, or remove | Remove this block |
| `multiple-programs` | two Programs | Merge into the other Program |
| `nested-program` / `nested-function` | scripts stay at the top | Move it out |
| `invalid-number` | not a Python number | Set it to 0 |
| a runtime error | Python stopped here | Show the fix idea (name, loop, keys) or Show the error |
| anything else | the compiler's message | Show the details |

Every action is one Undo step. Implementation: [fixes.ts](../src/guide/fixes.ts) (`fixFor` builds the flow from the current project; `installFixes` owns the popover, the panel and the warning-icon tap, which is intercepted before Blockly's gesture at the learner levels). Unit tests in [fixes.test.ts](../tests/unit/fixes.test.ts) run each action against compiled fixtures; [fixes.spec.ts](../tests/e2e/fixes.spec.ts) covers the popover, the Help panel, the library-then-pick sprite flow, the start-script wrap, Undo and the Pro bubble.

### 3.12 First guided lesson: Brick Breaker

Added 2026-10-18. A lesson is a guided build with more teaching in it. The design is the **Lesson 1 · Brick Breaker** row of the UX mocks canvas (boards L0–L7); the owner chose layout A, the Lesson tab, over the coach strip.

| Part | What shipped | Where |
| --- | --- | --- |
| Lesson engine | A build with `kind: "lesson"` has chapters, and each step can carry a one-line idea (`why`), a live checklist, two hints and a last rung, **Show me how**, which opens the step's idea card or adds the lesson's own blocks as one Undo step. Three new kinds of step: **Predict** (choose what will happen; a run counts only after choosing, and the card then says whether the guess was right and why), **Fix it** (the lesson writes a script with one thing missing, once, even across a reload; its last rung swaps in a working script) and **Play-test** (reach a score while the game runs, counted live). While a lesson is open the Help tab reads **Lesson**. | [builds.ts](../src/guide/builds.ts), [guide.css](../src/guide/guide.css) |
| Start and finish | Choosing a lesson opens a start sheet (preview, chapters, what you will learn). Starting keeps the current project in this browser instead of asking twice; **Return to my project** brings it back from the finish sheet or the Builds list. The finish sheet lists each chapter's idea, three remixes, the time against the plan, **Play again** and the next build. | [builds.ts](../src/guide/builds.ts), [main.ts](../src/main.ts) |
| Checks | New predicates: a block field's value (edges set to bounce), a number in an input (vertical speed 0), the sprite that owns a handler, a block with nothing after it (destroy last), the highest score reached in a run, and whether the learner predicted. | [checks.ts](../src/guide/checks.ts) |
| Content | Brick Breaker, Builder level, about 30 minutes, 12 steps in 6 chapters: Paddle, Ball, Bounce back, Brick wall, Breaking bricks, Win or lose. Paddle, brick and ball art are small PNGs embedded in the projects. It follows Talking story and leads to Jump quest; the finished game is in the gallery. | [brick-breaker.json](../content/builds/brick-breaker.json), [brick-breaker-game.json](../content/builds/brick-breaker-game.json) |

The lesson uses only existing blocks and runtime. A hidden template brick moves along while each copy is shown, so the wall needs no variables; one "when Brick overlaps Ball" script runs for every copy, with **destroy this sprite** last because destroying a sprite ends its script; a miss is "Ball y below −145" in an update script, because stage edges bounce on all four sides; the win waits until the score is 24.

Verification: [unit tests](../tests/unit/guidance.test.ts) check chapters, checklists, hints, predictions and last rungs, that the planted puzzle compiles but does not pass, that solutions resolve every placeholder, that the finished game ticks every static checklist item at the Builder level, and the new predicates. The [lesson browser test](../tests/e2e/lesson.spec.ts) walks all 12 steps with the hint ladder, idea cards and typed numbers: a run before predicting does not count, a reload keeps the planted script without planting it again, the play-test reaches 5 bricks, the game is played to its end, and the kept project comes back. A second test declines the lesson and leaves it.

Differs from the mocks: **Run code** is not locked before a prediction (the card asks to choose first instead); the loop trace (L5) and the "ran 3 times" badge (L6) are not built; the finish sheet has no **Export playable** button (it stays in the ⋯ menu) and the start sheet has no **Play the finished game** (the gallery has it); step 2 is a Build step with a run rather than a Play-test. Not measured: how long children take, and frame rate with 24 bricks on a tablet (the walkthrough plays the full game in desktop Chromium without event-queue errors).

### 3.13 Lessons: Flappy Flight and Super Hopper

Added 2026-10-19 at the owner's request ("flappy bird" and "something similar to super mario"). Both are Builder lessons built only from existing blocks; their art is new, original and embedded at 2× (a bird with two wing frames, a pipe pair, a city sky; a hero, a beetle, a coin, a full-height flag, grass, dirt, brick and stone tiles and a hills sky). The names avoid the games they are modelled on.

| Lesson | Chapters and steps | What it teaches |
| --- | --- | --- |
| Flappy Flight, about 25 minutes | Fall and flap (2), Pipes (2), Score (3), Win or lose (2) | Gravity as an acceleration and a flap as a set speed (predict the fall); a loop the lesson writes sends a pipe clone every 1.5 seconds, and the learner fixes it so each gap is at a random height ("a clone starts where its sprite is"); crashing into a pipe or the ground ends the game; the lesson writes a naive score script and asks what the score will do before it runs (it climbs about 30 times a second, because update scripts repeat), then the learner gives each pipe a memory with sprite data ("passed"); a play-test of three pipes; a win at ten with the Win screen idea. |
| Super Hopper, about 35 minutes | Run (3), Jump (1), Coins (2), Pits (1), Beetles (2), The flag (2) | Gravity onto solid tiles (predict the landing), arrow-key running with the camera following through a world five screens wide (the world's saved camera follows the Hero, so no Pro camera blocks are needed), facing left and right, jumping only when grounded (predict the second press in the air); a script the lesson writes puts 12 coin clones in the level and the learner makes them collectible; a fall below the world costs a life; beetles patrol between stone blocks with **bounce** on wall collision and a clone copies the patrol (predict the turn-around); **if … else** decides between a stomp (the Hero's vy is below 0) and an ouch; touching the flag wins. |

Order: Talking story → Brick Breaker → Flappy Flight → Jump quest → Super Hopper → Maze run, so the platformer lesson follows the shorter jumping build. Lessons are listed first in Lessons and Help.

Engine fix found while play-testing: a body with gravity walking along a row of solid tiles stopped dead whenever its edge landed exactly on the seam between two tiles, because the next tile's corner counted as a wall at the same moment as the floor below. Simultaneous hits now treat such a corner as part of the surface it lines up with ([physics.py](../src/runtime/physics.py) `seams`), with a native regression test. The planted-script note now reads "Read it before you run it" on a Predict step and keeps "One thing is missing" for Fix it.

Verification: the [unit tests](../tests/unit/guidance.test.ts) apply every lesson check to both lessons (finished games compile at Builder and tick every static item; every plant compiles without passing; every solution resolves its placeholders). The [lesson browser tests](../tests/e2e/lesson.spec.ts) walk both lessons with the hint ladder, predictions and idea cards and play them: Flappy's play-test flies through three pipes with a player that watches the stage pixels, and Super Hopper's collects five coins and ends by falling into the first pit three times. Outside the suite, play bots won Flappy Flight (ten pipes) and reached Super Hopper's flag. Not measured: how long children take, or how hard the level is for them.

### 3.14 Lessons for young readers, 2026-10-19

The owner asked for a pass on the lessons for children: fewer programming words, easier words, and more tips, pop-ups, pictures and icons. The three lessons keep their steps, checks, planted puzzles and solutions; what a learner reads and sees changed.

| Part | What changed | Where |
| --- | --- | --- |
| Words | Every step of Brick Breaker, Flappy Flight and Super Hopper was rewritten for readers of about 7–10: a goal of a few words ("Make the bird fall"), one or two short sentences about what happens on screen, and the checklist as a "Do this:" list of actions. Summaries, chapter ideas, guesses, hints, finishes and remixes follow suit. Script, handler, loop, event, velocity, acceleration and integer are gone from the lessons' own sentences; words printed on blocks (vx, vy, ay, clone) stay, as word cards. Step kinds read Build, Guess first, Fix the bug and Play it; the card says "We made these blocks for you, but there is a bug", "You guessed it!", "Do everything on the list to go on". A unit test keeps it that way: no listed jargon outside block pictures and word cards, sentences of at most 24 words, a short title and a block picture in every step. | [content/builds](../content/builds), [builds.ts](../src/guide/builds.ts) |
| Block pictures | `((Physics|set sprite Bird vy to 300))` draws the block to find as a small block in its palette category's colour, with the category's symbol; a `when …` block gets a hat's rounded top. Steps, hints and the checklist use them instead of quoted block text. | [ui-refs.ts](../src/guide/ui-refs.ts) |
| Word cards | `<<gravity|ay>>` makes a word a dotted-underlined button; tapping it opens a card beside it with a picture drawn from the library art and one or two short sentences. Twenty-one words: sprite, stage, x, y, vx, vy, ay (gravity), clone, repeat, random, when … updates, when … overlaps, sprite data (a note), this sprite, solid, camera, grounded, if … else, destroy, bounce and costume. Escape or a tap elsewhere closes it, and focus goes back to the word. | [words.ts](../src/guide/words.ts), [pop.ts](../src/guide/pop.ts) |
| Key caps | `[space]`, `[←]`, `[→]` show keys as keys. | [ui-refs.ts](../src/guide/ui-refs.ts) |
| Clips | 17 steps have a short recording of what they make, shown as "Watch: this is what you are making" under the step's words. On a Guess-first step it appears only after the guess has been run, under the answer ("Watch: this is what happens"). Each is recorded by the preview suite from the step's own project, which [a unit test](../tests/unit/lesson-steps.test.ts) builds step by step the way "Show me how" does (and which checks that every step passes once its blocks are in). Still frames stand in with reduced motion; 1.6 MB in all. | [previews.spec.ts](../tests/e2e/previews.spec.ts), [public/lessons](../public/lessons) |
| Coach | When a step starts, the Chick points at the highlighted palette category with a few words ("Gravity is in Physics. Tap it!"); tapping the category, or anywhere else, closes it. | [builds.ts](../src/guide/builds.ts) |
| Tips | A block left loose on the workspace for a few seconds gets "This block is loose, so it will not run. Snap it under a when … block!". Running a step played with keys says "Tap the game first, then tap [space]" beside the stage (not on touch screens, where the game's buttons appear). | [builds.ts](../src/guide/builds.ts) |
| Cheers | When a lesson step is done, a cheer ("You did it!", "Awesome!"…) with a burst of stars and its own Next step button appears above Next step; it waits for a key tip to be closed first. No stars with reduced motion. | [builds.ts](../src/guide/builds.ts), [guide.css](../src/guide/guide.css) |
| Read to me | A button beside the step's goal reads the goal, the words and the Do this list aloud with the browser's own voice, and stops when pressed again or when the step changes. | [builds.ts](../src/guide/builds.ts) |
| Why | The idea behind a step waits behind "Why does it work?", so the card stays short. | [builds.ts](../src/guide/builds.ts) |

Guided builds get the same card, tips and word buttons; their text, already Starter-level and short, was not rewritten in this pass. Verification: [unit tests](../tests/unit/guidance.test.ts) for markup, word cards and reading level; [the step-by-step test](../tests/unit/lesson-steps.test.ts); [browser tests](../tests/e2e/lesson-help.spec.ts) for the coach, block pictures, word cards and focus, the Why toggle, the cheer and its Next step, the clip after a guess, the key tip and the loose-block tip; and the three [lesson walkthroughs](../tests/e2e/lesson.spec.ts) with the new wording. Not measured yet: whether children read the cards, open the words, or finish faster.

### 3.15 Code Puzzles: a lesson of small programming problems (built 2026-10-20)

The owner asked for a lesson on light competitive programming before Track C. It is also a pilot for Track C's practice problems and the dynamic checking of §4.4: a program is given an input, prints an answer, and a checker runs it on several tests.

**What a learner does.** Eight short puzzles, each a little story with an input and an answer. The learner builds a program in a **Program** block that reads the input, works out the answer and prints it; **Try it** runs it on an example and shows what it printed beside the answer wanted; **Check my answer** runs it on every test and ticks each one. All tests passing finishes the puzzle. Hints, then Show me how, as in the other lessons.

| # | Puzzle | Idea | Example input → answer |
| --- | --- | --- | --- |
| 1 | Say hello: greet a visitor by name | read a line, join text | Ana → Hello, Ana! |
| 2 | Coin bags: coins in two bags altogether | read numbers, add | 3, 5 → 8 |
| 3 | Taller tower: the taller of two crate towers | if … else | 7, 4 → 7 |
| 4 | Staircase: bricks for a staircase of n steps (1 + 2 + … + n) | a counting loop that adds up | 4 → 10 |
| 5 | Countdown: the rocket counts n down to 1, then Liftoff! | a loop that counts down, many lines | 3 → 3, 2, 1, Liftoff! |
| 6 | Buzzing bees: 1 to n, Buzz for multiples of 3 | remainder, if … else | 6 → 1, 2, Buzz, 4, 5, Buzz |
| 7 | High score: the highest of n scores | read in a loop, keep the best | 3; 4, 9, 2 → 9 |
| 8 | Gem pairs: how many of n gem piles split into pairs (are even) | count with if and remainder | 4; 1, 2, 3, 4 → 2 |

**What it needs.**
- Input blocks (Builder, in Text): **read a number** (`int(input())`) and **read a line** (`input()`), one value per line, so no list blocks are needed. The Python bridge reads them back.
- Programs that run with input: the worker gives `input()` the lines of the input; reading past the end says "Your program read more lines than the input has" with the block that did it.
- A checker module: runs the compiled program once per test in the ordinary worker, with a time limit, collects what it printed, and compares line by line (spaces at the ends ignored). Track C reuses it.
- A puzzle step kind in lessons: story, examples, tests, a checker-backed check, results in the lesson card (Input, What you printed, Answer wanted), the cheer when all pass.
- Content: the eight puzzles with 4–6 tests each (including small and edge cases), hints, a reference program per puzzle that a test runs against every test.

**Decisions (proposed).** (1) Input is read line by line with read blocks, as in competitive programming, rather than writing a function that returns the answer. (2) Every test shows its input and answer when it fails, so children learn from it; no hidden tests in this lesson. (3) Run code uses the first example as input, so the ordinary Run still works; Try it lets the learner type their own. (4) Builder level, about 35 minutes, listed in Lessons after Super Hopper. (5) The stage shows the puzzle's picture from the library art with the Chick as the judge, cheering when tests pass.

**As built.** The owner accepted every proposed decision. What shipped:

| Part | What | Where |
| --- | --- | --- |
| Read blocks | **read a number** and **read a line** in Text (Builder and Pro), in the Text category's colour; Python `int(input())` and `input()`, read back by the bridge. Language version 23 (1–22 still open). Reading past the end says "Your program read more lines than its input has"; text where a number was wanted says "A read a number block got 'abc', which is not a whole number" (only for a read block's own `int(input())`; other `int()` calls keep Python's words). | [core blocks](../src/blocks/core/index.ts), [compiler.ts](../src/language/compiler.ts), [core-converter.ts](../src/bridge/core-converter.ts), [execution.py](../src/runtime/execution.py) |
| Input for runs | A run can be given input (`stdin`); Run code in a puzzle reads the Try it box, which starts with the first example. | [runner.ts](../src/runtime/runner.ts), [python.worker.ts](../src/runtime/python.worker.ts), [main.ts](../src/main.ts) |
| Checker | `checkProgram` runs a compiled program once per test in one worker of its own (Python starts once; all tests take about a second), each with its own input and printed output, bounded like the page's output, and streams each test's result; a test that never ends is caught by the run's time limit and named. Answers are compared line by line, ignoring spaces at line ends and blank lines at the end. A project that cannot be checked (blocks with errors, no Program, or blocks in "when …" handlers) says why. | [checker.ts](../src/guide/checker.ts), `check_program` in [execution.py](../src/runtime/execution.py) |
| Puzzle steps | A lesson step may be a puzzle: its examples (input and answer wanted), **Try it** (your input, what your program printed, and whether it is the answer wanted), **Check my answer** (each test ✓ or ✗; the first failing one open with its input, what was printed or the error, the answer wanted, and a tip: the test's own, or one from what was printed), a `solved` check, and the cheer. The progress line reads "Puzzle 2 of 8". Each puzzle after the first starts with an empty Program block (one Undo step), and Show me how fills the Program block. Lesson solutions may now make the variables they use. | [builds.ts](../src/guide/builds.ts), [recipes.ts](../src/guide/recipes.ts), [checks.ts](../src/guide/checks.ts) |
| Pictures | Each puzzle's picture, drawn from the library art, lies over the stage while its step is open, with the Chick as the judge, who turns happy when every test passes. The Lessons card and start sheet show a picture of all eight. | [puzzle-art.ts](../src/guide/puzzle-art.ts), [lessons.ts](../src/guide/lessons.ts) |
| Words | Word cards for input, print, variable and remainder. | [words.ts](../src/guide/words.ts) |
| Content | Code Puzzles, Builder, about 35 minutes, three chapters (Read and print, Repeat, Keep track), 38 tests in all; Maze run's Next now leads to it. | [code-puzzles.json](../content/builds/code-puzzles.json) |

Verification: [the step-by-step test](../tests/unit/lesson-steps.test.ts) builds each puzzle's answer the way Show me how does and runs the generated Python with real Python on every test; [native tests](../tests/python/test_execution.py) cover the check mode, per-test input and output, the friendly read errors and the output bound; [browser tests](../tests/e2e/puzzles.spec.ts) solve all eight puzzles through the checker, show a failing check with its tip, and run Try it and Run code with typed input, including reading past its end. Not measured yet: how long children take, or which puzzles they get stuck on.

### 3.16 Finding a block in the picker (built 2026-10-20)

The owner found blocks hard to find: a hint names a block, and the learner still reads every block in the category to find it. Three changes, with the owner's choices (a caption above each block; a search box at the top of the palette, at Pro):

| Part | What | Where |
| --- | --- | --- |
| Captions | Above every block in a category's picker, a bold caption: a green number bubble at its left (1, 2, 3 … in that category at that level) and the block's keyword, such as "9 jump if grounded at speed". Keywords are chosen by hand where the block's own words do not say what it is for ("set speed or gravity", "repeat forever", "Program: runs top to bottom"); other blocks use their own words without "sprite" and inputs. A variable's blocks are captioned with its name. Group headings (Repeat, Decide) stay. | [block-captions.ts](../src/ui/block-captions.ts), [levels.ts](../src/ui/levels.ts) |
| Numbers in hints | A block picture in lesson text shows the same number before its icon: `((Physics#scene_motion_set\|set sprite Bird ay to −900))` names the block (its type, `hat:start` for a "when …" block, `controls_if:else`, or `game_set:FIELD=lives` for one choice of a menu). At a level where the block is in another category (Pro keeps "at stage edge" in Physics, not Motion), the picture shows that category's colour, icon and number, and it changes when the level does; a variant that level does not offer is found as its plain block. | [ui-refs.ts](../src/guide/ui-refs.ts), the lesson files |
| Search (Pro) | A **Find a block** box at the top of the palette. Typing shows the matching blocks of every category in the picker, ready to drag, each captioned with its category, its number there and its keyword ("9 Physics · jump if grounded at speed"); blocks whose keyword matches come first. Words match a block's keyword, its own words, every menu choice, its tooltip and its category. Escape or choosing a category leaves the search. Starter and Builder keep the plain palette; the magnifier's search on the editor is unchanged. On short tablets (up to 760 px high) Pro's category rows are a little tighter, so all of them still fit in two columns below the box. | [palette-search.ts](../src/ui/palette-search.ts), [shell.css](../src/ui/shell.css) |

Verification: [the step-by-step test](../tests/unit/lesson-steps.test.ts) checks every block picture in every lesson resolves to a number in the category it names at the lesson's level, and somewhere in Pro's palette, and that captions number a category 1 … n with one per block; [browser tests](../tests/e2e/block-picker.spec.ts) read captions and bubbles, match a lesson's numbers with the picker at Builder and after switching to Pro, and search, drag a found block and leave the search at Pro.

### 3.17 Room for the lesson (built 2026-10-20)

The owner found the Lesson panel too small in Blocks view: it sat under the stage, its buttons, the sprites and the tabs, and got 214–328 px on common windows, while one step was about 813 px tall. Design boards W0–W3 measured it and proposed three layouts; the owner chose A, a small stage while building, with a card that shows one moment at a time.

| Part | What | Where |
| --- | --- | --- |
| Small stage while building | In a lesson, in Blocks view on a screen at least 900 px wide, the stage is a window (56% of the column) beside the sprites; Sprites, Paint and Sounds become icons, and the stage's buttons wait until the game runs. Run code gives the game the full stage; a press on the blocks or the palette makes it small again. A button on the stage swaps the sizes, and a stage made big that way stays big until made small. A puzzle's stage stays small. Free play, Stage view and narrower screens keep the usual stage. The lesson gets 464–601 px instead of 214–328. | [lesson-stage.ts](../src/ui/lesson-stage.ts), [shell.css](../src/ui/shell.css) |
| One moment at a time | **Build:** the goal and the list; the guess waits until the blocks listed before it are in. **Guess:** the finished items fold into one line ("Your blocks are in. Now guess!") and the guesses sit two by two. **What happened:** only the guess and the answer stay, with what happened and Next, under "All done!". A step that asks for the guess first (Brick Breaker's How to win) shows it first. A new moment starts at the top of the step. | [builds.ts](../src/guide/builds.ts), [checks.ts](../src/guide/checks.ts) |
| A shorter card | One frame instead of two; no "Do this:" label; Watch, Read to me and Why are round buttons by the step's title; Leave lesson sits by the progress; Back, the hint button and Next share one row; a hint shows above them until the blocks are in or the step is done; "Do everything on the list" is read by screen readers only. | [builds.ts](../src/guide/builds.ts), [guide.css](../src/guide/guide.css) |
| Clips on the stage | A step's clip plays over the stage (twice, then the stage comes back; a tap closes it) instead of a 290 px video in the card. A build step plays it as it opens; a Guess-first step offers Watch once the guess has been run. Run code closes it. With reduced motion the still frame shows for five seconds. | [builds.ts](../src/guide/builds.ts) |

Measured with Flappy Flight's first step: the build moment is 281–351 px and the guess 400–416 px on windows from 1024 × 768 to 1440 × 900, so both fit without scrolling; while a game runs the lesson has its old room, and the result and Next fit in it. Verification: [browser tests](../tests/e2e/lesson-room.spec.ts) check the small stage beside the sprites, each moment fitting at 1180 × 820, 1080 × 700, 1366 × 768 and 1024 × 768, Run code and the blocks switching the sizes, the stage button keeping it big, puzzles and Stage view, and leaving the lesson; the lesson walkthroughs and [lesson help](../tests/e2e/lesson-help.spec.ts) cover the clip on the stage.

### 3.18 An icon sweep, block pictures in their own colours, and a logo (built 2026-10-20)

The owner asked for icons on the buttons still without one, block pictures that match the picker, steps that name a block's container before what goes in it, and a more artistic logo than "pb".

| Part | What | Where |
| --- | --- | --- |
| Icons | A browser sweep listed every visible button without an icon. Now: Back ←, Next step →, Give me a hint and the Ideas section (a new lightbulb), Leave lesson or unit (a new door), Start, Continue, Start lesson and Play ▶, Play the result (a game pad), Close ×, Try another one ↻, For grown-ups (a new pair of people), Export and Import, Find ideas, Side by side, and the tabs: Sprite, Python, Output, and Help, which shows a graduation cap while it reads Lesson. What is left without one is a value (zoom 100%) or a colour swatch. | [icons.ts](../src/ui/icons.ts), [icon-art.ts](../src/ui/icon-art.ts) |
| Block pictures | A block picture in lesson text takes the block's own colour and symbol from the block's definition, the same data the picker draws it with, not its category's: "repeat while true" is green like the block, not Control's brown, and "when game starts" shows its flag. A test checks every picture in every lesson against its block. | [block-icons.ts](../src/ui/block-icons.ts) `blockLook`, [ui-refs.ts](../src/guide/ui-refs.ts) |
| Order | Steps say where a block goes before what goes in it: Flappy Flight adds set sprite Pipe y first, then puts the random number in its hole; Code Puzzles' Gem pairs adds the if first, then the remainder in its test; 1.3's Meet Robot uses move to x y first, then fills its holes. | lesson files, unit 1.3 |
| Logo | An original mark: a snake made of code blocks, curled into an S, with a blocky head, on the app's teal. It is the top bar's home link, the favicon, and the touch icon; it still reads as an orange S at 16 px. | [logo.svg](../src/ui/logo.svg), [index.html](../index.html), [apple-touch-icon.png](../public/apple-touch-icon.png) |

### 3.19 Games with levels (built 2026-10-20)

The owner asked whether a game could have levels, then for the three gaps found: a block to go to the next level, the level on the HUD, and a lesson, with levels at Builder too.

| Part | What | Where |
| --- | --- | --- |
| Next world | **next world** goes to the world after the current one in the project's list, and after the last one back to the first, as **next backdrop** does; from the base stage it goes to the first world, and a project with one world starts it again. `scene.next_world()` in Python. | [worlds.py](../src/runtime/worlds.py) `next`, [scene.ts](../src/blocks/scene.ts) |
| Level | **game level** is the current world's number, from 1 (0 on the base stage of a project with worlds, a title screen; 1 in a project with none). It follows the world, so there is no set or change for it. **show level on HUD** puts *Level 2* before the score. | [game.py](../src/runtime/game.py), [game.ts](../src/scene/game.ts) |
| When a world starts | A new "when" block, **when any world starts** (or one world, by name): when the game starts in a world, and each time it switches to one. It shows once the project has a world. It is the place to put a hero back at the start and to make a level's coins. | [hats.ts](../src/language/hats.ts) |
| Builder | Several worlds are now a Builder tool: Builder's Game has a Levels group (next world, switch to world, restart current world, current world, show level, game level), and Worlds & tilemaps, Starting world and Belongs to show at Builder. Tiles and the camera blocks stay in Pro's Worlds. | [levels.ts](../src/ui/levels.ts), [world-editor.ts](../src/scene/world-editor.ts) |
| Lesson | **Level up**, Builder, about 30 minutes, after Super Hopper: 9 steps in Start (1), Next level (2), Coins (2), Your level (1), The end (3). It starts from the finished Super Hopper with a cave Level 2 already made: a world script puts the Hero back on the left, the flag goes to the next world (guess what Level 2 looks like: no coins, because clones stay in their own world), the HUD shows the level, the coins and beetles move into the world script, play into Level 2, **Duplicate world** makes Level 3 (a copy of "Level 2" is named "Level 3"), guess what the last flag does (back to Level 1), win on Level 3 with if … else, and play all three. The finished game has a snowy Level 3 and is in the gallery. A new word card explains a world as one level. | [level-up.json](../content/builds/level-up.json), [level-up-game.json](../content/builds/level-up-game.json) |
| Lesson tools | Show me how can move blocks out of a starter script (it takes away the scripts it names, by name, so it works after an earlier Show me how replaced them) and can make a new level (the same Duplicate world the editor uses). A step that is only a guess and a run needs no Show me how. | [builds.ts](../src/guide/builds.ts) |
| Lesson stage | The small stage in a lesson has no toolbar, so after a game nothing could be edited (Reset stage was hidden). When the stage steps back to small, it now goes back to its starting layout, as Reset stage does. | [lesson-stage.ts](../src/ui/lesson-stage.ts) |

Engine fixes found while testing the lesson: (1) a world switch cleared contact tracking, so a global hero still standing on a global flag "started touching" it again in the new world before its world script moved it, and skipped a level; global sprites that stay touching now stay in contact across a switch. (2) Two touches in the same moment (the flag and a coin) both ran the flag's script, the second after the first had switched worlds; a contact from an earlier world is now skipped when its script would start, not only when it is queued. Both are in the [worlds contract](worlds-tilemaps-and-cameras.md).

Verification: [Python tests](../tests/python/test_worlds.py) for next world, the level and both fixes; a [unit test](../tests/unit/level-up.test.ts) plays the finished game with the scripted player (each flag goes on, the Hero starts on the left with new coins, the last flag wins) and the starter (the flag still wins on Level 1); the lesson unit tests build it step by step, and the [browser test](../tests/e2e/lesson.spec.ts) walks all nine steps, including Duplicate world at the Builder palette's level and playing through three levels to the win.

### 3.20 Arcade examples (built 2026-10-21)

The owner asked for more examples: a Pac-Man, a Space Invaders and other old arcade games. Five are in Examples, with original names and art (as the lessons avoid the games they are modelled on), each a finished game to play and change, with three things to try.

| Example | Level | What it shows |
| --- | --- | --- |
| Maze Muncher (Pac-Man) | Pro | A maze painted with the new maze walls and dots as tiles. The muncher moves a square at a time with a wanted direction it takes at the next crossing (so a key can be pressed early), and eats the dot tile it stands on. Four ghost sprites of kind ghost choose, at each crossing, the way nearest the muncher (with a little chance), never turning back, and run the other way and slower while scared. One game loop moves everything; functions open_at, at_center, eat, move_muncher, move_ghost, caught and reset, a list of the four ways, sprite data per ghost, and tiles of to count the dots. |
| Sky Defenders (Space Invaders) | Builder | Three rows of eight alien clones, each row with its own animation, march together: one loop moves every alien of kind alien, and when one reaches the edge they all turn and drop. A single laser (a sprite, shown when fired), bombs as clones that fall, score and lives. |
| Rock Blaster (Asteroids) | Builder | The ship turns and flies with the arrows (move in its direction), a wrap function brings it and the rocks back from the other edge, and a rock hit by the shot splits into two smaller clones flying off in new directions. A new wave comes when every rock is gone. |
| Snake | Builder | The head moves a square at a time; the body is a trail of pieces fired with no speed and a lifetime as long as the snake, so the snake grows by making the pieces last longer. Touching anything but the apple ends the game. |
| Moon Lander | Builder | Moon gravity (ay −40) and an engine that pushes up while fuel lasts, side thrusters, and a landing that counts only on the pad and slowly. |

New library art for them (Characters, Objects, Tiles and a Moon backdrop) is in the library for every project: [arcade.ts](../src/art/arcade.ts). The projects are built from blocks with the editor's own functions (so every block is real) and checked by a [unit test](../tests/unit/arcade.test.ts) that plays each one with the academy's scripted player: the controls do what they say, nothing fails, and each can be lost.

## 4. Track C: academy

### 4.1 Model

Beast Academy teaches through a comic-style guide in which characters discover an idea, followed by practice sets that ramp from routine to starred challenges, organized by level and chapter. The analog here:

| Beast Academy | Python Blocks Academy |
| --- | --- |
| Level (grade band) | Level 1–7, each a game genre and a concept family |
| Chapter | Unit: one concept, one small game or mechanic |
| Guide comic | Interactive guide: a short in-editor story in which the stock cast (Fox, Robot, Rabbit, Turtle, Bee) hits a problem in a game and the learner helps, with prediction questions in the dialogue |
| Practice book | Practice set: predict, fix, complete and build problems checked automatically, three difficulty tiers, starred challenges |
| Puzzles and games in the book | The game itself: the unit's mechanic is played before it is built |
| Review and assessment | Unit mastery check plus a level capstone game with a rubric |

The pedagogy is Use-Modify-Create and PRIMM (predict, run, investigate, modify, make): every unit starts by playing a finished game, moves to predicting and editing, and ends with building. The learner pilot tasks already follow this shape.

### 4.2 Curriculum map

Everything in the table uses features that exist today, except where marked **needs**.

| Level | Theme and genre | Concepts | Python the learner reads | Capstone game | Needs |
| --- | --- | --- | --- | --- | --- |
| 1 Signals | Interactive story and tap games | sequence, events, coordinates, say, costumes, sounds | `def on_key(...)`, calls with arguments | Greeting card that reacts to taps and keys | Track A hat blocks |
| 2 Loops | Pen art and endless runners | repeat, forever/update, nested loops, counting with range, animation loops | `for i in range(4):`, `while True` with `await wait` | Pattern painter and a scrolling dodge game | — |
| 3 Decisions and memory | Collect-and-dodge games | if/else, comparisons, booleans, variables, score and lives, random, collisions | `if score >= 3:`, `score = score + 1` | Star catcher with levels | — |
| 4 Functions | Shooters and Pong-style games | define/call, parameters, return values, decomposition, scope | `def spawn(x, y):`, `return distance` | Pong or a wave shooter with spawn and reset functions | Animated enemy set |
| 5 Collections | Quiz, inventory and wave games | lists, indexing, iteration, dictionaries, data-driven levels, high-score tables | `enemies.append(e)`, `for e in enemies:`, `levels[n]` | Quiz game or tower-defense waves defined by data | — |
| 6 Recursion | Fractals and mazes | recursive drawing, recursive countdown, maze generation, flood fill on a tilemap, base cases | `def tree(n): ... tree(n - 1)` | Maze explorer with a recursively generated maze | Tile query API already exists; needs a larger map limit check |
| 7 Algorithms | Dungeon and strategy games | linear and binary search (guessing game), sorting a leaderboard, breadth-first pathfinding on tiles, state machines for enemy AI, probability and simulation, counting steps as a cost | `while lo <= hi:`, a sort, a queue-based BFS | Dungeon chase: enemies that path-find to the player | Queue helper block or recipe; step-count reporter for cost intuition |
| 8 Systems (stretch) | Multi-script games and text Python | async coordination, messages, modules, higher-order functions, lambdas, editing Python text directly | `await`, `emit`, `map`/`filter`, module imports | A game built from modules with at least one text-edited function | The bridge is complete; needs Builder/Pro level |

Each level has four to six units. Across levels the Python side of the editor grows in prominence: Levels 1–2 show Python as a read-only mirror, Level 3 asks prediction questions about Python lines, Level 5 presents some problems as Python first with blocks as the check, and Levels 7–8 require small text edits through the existing draft and Apply flow.

### 4.3 Unit anatomy and problem types

| Part | Content | Check |
| --- | --- | --- |
| Play | The unit's finished game, loaded read-only in play view with "what to notice" prompts | played to finish |
| Guide | Four to eight dialogue panels over the stage with the cast; each panel can show a block stack, run it, and ask a prediction | prediction answered |
| Practice: predict | "What prints?" or "Where does the sprite end up?" with multiple choice or a number | exact answer |
| Practice: fix | A broken project with one or two bugs and an expected behavior | static plus dynamic check |
| Practice: complete | A Parsons-style problem: given blocks are scattered or a slot is empty | static structure |
| Practice: build | A short specification with starter project | dynamic check with scripted input |
| Challenge (starred) | Open-ended extension with a rubric and an optional self-check | rubric checklist |
| Mastery | Three randomly chosen practice variants at the top tier | pass two of three |

Practice problems are parameterized templates (repeat counts, positions, names), so a bank of 60 templates per level yields hundreds of variants and supports retries without repetition. Beast Academy's online version is built on this kind of variation.

### 4.4 Automatic checking

Three check kinds, all built on existing pieces:

- Static: predicates over `compile()` output and the scene state (block present, nesting, handler kind, variable used in a condition, function with two parameters, recursion present). The guided-build engine of section 3.4 defines the same predicates.
- Dynamic: run the learner's project in the ordinary worker with scripted input through the existing test-event path and the play-input layer (key press sequences, pointer positions, answers to questions), with a time bound, then assert on watch values, game state, printed output or sprite positions. The runner already exposes watchers, game snapshots and completion. Package this as a `checker` module that the browser tests also use.
- Prediction: multiple-choice or numeric answers compared locally; the correct answer is produced by running the reference solution through the checker at authoring time, never typed by hand.

Hints are authored per problem as a ladder (nudge, concept, step, show-me) and surface through the Help tab. Hint ladders are the right place for AI later: the model picks a rung, the app shows the authored text.

### 4.5 Progress, mastery and a parent view

Progress is a small JSON record per browser (unit, problem id, attempts, passed, time) stored next to the autosave key, exportable as a file so a family or classroom can move it. A parent view lists units, mastery and time per week and links to the learner's capstone projects. Accounts and cloud sync remain a release-phase decision; the data model should not assume a single device, so records carry a learner ID the family chooses.

### 4.6 Authoring pipeline and volume

Content lives in `content/academy/<level>/<unit>/` as unit JSON, fixture projects, reference solutions and problem templates. A test renders every unit, runs every reference solution through the checker, and asserts every problem has a passing solution and a failing starter. Volume for a first course: Levels 1–3, four units each, about 12 units, 150 problem templates, 3 capstones. Levels 4–7 follow once the first three have been used by learners.

### 4.7 Phases and acceptance

| Phase | Work |
| --- | --- |
| C1 | Unit runtime in the Help tab (guide panels, problem cards, checker, progress record); Level 1 unit 1 end to end |
| C2 | Levels 1–3 content, capstones, parent view; informal trial with one learner |
| C3 | Levels 4–5 (needs animated assets and the data-driven level helpers) |
| C4 | Levels 6–7 (queue and step-count helpers, maze and pathfinding units) |
| C5 | Level 8 and the text-Python arc |

Acceptance: a learner can play, read, practice and build through a unit without facilitator help; every reference solution passes and every starter fails its checker in CI; a Level 3 capstone built by a learner runs as an exported playable; one learner completes Levels 1–3 and the recorded confusions feed the next revision.

### 4.8 C1 as built (2026-10-20)

The owner chose: an Academy button of its own; the eight steps called **chapters** (Chapter 1 · Signals …), with later books to revisit topics in depth; progress kept in the browser with a file to export; and the runtime with one unit, 1.1, to review before more units are written. What shipped:

| Part | What | Where |
| --- | --- | --- |
| Academy map | A top-bar **Academy** button opens the map: eight chapters, each with its units (1.1 ready, the rest "Soon"), a progress dot per unit (started, done, ★ mastered), the selected unit's parts with steps done, Start or Continue (to the first step not done), a Continue card for the latest unit, and the learner's name. | [academy.ts](../src/academy/academy.ts), [chapters.json](../content/academy/chapters.json) |
| Unit runtime | A unit is a build of kind `unit` run by the lesson engine, in the lesson panel with the small stage: parts Play, Guide, Practice, Challenge and Mastery as its chapters ("Practice 3 of 9 · Fix the bug"). New step features: a step's own **project** (each problem starts fresh; **Start over** reloads it and its scripts), a **quiz** answered on the spot (a wrong guess explains, then **Try another one** shows another version), a **game** check, a guide **panel** (the cast in speech bubbles over the stage until the program runs), **mastery** (one try, no hints), and **variants** (other names and numbers; a mastery problem picks one by chance). Recipe parts can leave blocks loose, or a "when" block empty, for put-it-together problems. | [builds.ts](../src/guide/builds.ts), [recipes.ts](../src/guide/recipes.ts) |
| Game checker | **Check my answer** plays the learner's game with a scripted player — tap a sprite, press a key, wait — and judges what the sprites say, think and wear, where they are, and the score, lives or result. Each check shows ✓ or ✗ with what was seen instead ("Fox said nothing."). It runs in a worker of its own, in Python, so the same code runs in the CPython tests. | [checks.py](../src/runtime/checks.py), `check_scene` in [execution.py](../src/runtime/execution.py), [checker.ts](../src/guide/checker.ts) |
| Progress | Per browser and learner name: for each unit step, done, tries, right answers, hints and time; a unit's finish. Mastered means two of the three mastery problems right. **For grown-ups** shows time this week, units started and mastered, and per unit the steps done, mastery, hints and time, with **Export progress file** and **Import progress file** (checked before it replaces anything). | [progress.ts](../src/academy/progress.ts), [academy.ts](../src/academy/academy.ts) |
| Unit 1.1 · Tap and it talks | Starter level, about 25 minutes, Fox and Robot (and Rabbit) on the Hills. Play the finished talking card; Guide: signals, top to bottom, costumes (three guesses) and a key as a signal (a build); Practice: nine problems in three tiers (three guesses, two put-it-togethers, a fix, three builds, from "Snap it in" to "Space party", where two sprites talk at once); a challenge with a self-check list; Mastery: three problems, one try each. A word card for *signal*. | [unit-1-1.json](../content/academy/units/unit-1-1.json), [words.ts](../src/guide/words.ts) |

Verification: [the content test](../tests/unit/academy.test.ts) runs every checked problem, in every version, through the same scripted player under CPython ([scene_check.py](../tests/python/scene_check.py), on a virtual clock): each starts failing and passes with its answer; it also checks the map against the units, quiz answers, mastery, and that every block picture, control and word resolves. [Python tests](../tests/python/test_checks.py) cover taps, keys, waits, timed speech, a game that ends early and errors. [Browser tests](../tests/e2e/academy.spec.ts) cover the map, starting a unit, a quiz with another version, a failing then passing check and Start over, mastery's one try and the finish sheet, the guide panel, and the grown-ups' view with export and import. **Units 1.2–1.4 (built 2026-10-20).** Chapter 1 is complete:

| Unit | What | Practice and checks |
| --- | --- | --- |
| 1.2 · Keys move things | Arrow keys as signals; change x and y; plus and minus are opposite ways; a jump (up, wait, down) and a glide. | Nine problems from "Five presses" to "Glide": the checker presses keys and reads x and y, and checks a glide twice, on its way and where it lands. |
| 1.3 · Where is x, y? | The middle is x 0, y 0; x is left and right, y up and down; move to x y, set just x or y; glide; go to where another sprite is. | Guide panels write the places on the stage. "Meet Robot" is checked with Robot moved first (a `place` step), so typing Robot's old numbers does not pass. |
| 1.4 · Big project: Greeting card | Play a card made for Sam, build your own a part at a time (hello at the start, friends who talk when tapped, Bee flying in, a hop on a key, a costume surprise), then make it yours with a self-check list. | No practice or mastery: the steps build one card, each checked by its blocks; finishing the big project is its star on the map. |

The runtime grew with them: the checker can move a sprite before it checks (`place`) and check a place as x and y together (`at`); an academy step's work is kept while the learner looks at other steps and put back on return (Back to Play in the big project no longer loses the card); a step already done does not ask to be done again after Back; and the CPython checker reads time from its virtual clock, so glides are judged there as in the browser. Each unit has its picture on the start sheet.

Not built yet: quiz answers are written by hand rather than produced by running a reference; the parent view's "stuck on" summary; a big project's card is kept while it is open and across page reloads, but Continue after leaving it for another unit starts the card again.

## 5. Track D: assets

### 5.1 Current inventory and limits

| Kind | Today | Limit |
| --- | --- | --- |
| Costumes | 4 built-ins (Bird, Star, Ball, Box) plus 16 code-drawn stock costumes in [src/scene/stock-art.ts](../src/scene/stock-art.ts), all single frame, 64 px, no facing direction | 24 custom costumes per project, 256 × 256 px, embedded PNG data URLs |
| Backdrops | Meadow, Night plus Forest, Coral reef, City park, Space | 12 per project, 480 × 320 |
| Tiles | Grass, Stone, Sand, Metal | 32 px, worlds up to 8 per project |
| Animation | learner-authored frames only; no stock animation | 64 frames per sprite |
| Sound | 7 synthesized instruments, recording and import | 24 sound assets, 60 s each |
| Effects | sparkles, confetti, rings bursts; seven sprite and stage graphic effects | — |
| Project | 16 MB total, 12 MB scene | — |

Stock art is rasterized into the project when added, which keeps exports self-contained but means every asset pack is paid for in every project's size. A richer library needs referenced assets.

### 5.2 Art direction and sourcing

Keep the current look: flat shapes, soft outlines, the pastel palette already shared by the UI and the stock art. That style scales to animation cheaply and reads well at 64 px. Options:

| Option | Pros | Cons |
| --- | --- | --- |
| Original art in-house (vector sources, exported to PNG sheets) | Consistent with the current cast, no attribution surface, full control over poses needed by lessons | Slowest; an animated character set is roughly 30–40 frames |
| CC0 packs (for example Kenney's platformer, roguelike and UI packs, and his sound packs) | Thousands of consistent frames, tiles and sounds, no attribution required, safe under the undecided project license | Visually different from the current cast; must be restyled or kept to a separate "pack" look |
| CC-BY packs | Widest choice | Attribution must appear in-app and in every export; adds a license surface the README warns about |

Recommendation: original art for the hero cast the academy uses (Fox, Robot, Rabbit, Turtle, Bee, plus two new human-like explorers), with full animation sets, and CC0 packs for breadth in tiles, props, UI and sound effects, each pack behind its own tag so a project can keep one visual style. Every asset carries license metadata in its manifest, and the asset build fails on an entry without one.

### 5.3 Visual content

| Content | Specification |
| --- | --- |
| Animated characters | Seven characters with idle (2–4 frames), walk (6–8), jump, hurt and celebrate, facing right; the runtime's left-right rotation style flips them. 64 px for base; 128 px source for the large stage. |
| Enemies and critters | Eight, each with idle and move; two with an attack frame for Level 4 shooters. |
| Collectibles and props | Coin and gem spin cycles (6 frames), hearts, keys, doors, switches, spikes, platforms, crates, signposts, bushes, rocks, clouds. |
| Tilesets | Four themes (grass, cave, snow, ruins) with top, middle, edge, corner, slope and one-way platform tiles, drawn as 32 px with 2× sources; an autotile rule table so the world editor paints edges automatically. |
| Backdrops | Twelve, each as two or three parallax layers (far, mid, near) plus a flat composite for projects that do not use parallax. |
| UI and HUD | Hearts, coin counter, timer glyphs, buttons for result screens, speech-bubble variants, a bitmap font for stage text. |
| Effects sprites | Dust puff, explosion, hit spark, pickup glow, portal, as small frame sets usable by the burst API. |

### 5.4 Format and pipeline changes

- Add referenced stock assets: a sprite's costume or a world's tiles can point at `stock:<pack>/<id>@<version>` instead of an embedded PNG. The editor resolves references from a versioned manifest bundled with the app; Save project keeps references; Export playable and Export Python copy the referenced files into the ZIP, as they already do for embedded assets. A language-version bump with a migration that leaves embedded assets untouched.
- Stock references do not count toward the 24-costume embedded limit. Embedded custom art keeps its limit.
- Animation sets as library entries: a stock character ships with named sequences. Add `sprite.play("walk")`, `sprite.set_animation("idle")` and `when animation ends` beside the existing frame API, with a Looks block for each. Learner-painted frames can be grouped into named sets in Artwork & frames, so the feature is not stock-only.
- Asset sources live in `assets/src/` (SVG or Aseprite) with a build script producing sheets, 1× and 2× PNGs, manifests with license fields, and preview thumbnails. The stock library dialog reads the manifest, gains pack and tag filters, and shows animated thumbnails.
- Raise the backdrop limit to allow parallax layers, and give the stage a layer list (far, mid, near) with per-layer scroll factors tied to the camera.

### 5.5 Sound

- A sound-effect generator in Sounds & music, in the style of sfxr: presets (jump, coin, hit, explosion, laser, power-up, blip) with Randomize and a few sliders, rendering to the existing 22,050 Hz WAV format. It is small, original, and fun for children, and it produces unlimited effects without any pack.
- A stock effect set of about forty CC0 sounds for guided builds and the academy, referenced like stock art.
- Music loops: eight original songs in the existing score format at chiptune-friendly tempos, plus `sounds.loop(song)` and `sounds.stop_loop()` with fade, and ducking of the loop while a `play_wait` effect runs.
- Instrument expansion: pluck, bass, bell, organ and noise layers in the song grid; a per-song volume. The seven current instruments stay.

### 5.6 Runtime effects

- Particle presets beyond the three bursts: trail, dust, explosion, hearts, rain, using the effect sprites above; a `game.effect` kind for each.
- Screen shake, flash and tint on the stage; camera zoom and smooth follow; glide easing options.
- Sprite outline and glow effects added to the seven existing graphic effects; a stage text object for titles and dialogue that is rendered on canvas, so it appears in exports and pixel sensing stays unaffected by HUD HTML.

### 5.7 Phases and acceptance

| Phase | Work |
| --- | --- |
| D1 | Manifest and referenced-asset format, migration, stock dialog filters, exports; one animated hero and one enemy as the proof |
| D2 | Named animation sets and blocks; the remaining hero cast; collectibles and props |
| D3 | Sound-effect generator, stock effects, music loops and loop API |
| D4 | Tilesets with autotile, parallax backdrops, stage layers |
| D5 | Runtime effects and stage text |

Acceptance: a child builds the Jump quest guided build with a hero that idles, walks and jumps, an enemy, coins that spin, a jump sound and a background loop, without painting anything; a project using twenty stock references stays under 200 KB; an exported playable of that project runs offline with every referenced asset; every asset in the manifest has a license field and a preview; the stock dialog shows animated thumbnails in under a second on an iPad.

## 6. Sequencing across tracks

| Order | Milestone | Tracks | Why this order |
| --- | --- | --- | --- |
| 1 | One-screen shell, levels, gallery | A1, A2, B2 | Nothing else has a place to live until the shell exists; the gallery is the cheapest guidance win |
| 2 | Hat blocks, sprite tray, tablet pass | A3, A4, A5 | Makes the Starter level real; needed before a child tests guided builds on an iPad |
| 3 | Recipes, guided builds 1 and 3, AI routing | B1, B3, B4 | Directly addresses the "cannot figure out how" complaint with today's art |
| 4 | Referenced assets, animated hero, sound generator | D1, D2, D3 | Unblocks the remaining guided builds and Levels 4+ |
| 5 | Guided builds 2, 4, 5, 6 | B5 | Full guidance set |
| 6 | Academy runtime and Levels 1–3 | C1, C2 | First course on a stable shell and asset base; trial with one learner |
| 7 | Tilesets, parallax, runtime effects | D4, D5 | Polish that the academy capstones can then use |
| 8 | Levels 4–8 | C3, C4, C5 | Content follows evidence from the first three levels |

Like the roadmap, this is sequencing, not a delivery-date commitment. The learner pilot in the roadmap remains the best early evidence source and should run against milestone 3 rather than against today's page.

## 7. Decisions needed from the owner

1. Primary device: confirm iPad 10.2"/10th generation landscape as the design target, and name one laptop class to verify side-by-side Python.
2. Confirm that the app (not the model) may insert reviewed recipe blocks, which keeps the assist contract intact, and defer the model-drafted-blocks tier until pilot evidence exists.
3. Asset sourcing: original hero cast plus CC0 packs for breadth, or all original. The choice affects the license audit already listed in the release phase.
4. Accept a project-format version bump for referenced stock assets and named animation sets.
5. Where academy progress lives before accounts exist: local record with file export, as proposed, or wait for hosting decisions.
6. Which comes first for the child's benefit if effort is limited: guided builds with today's art (milestone 3) or animated assets (milestone 4). This plan puts guidance first.

## 8. Risks

- Pyodide on iPadOS Safari may exceed memory or load slowly on older iPads; measure before promising tablet support publicly. The portable player has the same exposure.
- Hat blocks that create handlers on drop must keep the handler's owner, payload names and delivery order consistent with the dialog, or the Python bridge round trip breaks. Reuse the editor's creation function rather than reimplementing it.
- Levels hide tools; a hidden tool that a shared project uses must trigger the upgrade prompt, not a silent diagnostic.
- Recipe previews rendered by tests take CI time; cache by fixture hash.
- Referenced assets reintroduce a dependency on the app version at load time. The manifest must be versioned and the migration must embed a reference on export when an older player is targeted.
- The academy's dynamic checks run learner code with scripted input in the ordinary worker; the existing watchdog and limits apply, but checker flakiness (timing-dependent games) must be designed out by seeding random and stepping the clock, which needs a deterministic mode in the runtime.
- Content volume is the long pole. Twelve units and 150 problem templates for Levels 1–3 are a larger authoring effort than any single engineering phase above.
