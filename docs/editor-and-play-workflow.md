# Editor navigation, watchers and large-stage play

This increment addresses D12 in the [2D parity plan](2d-parity-plan.md). Since the one-screen editor (Track A of the [learner experience plan](learner-experience-plan.md#210-implementation-record)), the sprite browser is the tray under the stage, the inspector is the **Sprite** tab plus its **More settings** sheet, and watch readouts appear in the **Output** tab. It builds on the existing artwork, world, sound, input and mapped-error tools. Saved authoring data remains separate from runtime output.

## Find blocks and sprites

The former long Sprites palette is split into smaller categories (the Pro level shows them all; Starter and Builder group them, see [levels](learner-experience-plan.md#25-progressive-disclosure-through-levels)):

| Category | Contents |
| --- | --- |
| Sprites | Object references, lookup/create/clone/destroy, instance data and kinds. |
| Motion | Move/turn, coordinates, change-by, aiming, glide, bounce and rotation style. |
| Looks | Costume/frame animation, dialogue, visibility/layers, backdrops and graphic effects. |
| Physics | Velocity/acceleration, controllers, grounded jumping, collisions and projectiles. |
| Sprite pen | Independent pens, line settings, stamps and erasure. |
| Sensing & input | Property/key/pointer reporters, distance/contact/color, timers and questions. |
| Worlds | World transitions, camera and tile operations. |
| Sounds / Game | Audio/music and HUD/game-flow operations. |

The plain sprite block, **sprite** [Fox ▾], is one sprite on its own, to keep in a variable or put in an empty slot: it is the first block in Sprites at Pro, and the first under the Sprites heading of Game at Starter and Builder; typing *sprite* in Find blocks lists it first. Sprite inputs in newly opened palettes default to the selected authored sprite. Object/world reference blocks use dropdowns, so a large project does not create dozens of duplicate palette entries. Every existing block remains supported; saved programs do not change during palette navigation.

The sprite tray shows a thumbnail for every sprite. **Find sprite** in the Sprite tab filters it by name, kind or world. Cards and the existing Sprite dropdown select the same stable object. **Edit costume** opens that sprite's current artwork, even if the artwork editor previously showed a backdrop or another costume. An unfinished artwork draft is preserved with an explanatory message; selecting another sprite does not discard it.

**Starting world** changes the authored starting world and participates in Undo/save. **Find on stage** switches to a selected sprite's owning world if necessary, then temporarily centers the camera on it within map bounds. World selection is saved; the framing itself does not change the saved camera profile. Reset stage or another scene refresh restores that profile. The operation never changes sprite coordinates. Global sprites can be framed in the current world.

**Scripts for sprite** lists its direct handlers, matching kind handlers and shared project handlers. **Go to script** highlights and centers the selected handler in the blocks workspace. Existing Events tools still create/edit handler ownership and order. The Sprite tab scrolls independently of the workspace, keeping controls usable as projects and library tools grow.

The workspace corner also provides **Find blocks** for the current level's palette and the current project. **Debug code** adds real Python pause/step controls and local/global values. See [block search and debugging](debugging-and-search.md).

## Quick tools

**Quick tools** ([quick-tools.ts](../src/ui/quick-tools.ts)) is a small panel floating over the workspace with the editing actions a learner reaches for most, where a hand already is. On an iPad, Undo and Redo were at the top of the screen, and Duplicate, Delete and Clean up only in a block's long-press menu, with no trashcan to drag to.

- **Actions:** Undo, Redo, **Duplicate** and **Delete** (the selected block), **Tidy up** (lines up the scripts in the open tab; Undo puts them back) and **Find blocks**. Duplicate, Delete and Tidy up are Blockly's own menu items, so they behave as the long-press menu does. Tapping a tool keeps the block that was selected, so a learner taps a block and then the tool.
- **Favourite blocks:** select a block and tap the star, or choose **Add to favourite blocks** in any block's long-press (right-click) menu, in the workspace or the palette, to keep it (with what is plugged into it, but not the blocks under it) in the panel. A favourite looks like its block: its colour, symbol and words. Tapping it adds a copy in view, clear of the panel, as Paste would; Undo removes it. Up to 6; **Remove favourites** turns the favourites into remove buttons until it is tapped again.
- **Moving and minimizing:** drag the grip, or focus it and use the arrow keys (Shift for bigger steps). The panel stays right of the palette, below the script tabs and above the corner buttons, so it never covers the palette, a tab or the stage; it sits under the palette's flyout and fades while a block is dragged. The minimize button shrinks it to one toolbox button, which can be dragged too; tapping it opens the panel again. It starts in the bottom right corner, above the zoom buttons, away from where scripts begin.
- **Kept per learner:** where the panel sits (as a share of the space, so it keeps to the same corner or edge on any screen), whether it is minimized and the favourites are one browser key, `python-blocks.quick-tools.v1`, synced to a signed-in learner's account like the level and the view.

## Changing a value on a tablet

On an iPad, Blockly does not edit a number or words in place: it asks in a prompt. The browser's own *Change value:* box had small buttons that were hard to hit, so the value sheet ([value-sheet.ts](../src/ui/value-sheet.ts)) takes its place, and Blockly's confirm and alert boxes become the same kind of sheet. A number opens **Change the number** with the block's words above it (*set lives to*), a big box with a number keyboard, − and + that step by an amount that suits the number (1 for 3, 10 for 220, 0.01 for 0.1), and **+/−**, since an iPad's number keyboard has no minus sign; anything that is not a Python number keeps the sheet open with a hint. Words open **Change the words** with a wide box. Done and Cancel are 56 px tall. The tap that opened the sheet cannot press Done or Cancel by landing where they appear: a click counts only after a press starts inside the sheet. Blockly's dropdown menus (sprites, keys, directions) get 44 px rows on a touch screen.

## Editing after a run

After Run the stage keeps the game's last picture (or the game keeps running, for a game that listens for keys). The sprite tools stay usable all the time: Add sprite, Duplicate, Delete, Sprites (library), Paint, Sounds, Worlds & tilemaps, the backdrop and colour, Find on stage, Edit costume and every property in the Sprite tab. Using one stops a game that is still running (as Stop does), puts the stage back to the starting layout (as Reset stage does), and then does what was asked; a property typed during a run keeps the learner's value. The note at the top of the Sprite tab says so: *Running … Changing a sprite stops the game* and *Run result. Change a sprite, or Reset stage, to edit the starting layout.* Picking a sprite in the tray only selects it and never stops a game. (Before, every tool stayed greyed out until Reset stage, which learners did not find.)

## Script tabs and the magic book

A finished game, such as an arcade example, can have a dozen long scripts; in one workspace they are one big blob. Two tools let a learner keep track of a big project and find the numbers worth changing.

**Script tabs** ([tab-strip.ts](../src/scripts/tab-strip.ts), [tabs.ts](../src/scripts/tabs.ts)) run along the top of the workspace, beside the palette: the palette and its flyout keep the panel's full height (an open flyout covers the strip), and the workspace view starts under the strip. Each top-level script (and workspace note) lives in one tab, and only the open tab's scripts are on screen. The others are hidden: their connections leave Blockly's connection database, so nothing snaps to them, and they never take part in a bump; Clean up, Collapse, Expand, Delete all, scrolling and zoom-to-fit count only the scripts on screen. A hidden block is never left selected. Hiding is only for finding your way: every script compiles and runs, Python lists them all, and a tab never changes what the program does.

| Action | How |
| --- | --- |
| Make a tab | **New tab**: a name, and a picture guessed from it (Enemies gets a target, Lives a heart). Up to 12 tabs. |
| Change a tab | The pencil beside the open tab, or double-click its name: rename, pick one of 18 pictures, Move left or right, Delete tab. Deleting asks first and moves its scripts to the first tab left. |
| Move a script | Drop it on a tab's name (or on **New tab** to start a tab with it), or **Move script to another tab** in its menu. It goes under that tab's scripts, and the tab flashes. The strip lies beside the palette, outside its delete area, so a script dropped on a tab is always moved. |
| New scripts | Belong to the tab they are made in: dragged from the palette, pasted, inserted from an idea or a lesson. A block pulled out of a script stays in that script's tab. |
| Go to a block | Find blocks, an error, a runtime fault, the debugger, Go to script, Show me and the function and handler editors open the block's tab first. Undo or Redo of a change that touched only another tab opens that tab. |

Each tab remembers where it was scrolled while the project is open; a tab opened for the first time shows its top-left script. Tabs are saved with the project as `scriptTabs`: the tabs in order (id, name, picture) and the tab of each top-level script by id. Moves, renames, reordering and deleting are one Undo step each. A script with no entry lives in the first tab, so a project without tabs has one *Main* tab and is saved exactly as before; anything unusable in `scriptTabs` is dropped rather than refusing the project. Applying a Python draft keeps each function's and handler's tab, since their blocks keep their ids. Opening a project spreads out overlapping scripts tab by tab.

**The magic book** ([magic.ts](../src/guide/magic.ts), [magic-notes.ts](../src/guide/magic-notes.ts)) is the **Magic** tab. Wren the Wizard, original art drawn in the page, reads the project's notes aloud as a guide:

- Every block with a comment is a page. The comment's first line is the title (*Laser speed and direction*), the rest is what to try (*Try 20 for a super laser. A minus number would shoot it down!*). Blockly's comment icon (?) marks the block in the workspace.
- The numbers typed into that block and the blocks in its slots (not the stack under it) appear with the words beside them in the block, such as *set lives to*, *change sprite y by*, or *await wait (first number)*; a number with no words of its own is named by its block (*bombs < 3*). Up to four per page. Words the player reads (a message, a speech bubble, a question) can be changed too; text that names something, such as a sprite data key or a kind, is never offered.
- − and + step by an amount that suits the number (1 for 3, 10 for 220, 0.01 for 0.1); typing accepts a Python number only and says so otherwise. Each change is an ordinary block edit: one Undo step, and the next Run uses it.
- **Show me** opens the block's tab, switches to Blocks view, centres the block and selects it.
- Pages are grouped by script tab, in tab order, then top to bottom.
- Without a note, Wren still spots well-known numbers: lives at the start, lives lost, points, jump strength, move speed, gravity, the countdown and the win and game-over messages. **Make this a note** writes the title and hint into the block's comment, where the learner can reword it.
- A project whose notes have pages puts a dot on the Magic tab when it opens.

**A Settings tab: a game's config.** Sky Defenders and Flappy Pipe keep the numbers that make the game what it is in one place, the way programmers keep a config: a **Settings** tab (first, with the magic wand) holding the Program block, which sets named values before anything else runs (`LIVES = 3`, `CANNON_SPEED = 220`, `BOMB_CHANCE = 40`, `GRAVITY = 900`, `FLAP_POWER = 300`). Every script reads those names instead of typing the number again, so one change is all it takes, and Python shows them as plain assignments with the notes as `#` comments above them. Sky Defenders also keeps its looks there: `CANNON_LOOK`, `LASER_LOOK` and `BOMB_LOOK` are costumes, and the start script puts each sprite in its look, so making the laser shoot stars is one change in Settings rather than an edit to every block that uses the laser. In the magic book each setting is a page; a look is a costume to pick from a list. A spotted number whose value comes from a setting is not spotted again in the script that reads it.

The six arcade examples and Super Hopper's finished game ship with tabs and notes: lives, cannon and ship speed, laser and shot speed and direction, bomb speed, chance and the most at once, how high the hero jumps, gravity, engine power, fuel, a safe landing speed, the snake's speed (and the body that must match it), and the maze speeds that must fit its 32-pixel squares.

## Watch live values

Open **Watch sprite values** (Sprite tab → More settings, Builder and Pro levels), choose an authored sprite and a property, and select **Add watcher**. Supported properties are x, y, direction, size, visibility, costume ID, kind, layer, horizontal/vertical velocity, grounded state, and a named data key. Up to 12 watches can be pinned. Remove a watcher in the same panel; both addition and removal participate in project Undo. Watch definitions save with the project, preserve sprite IDs across rename and are included in captured source exports.

| Phase | Display |
| --- | --- |
| Starting values | Saved authoring values. Grounded state requires a Run. Missing data keys and deleted references have explicit labels. |
| Live values | Read-only values from actual Python objects, refreshed at most every 100 ms. Unchanged results are not resent. |
| Last run values | Last received values after Stop/error; normal completion also publishes a final snapshot. Reset stage restores starting values. |

Nested data mutations are visible even when they occur through aliases or ordinary collection blocks. Lists/tuples/dictionaries have bounded previews: up to four items per container, three levels and 120 Unicode code points overall. Long text and very large integers are abbreviated. Other objects display `<object>` without invoking learner-defined representation methods. Exact Python numeric text is retained when it fits. Non-yielding code can delay live updates; the existing responsiveness watchdog remains in force.

An inactive world-local sprite or destroyed sprite displays **Sprite not active**, and a missing data key displays **Key not set**. A deleted authored reference stays recoverable through Undo instead of silently attaching to a new sprite of the same name. Watches target authored sprite identities; they do not automatically follow clones. Runtime values are never saved back into the starting scene. Watch configuration is read-only during a run and its captured result; Reset stage enables changes. Replay uses the captured definitions.

Watch outputs use literal text, wrap long previews and avoid announcing ten updates per second to assistive technology. The current values remain readable in the accessibility tree. They do not consume the project's drawing/scene-command budget, dispatch learner events or edit project data.

## Play on a larger stage

**Large stage** opens a modal play view containing the existing canvas, HUD/results, touch controller, questions, watches, dialogue and audio controls. It moves those same live elements, preserving the worker and its state. Logical coordinates remain 480 × 320; pointer input scales to the displayed rectangle and still accounts for the world camera.

On a touch screen, Run opens this view by itself whenever the program listens for keys (key handlers, key sensing or an arrow-key controller), because the on-screen controller docks under the stage here instead of covering the small editor stage; it is hidden again when the run ends. The stage is sized so the header, stage, controller and help line fit the viewport without scrolling.

The play header provides Run code, Stop and **Return to editor**. Keyboard focus remains in the modal. Escape on the stage returns to the editor; Escape inside a question first cancels that question, following its input contract. Entering/leaving the view releases held input to prevent stuck movement. Closing it restores the elements to their previous editor locations and returns focus to Large stage. Run and captured **Play again** retain their existing distinction.

Runtime errors remain visible in the play view and the editor's mapped block/traceback diagnostics remain available after returning. Touch and keyboard gameplay, questions, win/loss/replay and Stop work at narrow widths. This is a browser modal with an enlarged stage, not an operating-system fullscreen request. Existing [input help](questions-timers-and-touch.md), keyboard-operable artwork/world/music tools, literal text rendering and focus-reset rules continue to apply.

### Sharp drawing at any size

The stage keeps 480 × 320 stage coordinates for scripts, positions, sensing and pointer input, but its canvas is drawn at its displayed size times the screen's pixel ratio, in whole steps from 1× to 4× (a step is skipped only when it would enlarge the stage by less than a quarter). On an iPad Air in landscape that is 2× in Blocks view, 3× in Stage view and 4× in Large stage; the exported player does the same. Pen marks and stamps go into a pen layer of up to 3 pixels per stage unit (within 8 million pixels, so the largest worlds stay at 1×), graphic effects are computed at 2× for the built-in shapes, and library art is stored at 2×. The canvas's `data-scale` attribute reports the current step.

## Format and evidence

Language version 18 adds optional `scene.watchers`. Earlier projects and pinned modules remain readable, with no watches by default. There are no new language semantics or authoring APIs for the readout UI.

- [Editor model/compiler tests](../tests/unit/editor-workflow.test.ts) verify complete, nonduplicated scene/input palette coverage, selected-sprite defaults, watcher validation/bounds, missing-reference recovery, version-17 migration and captured export.
- [Native watcher tests](../tests/python/test_watchers.py) cover real object/data mutation, missing/inactive states, grounded queries, recursive/large values and previews that never invoke custom representation or collection overrides.
- [Editor browser tests](../tests/e2e/editor-workflow.spec.ts) cover palette navigation, costume/script shortcuts, world selection/Undo, watcher authoring/rename/reload/nested mutations/destruction/reset, malformed imports, final sequential values, preservation of a live worker, scaled pointer coordinates, question/error controls and narrow keyboard/touch authoring and play. Desktop navigation/watch/play and narrow watch/play screenshots are inspected.

The automated accessibility evidence covers native labels, focus, keyboard activation, modal containment and narrow layouts in Chromium. It does not claim a physical device or screen-reader certification. The [portable player](portable-playback.md) carries this play workflow into independent exports. The [completion audit](2d-parity-audit.md) verifies the complete practical 2D baseline and records remaining product limits.
