# Python and blocks

The Python panel lets you change a program as text and turn supported Python into ordinary editable blocks. Sprites, costumes, sounds, worlds and other authored assets stay in the project.

## Try a small change

1. Open a working project and choose **Edit Python** in **Meet your Python**.
2. Change a number or a message in the draft. Use spaces for indentation.
3. Choose **Apply to blocks**, or press Ctrl+Enter / Command+Enter. The app parses the text without executing it, builds a candidate, checks the resulting Python and verifies that the project has not changed meanwhile.
4. Inspect the resulting blocks with **Go to blocks**. **Undo** restores the previous program; **Redo** reapplies the conversion.
5. Choose **Run Python** to try it. Run validates and applies the active draft before executing the accepted program. **Stop** retains the normal execution cancellation behavior.

You can begin with a small text-only program, for example:

```python
score = 2
for turn in range(3):
    score = score + 1
    print(score)
```

Tab moves from the textarea to the controls. It does not insert indentation or trap keyboard focus. The editor preserves your text while you inspect blocks or generated files. Applying stops the previous run and restores the authored starting scene.

## Drafts and errors

Unfinished and invalid Python is still saved. Browser autosave and **Save project** include the exact draft and its last accepted checkpoint. Reloading or reopening that file resumes the draft. **Download draft** saves the exact submitted text as a `.py` file, including comments, formatting and untouched line endings.

Apply, Run and exports report syntax errors or unsupported constructs without replacing the blocks. Click a diagnostic's line/column link to select the relevant text. Cancel conversion if needed; later edits or another Apply invalidate the earlier request.

The active draft remains authoritative for Run and exports even while you inspect generated files. Invalid text cannot silently run or export the previous blocks. If you edit text while a previously accepted program is already running, that existing run continues until Stop or a successful Apply. A failure from that run is labelled separately from the unapplied draft.

**Play again** replays the captured game. An active draft must still match the exact draft and authored project validated for that run. If either has changed, use **Run Python** to validate and start the edited program, or **Discard draft** to replay the captured game. Replay never applies new Python implicitly.

## When blocks or assets have changed

A draft records the exact project revision from which it began. Changes to blocks, layout, variables, module bindings, sprites or assets can make that base stale. Apply then preserves both the draft and the changed project and explains the conflict.

**Start from current blocks** creates a new draft of the current program and keeps the old text in **Recover earlier Python**. **Discard draft** also creates a recovery copy and returns Run to the block program. Recovery opens earlier text without silently changing blocks. Its original base revision remains, so an older draft may still require reconciling with changed blocks/assets.

Recovery stores up to 20 entries within the 16 MB project limit. At the limit, the action stops before deleting anything. Save a project copy or download an entry, then explicitly remove an entry to free space. Browser storage quotas may be lower than the project-file limit; follow the save-state message and download your work if browser storage is unavailable.

Text typed after Apply is preserved even if you subsequently Undo or Redo the blocks. If that changes the text's base, the app shows a conflict. Applying a change also saves the previous accepted source, so removed active code is recoverable through both block Undo and saved source.

## Generated files and assets

**Generated files** shows the compiler's output. Select `program.py` or a pinned module file to inspect it. Only the main file has an editable draft; imported module definitions remain immutable. Generated formatting may differ from your draft even when they describe the same supported program.

For scene projects, retain the generated `scene.json` load and optional motion-activation prelude. Authored assets remain outside Python. Sprite names and literal asset/world/sound IDs must refer to the captured project. Use the scene and asset editors to create or rename those objects, then start a fresh draft when the project revision changes.

Source exports contain the accepted generated program and its required module/scene files. Use **Download draft** for your exact written source, and **Save project** to preserve both representations and recovery entries. **Export playable** packages the runtime and a captured project, including the exact accepted draft. Later typing, asset changes and runtime movement do not change that archive. Follow its README to run it independently; the player executes the generated program and uses its source map for errors. Verification is recorded in the [implementation plan](blocks-python-bridge-plan.md).

## Supported language

The bridge covers the existing block language: exact literals, arithmetic and logic, lists/dictionaries, variables, conditionals, loops, named functions, positional parameters, recursion, supported function values/lambdas, async handlers/waits, pinned module calls and all current creative-library blocks.

Unsupported Python remains in your draft with an explanation. Examples include arbitrary imports, classes, exception handling, decorators, closures, variadic/default/keyword-only signatures, chained comparisons, augmented assignment and general comprehensions. Blockly's exact generated multi-item text join is a supported special case. There is no raw-code block or separate unrestricted execution path.

Projects now use envelope format version 2 to preserve Python drafts. Older version-1 projects still open and migrate; older app versions should reject version 2 instead of silently dropping text. The block language version remains 19. See the [bridge plan](blocks-python-bridge-plan.md) for current verification and remaining audit work.
