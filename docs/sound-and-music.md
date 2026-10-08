# Sound and music

The Sounds library and **Sounds & music** editor let learners create recordings, edit waveforms, compose layered songs and play them from Python blocks. Assets belong to the saved project. Playback belongs to a captured run, with independent stage and sprite channels.

## Creating audio

Open **Sounds & music** below the stage. **New tone** starts an original sine chime; **Import audio** decodes formats supported by the browser (including WAV and commonly MP3/Ogg). **Record microphone** requests access only after that button is pressed. Finish recording stops every microphone track before decoding; Close also cancels recording and releases tracks that arrive after a pending permission request. Denial leaves import and song creation usable. Audio is kept locally in the browser and saved project; no upload service is involved.

Imported and recorded clips become mono, 22,050 Hz, 16-bit PCM WAV. Clips may be up to 60 seconds; source files up to 10 MB. Longer files are rejected without replacing the draft. These are compact classroom audio assets, rather than a multitrack audio workstation.

Drag on the waveform or enter start/end seconds. **Preview** plays the selection. Trim keeps it; reverse, fades, louder/quieter and normalize affect the selected samples. Effects are baked into the draft WAV. **Undo edit** restores up to eight recent edits within a 16 MB history budget. **Apply sound** saves one atomic project edit; workspace Undo/Redo restores saved versions. Rename preserves asset identity, Duplicate creates a new identity, and deleting an asset leaves its block references unresolved until restored or replaced. Closing discards unapplied edits. Conflicting saved edits are rejected instead of overwritten.

## Composing songs

**New song** opens a grid with quarter-beat columns, four beats per page and octave navigation. Click to add/remove a note; arrows navigate and Space/Enter toggles. Select a note length before placing a note. A dash shows a sustained note extending from an earlier column. Instrument layers are independent: sine, triangle, square, sawtooth, kick, snare and hat. Clear this instrument removes that layer. Preview plays every layer; the project retains the editable notes, rather than a flattened recording.

Songs have their own tempo (30–300 BPM), length (up to 64 beats / 60 seconds), up to 256 notes and at most 16 simultaneous notes. MIDI note 60 is middle C; supported notes span 21–108. Short attack/release envelopes prevent abrupt note boundaries. The original **Music example** combines a melody and drums with a separate Space-key chime.

## Python and block semantics

```python
from playground import sounds

sounds.play("first_song")              # start without waiting, stage channel
await sounds.play_wait("voice", actor) # wait for this playback instance
sounds.set("volume", 70, actor)
sounds.change("pitch", 12, actor)
sounds.set("pan", -50, actor)
sounds.clear_effects(actor)            # reset pitch and pan, retain volume
sounds.stop(actor)                     # stop this sprite's sounds
sounds.stop()                          # stop stage sounds
sounds.stop_all()

sounds.set_tempo(120)
await sounds.note(60, 1, "triangle", actor)
await sounds.note(60, .25, "kick")
await sounds.rest(.5)
```

Every action has a corresponding Sounds block, with stable asset dropdowns and an explicit sprite input (`None` means the stage). Wait, note and rest require a handler or explicitly async helper. Sound-using projects and reusable helpers automatically enable the event session. Modules receive project assets and sprites through parameters. Python remains the language executing the program.

Volume is 0–100%, pan −100 (left) to 100 (right), and pitch −24 to 24 semitones. Set rejects out-of-range values; change clamps to the valid range. These settings affect both existing and future playback on that channel. Pitch is a tape-speed effect: +12 doubles speed/pitch and halves remaining duration. It affects an entire saved song's timing as well as its notes. Note/rest actions capture the library tempo when they start; changing it does not reschedule existing actions or change a saved song's own tempo.

Starting a sound overlaps previous playback, including another instance of that same sound. Play-and-wait resumes on the browser's actual ended notification, including after an explicit stop; it does not estimate duration using a Python sleep. A cancelled waiting activity cancels its playback. Destruction/world transitions stop sounds belonging to removed sprites. Clones inherit current channel settings by value and start with no copied playback; global stage sounds survive world changes. Stop, errors, watchdog termination, finish and replay dispose all run playback. Late completions from previous workers are ignored. Replay uses the captured assets; a fresh Run uses current edits.

Run and Preview enable Web Audio from a user gesture. **Enable audio** can recover a suspended browser context; **Mute** controls runtime output without changing the project or stopping its activity. Preview has its own Stop control. A playback start refused by the browser raises a learner-visible error; fire-and-forget errors retain their Python call origin for block highlighting.

## Persistence and bounds

Language version **16** introduced sound blocks and optional `sounds` scene assets. Current exports use version 19; earlier project versions 1–18 and pinned module versions 5–18 remain readable. The scene serializer preserves sound-only projects. Project JSON and source ZIP exports include the captured WAV data and editable scores. **Export playable** also includes the browser host and runtime, retaining actual audio playback and completion; see [portable playback](portable-playback.md).

There are at most 24 sound/song assets, 32 concurrent playback instances and 20,000 learner sound commands per run. Browser buffers cache at most eight assets. Scenes fit within 12 MB UTF-8 and complete projects within 16 MB; module bundles retain their 2 MB limit. Browser storage may offer less space: a visible save warning directs the learner to Save project when autosave cannot fit. Apply/import failures preserve the previous saved scene.

## Verification

The [model/compiler tests](../tests/unit/sounds.test.ts) cover canonical WAV validation, original instrument samples/envelopes, score/command bounds, stable references, sound-only persistence, captured exports, version-15 migration, source mapping and imported sound helpers. [Native tests](../tests/python/test_sounds.py) cover host completion, stopped/cancelled waits, clone channels, destruction, tempo capture, error origin, atomic validation, overlap bounds and terminal cancellation. [Runner tests](../tests/unit/runner.test.ts) cover playback completion routing across worker replacement.

The [browser tests](../tests/e2e/sounds.spec.ts) measure real Web Audio output, edit and reload waveforms/songs, exercise recording/decoding with a generated MediaStream, recover denied/late microphone requests, and verify overlap, stereo pan/volume/clear effects, mute, pitch-dependent completion, owner destruction, Stop/restart and game finish. Generated streams exercise the actual MediaRecorder; they do not verify physical microphone hardware or OS permission dialogs.

The design follows the browser's [Web Audio user activation and playback guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) and uses [AudioBufferSourceNode completion](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode). The feature baseline includes Arcade's [music reference](https://arcade.makecode.com/reference/music), alongside the Scratch sound workflow in the [feature survey](research/block-programming-feature-survey.md).
