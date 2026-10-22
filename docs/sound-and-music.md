# Sound and music

The **Sound editor** lets learners record their voice, tune it, make sound effects, compose layered songs and play them from Python blocks. Assets belong to the saved project. Playback belongs to a captured run, with independent stage and sprite channels.

## Finding the Sound editor

Four ways in, one editor: **Sounds** in the sprite tray (beside Sprites and Paint), the **Sounds** list in the Sprite tab (play any sound, tap its name to open it, or **Edit sounds**), **Edit sounds** at the top of the palette's Sounds blocks, and **New sound…** at the end of a sound block's menu. After Done, a block that chose New sound… uses the newest sound made in that visit; the new sound and the block's choice are one Undo step. The editor opens full screen, like Paint, and is not available while a program runs.

The editor shows every sound in the project on the left, the sound being worked on in the middle and its tools on the right. **+ New** offers **Record your voice**, **Make an effect**, **Write a song**, **Import a sound file** and the **Sound library**. Each card's **⋯** menu duplicates or deletes a sound. Nothing is saved until **Done** (or Escape), which writes every change as one project Undo step; a note under the stage then offers **Undo**. Inside the editor, Undo and Redo (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z) cover every edit, rename, new sound and deletion, so the editor never asks "Are you sure?": a deleted sound comes back with the note's **Undo**. Deleting a sound that blocks use leaves those blocks reporting a missing sound until another is picked or the deletion is undone.

## Recording

**Record your voice** shows one large button. The first tap asks the browser for the microphone (the page says that the voice stays in the project and nothing is sent anywhere), then counts 3, 2, 1. While recording, a ring fills over the 60 seconds, a timer runs, a level meter moves and the sound draws itself as bars. A second tap stops; recording also stops by itself at 60 seconds and says so. The quiet start and end are trimmed (with a little air left), and the clip opens in the waveform editor as "Recording N"; **Record again** replaces it. Done while recording stops and keeps the recording first. Leaving the recorder, or a permission that arrives late, releases every microphone track.

If the browser refuses the microphone, the editor explains how to allow it (the icon by the web address, Microphone, Allow) with **Try again** and **Make an effect instead**; a missing microphone and a microphone that fails to start get their own messages. Recordings are decoded in the browser to the project format; no upload service is involved.

## Waveform and Tune

The waveform shows a strip of the whole sound above a large view. Tap the waveform to play from that point; drag across it to select a part, then drag the selection's handles (44 px wide) to adjust it. Zoom with − and + (up to 64×), pinch, or Ctrl/⌘ + scroll; scroll or drag on the strip to move along. A playhead moves while the sound plays. **Play**, **Play the selected part** and **Select all** sit under the waveform with the sound's length and the selection's.

The **Tune** buttons work on the selected part, or the whole sound when nothing is selected, and play the result straight away:

| Group | Buttons | What they do |
| --- | --- | --- |
| Voice | Higher, Lower | Two semitones up or down, keeping the timing (a waveform-aligned time stretch, then resampling) |
| | Faster, Slower | 1.25× or 0.8× speed: shorter and higher, or longer and lower |
| | Robot, Echo | Ring modulation with a short metallic echo; four repeats a fifth of a second apart, each half as loud |
| Volume | Louder, Softer, Fade in, Fade out | ×1.4 (clipped), ×0.7, and straight-line fades |
| Edit | Reverse, Keep this, Cut it | Reverse the part, keep only the part, or remove it (Delete/Backspace too) |

Effects are baked into the sound's samples. A sound never grows past 60 seconds: Slower refuses with a message, and an Echo's tail is cut at 60 seconds.

## Effects

**Make an effect** offers ten kinds, each with a picture of its sound: Jump, Coin, Hit, Laser, Power-up, Pop, Whoosh, Win, Lose and Blip. They are worked out in the browser from a wave, a sliding or stepping pitch and an envelope, so there are no files to license. **Pitch**, **Length** and **Slide** sliders change the effect, **Make another** tries a new version of the same kind, and **Add to my sounds** makes it a sound that Tune can change further.

An effect added just as designed (sliders in the middle, not remade) is saved as a **library sound**: a reference such as `effects/coin@1` instead of recorded data, made from the same numbers whenever it plays ([sound-library.ts](../src/scene/sound-library.ts)). It costs the project almost nothing, which is why every example game can have its own coin, jump, hit and win sounds. Tuning, trimming or duplicating a library sound bakes it into the project as ordinary data. Library sounds count toward the 24 sounds like any other.

## The sound library

**Sound library** is a place to listen before making anything ([music-library.ts](../src/scene/music-library.ts), [sound-library.ts](../src/scene/sound-library.ts)). Its **Effects** shelf shows the ten effects as designed, each with its waveform and length; **Music** shows six original loops, each with its mood, speed, length and a small picture of its notes:

| Loop | Mood | Speed and length |
|---|---|---|
| Adventure | Bright and bouncy | 120 BPM, 16 beats (8 s) |
| Calm meadow | Gentle, for stories | 90 BPM, 16 beats (11 s) |
| Chase | Fast, for dodging | 150 BPM, 16 beats (6 s) |
| Spooky cave | Dark and slow | 80 BPM, 16 beats (12 s) |
| Space drift | Floaty, for space | 100 BPM, 16 beats (10 s) |
| Victory | A short fanfare | 130 BPM, 8 beats (4 s) |

**Listen** plays one in the editor (tap again to stop) and **Add** puts it in the project. An effect comes in as a library reference, like an effect made with Make an effect. A loop comes in as an ordinary **song**: the project's own copy of its notes, which the song editor can change, so there is nothing new to save or license. Every loop ends exactly on its last beat, so it repeats without a gap when started with **start sound … looping**.

## Composing songs

**Write a song** opens a grid of quarter-beat columns, four beats at a time, with a strip of the whole song above it (tap a segment to show those beats; it follows the playhead while playing). Melody rows are the white keys of an octave (C4–C5 to start); arrows move the octave, and **♯ Show sharps** adds the black keys. Below are Kick, Snare and Hat lanes. Tap a square to add a note, and tap a note to remove it; a new note plays as it is placed. Notes take the chosen instrument (Soft triangle, Game square, Flute sine, Buzzy sawtooth), each in its own colour, and the chosen length (¼, ½, 1 or 2 beats). **Speed** sets beats a minute and **Length** adds or removes four beats. Arrow keys move between squares.

Songs keep their format: a tempo of 30–300 BPM, up to 64 beats and 60 seconds, up to 256 notes and at most 16 at once. MIDI note 60 is middle C; supported notes span 21–108. Short attack/release envelopes prevent abrupt note boundaries. The project keeps the editable notes, not a flattened recording. The original **Music example** combines a melody and drums with a separate Space-key chime.

## Importing

**Import a sound file** decodes formats the browser supports (WAV, and usually MP3 and Ogg) up to 10 MB. Clips become mono, 22,050 Hz, 16-bit PCM WAV of up to 60 seconds; a longer file keeps its first minute and says so.

## Python and block semantics

```python
from playground import sounds

sounds.play("first_song")              # start without waiting, stage channel
sounds.loop("music")                   # play again and again until stopped
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

**start sound … looping** (`sounds.loop`) repeats a sound with no gap until stop sounds, Stop, the game finishing or the destruction of its sprite ends it, which makes it the block for background music; the Star game, the Platformer and Super Hopper start a library loop this way. Every action has a corresponding Sounds block, with stable asset dropdowns and an explicit sprite input (`None` means the stage). Wait, note and rest require a handler or explicitly async helper. Sound-using projects and reusable helpers automatically enable the event session. Modules receive project assets and sprites through parameters. Python remains the language executing the program.

Volume is 0–100%, pan −100 (left) to 100 (right), and pitch −24 to 24 semitones. Set rejects out-of-range values; change clamps to the valid range. These settings affect both existing and future playback on that channel. Pitch is a tape-speed effect: +12 doubles speed/pitch and halves remaining duration. It affects an entire saved song's timing as well as its notes. Note/rest actions capture the library tempo when they start; changing it does not reschedule existing actions or change a saved song's own tempo.

Starting a sound overlaps previous playback, including another instance of that same sound. Play-and-wait resumes on the browser's actual ended notification, including after an explicit stop; it does not estimate duration using a Python sleep. A cancelled waiting activity cancels its playback. Destruction/world transitions stop sounds belonging to removed sprites. Clones inherit current channel settings by value and start with no copied playback; global stage sounds survive world changes. Stop, errors, watchdog termination, finish and replay dispose all run playback. Late completions from previous workers are ignored. Replay uses the captured assets; a fresh Run uses current edits.

Run and the Sound editor enable Web Audio from a user gesture. **Enable audio** can recover a suspended browser context; **Mute** controls runtime output without changing the project or stopping its activity. The editor and the Sprite tab list play through their own audio, with their own Stop. A playback start refused by the browser raises a learner-visible error; fire-and-forget errors retain their Python call origin for block highlighting.

## Persistence and bounds

Language version **16** introduced sound blocks and optional `sounds` scene assets. Current project exports use version 23 (modules 19); earlier project versions 1–22 and pinned module versions 5–19 remain readable. The scene serializer preserves sound-only projects. Project JSON and source ZIP exports include the captured WAV data and editable scores. **Export playable** also includes the browser host and runtime, retaining actual audio playback and completion; see [portable playback](portable-playback.md).

There are at most 24 sound/song assets (+ New is disabled at 24 with a note to delete one), 32 concurrent playback instances and 20,000 learner sound commands per run. Browser buffers cache at most eight assets. Scenes fit within 12 MB UTF-8 and complete projects within 16 MB; module bundles retain their 2 MB limit. Browser storage may offer less space: a visible save warning directs the learner to Export project when autosave cannot fit. A Done or import that would break these limits keeps the previous saved scene and says why.

## Verification

The [model/compiler tests](../tests/unit/sounds.test.ts) cover canonical WAV validation, original instrument samples/envelopes, score/command bounds, stable references, sound-only persistence, captured exports, version-15 migration, source mapping, imported sound helpers, the music loops (valid songs that end on their last beat, added as the project's own copy) and the looping play command. [Native tests](../tests/python/test_sounds.py) cover host completion, stopped/cancelled waits, clone channels, destruction, tempo capture, error origin, atomic validation, overlap bounds, terminal cancellation and the loop request. [Runner tests](../tests/unit/runner.test.ts) cover playback completion routing across worker replacement.

[Sound editing tests](../tests/unit/sound-edit.test.ts) check that Higher and Lower move the pitch by two semitones and keep the length, Faster and Slower resample, Tune works on a selection, Keep, Cut, Reverse, fades and Louder, Echo's repeats and the 60-second limits, trimming the quiet ends, waveform peaks, and that every effect kind is bounded and repeatable. The [browser tests](../tests/e2e/sounds.spec.ts) record with the countdown from a generated MediaStream, tune a selected part with Undo and Redo, save with Done and undo it, make effects and songs, delete without a browser dialog and undo it, open the editor from the tray, the Sprite tab, the palette and a block's New sound…, show the blocked and missing microphone messages, keep a recording when Done is pressed, import a file, explain the 24-sound limit, listen to and add an effect and a music loop from the Sound library, keep a looping sound playing until stop sounds, and measure real Web Audio output for overlap, stereo pan/volume/clear effects, mute, pitch-dependent completion, owner destruction, Stop/restart and game finish. Generated streams exercise the actual MediaRecorder; they do not verify physical microphone hardware or OS permission dialogs.

The design follows the browser's [Web Audio user activation and playback guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) and uses [AudioBufferSourceNode completion](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode). The feature baseline includes Arcade's [music reference](https://arcade.makecode.com/reference/music), alongside the Scratch sound workflow in the [feature survey](research/block-programming-feature-survey.md).
