# Feature survey: block programming environments for children

Research date: **2026-10-07**. Status: research input to Python Blocks; not a committed feature roadmap.

This survey covers **14 representative environments across nine overlapping product families**, plus Blockly as an implementation framework. It separates language features, domain libraries, content creation tools, and editor features so that a capability such as “sprites” does not hide several different pieces of product work.

Evidence comes from official documentation, official tutorials, and, where identified, source code. This is a desk research survey, not a hands-on audit of every current release. “Representative” describes breadth of approaches, not a market-share ranking. Examples establish that a feature exists somewhere in the surveyed set; they are not exhaustive compatibility lists. An unlisted feature is **not** evidence that a product lacks it.

Jump to: [feature layers](#1-the-four-feature-layers), [product families](#2-major-product-families), [product profiles](#3-representative-product-profiles), [feature inventory](#4-consolidated-feature-inventory), [cross-layer bundles](#5-cross-layer-bundles-what-a-feature-actually-requires), [implications for Python Blocks](#6-implications-for-python-blocks).

## 1. The four feature layers

| Layer | What belongs here | Examples | Boundary to watch |
| --- | --- | --- | --- |
| **C — Core language** | Meaning of programs: values, control flow, abstraction, state, and execution semantics | Loops, named procedures, parameters, return values, variable scope, event handlers | A scheduler is implemented in the runtime, but its ordering, yielding, and cancellation rules affect language semantics. |
| **L — Library/runtime** | Operations available to a running program, including domain objects and services | Move a sprite, detect collision, play audio, load a tilemap, read a sensor | A Python library can implement an operation without providing a useful block or an editor for its inputs. |
| **T — Content creation tools** | Make or transform assets and structured content used by programs | Paint a costume, record/edit sound, compose a song, draw a tilemap, build a 3D scene | Some tools live inside a block input; this does not make them language features. |
| **E — Editor/workflow** | Assemble, inspect, organize, run, debug, save, and navigate a project | Block workspace, sprite list, property inspector, stage placement, asset picker, code view | A level designer spans T and E: painting map content is authoring; selecting objects and editing their properties is editor interaction. |

These are primary ownership categories, not mutually exclusive boxes. A complete user-facing feature often needs all four. “Core” here means language semantics, not “must ship first.” Accounts, galleries, classroom management, and grading form an adjacent platform layer, discussed separately below.

## 2. Major product families

| Family | Representative environments | Main creative or learning activity |
| --- | --- | --- |
| Early visual storytelling | ScratchJr | Arrange characters and short event-driven stories with a small icon vocabulary. |
| Open-ended 2D creativity | Scratch; Code.org Sprite Lab; Tynker Workshop | Animate actors, tell stories, and make interactive scenes. |
| Deeper computer science through blocks | Snap! | Explore richer data, procedural abstraction, and programming language ideas. |
| 2D game creation | Microsoft MakeCode Arcade; Code.org Game Lab | Build animated games with input, collisions, and game state. |
| Physical computing and robotics | MakeCode for micro:bit; mBlock 5 | Program sensors, outputs, and connected devices. |
| Component-based app creation | MIT App Inventor; Code.org App Lab | Design screens and connect UI components to behavior and data. |
| 3D worlds and immersive scenes | Delightex Edu, formerly CoSpaces Edu | Construct and program spatial scenes. |
| Blocks as a bridge to text | EduBlocks | Connect visual statements with written Python and other target languages. |
| Guided puzzles | Blockly Games | Learn concepts through constrained challenges and progression. |

The families overlap: a storytelling environment can make games, and a game editor can teach procedures. The profiles below provide the evidence behind this grouping.

## 3. Representative product profiles

### ScratchJr

- **Core:** event starts, ordered scripts, repeat/forever, waits, and colored-message coordination. The documented palette is deliberately small and icon-oriented. [Block reference][scratchjr-blocks]
- **Library:** character movement, rotation, hopping, speech, visibility, size, sounds, and page transitions. “Go home” uses the character's authored starting position. [Block reference][scratchjr-blocks]
- **Tools:** shape/freehand painting, fill, duplication, rotation, and camera images in the paint editor; recorded audio for stories. [Paint guide][scratchjr-paint], [curriculum][scratchjr-curriculum]
- **Editor:** character placement and story pages connect authored scene state to executable scripts. A useful reference for minimizing concepts visible at once. [Block reference][scratchjr-blocks]

### Scratch

- **Core:** arithmetic and logical expressions, variables/lists, and named custom command blocks with inputs. Treat “custom procedure” and “function returning a value” as separate requirements. [Operators][scratch-operators], [custom block guide][scratch-procedures]
- **Library:** independently behaving sprite clones, costume/sound state, audio playback, and a Music extension for notes and instruments. [Clones][scratch-clones], [sound and music][scratch-music]
- **Tools:** vector/bitmap costume creation, imported artwork, sound recording, and sound editing. The sound-editor source includes waveform selection, trim, copy/paste, fades, reverse, and speed/volume effects. The last claim is source-code evidence, not a release-specific UI audit. [Sprite art guide][scratch-paint], [asset packs][scratch-assets], [sound-editor source][scratch-sound-editor]
- **Editor:** sprite-specific artwork and sound tabs, named assets, and a custom-block definition dialog make the domain model visible. [Custom block guide][scratch-procedures], [sprite art guide][scratch-paint]

### Code.org Sprite Lab

- **Core:** event scripts and behaviors that execute repeatedly for a sprite; the learner does not have to author the frame loop explicitly. [Lab comparison][codeorg-comparison]
- **Library:** sprites and animation-oriented behaviors support beginner interactive scenes. [Sprite Lab overview][sprite-lab]
- **Tools:** the reviewed overview emphasizes creative projects and starting material; it does not establish a full waveform, music, or level-authoring suite. [Sprite Lab overview][sprite-lab]
- **Editor:** a beginner workspace with project examples and remixing. It is a useful reference for introducing behavior before an explicit update-loop model. [Sprite Lab overview][sprite-lab]

### Tynker Workshop

- **Core:** named functions with inputs, events, and messaging are documented in official lessons and tutorials. [Pen/functions tutorial][tynker-pen], [course feature list][tynker-course]
- **Library:** actor motion and pen drawing, plus a physics system with active/static bodies, gravity, forces, impulses, and collision response. [Workshop basics][tynker-workshop], [physics tutorial][tynker-physics]
- **Tools:** actors carry costumes and sounds; this survey has not separately verified the full current asset-editing toolset. [Workshop basics][tynker-workshop]
- **Editor:** searchable categorized blocks, an actor list, direct actor placement, and play/stop controls. These official tutorials span older releases; current availability should be checked by course, module, and account tier before adopting a feature specification. [Workshop basics][tynker-workshop]

### Snap!

- **Core:** custom command, reporter, and predicate blocks; parameters, local state, recursion, first-class procedures, and nested first-class lists. This gives “custom blocks” a much wider meaning than wrapping a sequence of actions. [Building a block][snap-blocks], [procedures as data][snap-procedures], [lists][snap-lists]
- **Library:** sprites, costumes, and sounds can themselves be values, alongside ordinary program data. [Manual introduction][snap-intro]
- **Tools:** bitmap/vector painting and sound recording. The manual explicitly distinguishes recording/managing sounds from having a built-in sound editor. [UI manual][snap-ui]
- **Editor:** custom-block editing and library export, visible stepping, and keyboard editing. Keyboard editing should not be interpreted as complete UI accessibility. [Building a block][snap-blocks], [UI manual][snap-ui]

### Microsoft MakeCode Arcade

- **Core:** variables, functions, conditions, loops, and events; multiple syntax views. Its language documentation explains that Blocks and Static Python lower to Static TypeScript: this is **not CPython execution**. [Language model][makecode-language], [variable reference][arcade-variables]
- **Library:** sprites/projectiles, overlaps, velocity/acceleration, backgrounds, cameras, tilemaps, scores/lives, and music. Advanced animation blocks are supplied through an extension. [Sprites][arcade-sprites], [scene][arcade-scene], [game information][arcade-info], [animation][arcade-animation]
- **Tools:** image/animation assets, a tilemap editor, and a song editor with notes, instruments, and measures. [IDE tour][arcade-ide], [tilemap authoring][arcade-tile-authoring], [song editor][arcade-song]
- **Editor:** a game simulator, debug controls, asset management, Blocks/JavaScript/Python views, hardware download, and project import/export. The song editor can also open from a gutter control in text code: asset authoring survives a syntax change. [IDE tour][arcade-ide], [song editor][arcade-song]

### Code.org Game Lab

- **Core:** blocks or JavaScript, with an explicit learner-authored draw loop. This differs from Sprite Lab's behavior model. [Lab comparison][codeorg-comparison]
- **Library:** a sprite-based game/animation model built around the frame loop. [Lab comparison][codeorg-comparison]
- **Tools:** an Animation tab for imported or drawn images, multiple frames, reordering, speed adjustment, and onion-skin previews. [Animation tab][gamelab-animation], [multi-frame editor][gamelab-frames]
- **Editor:** animation selection plus variable and sprite-property watchers for debugging. [Animation tab][gamelab-animation], [watchers][gamelab-watchers]

### MakeCode for micro:bit

- **Core:** the MakeCode language family applied to device programs, with event and background execution APIs. [Language model][makecode-language], [API reference][microbit-reference]
- **Library:** LED output, buttons/sensors, music, pins, radio, and serial communication. Hardware generation and attached components affect availability. [API reference][microbit-reference]
- **Tools:** live data visualization and logging are especially relevant here; micro:bit V2 also supports on-device data logging. [Data Viewer][microbit-data], [data logging guide][microbit-logging]
- **Editor:** a browser device simulator can emulate inputs, allowing many programs to be tried before using physical hardware. [Simulator][microbit-simulator]

### mBlock 5

- **Core:** block programming and Python/device modes must be evaluated separately. Official documentation distinguishes live Python 3 operation from device-upload MicroPython; these have different library constraints. [Python modes][mblock-python]
- **Library:** device capabilities and sprite services are extensible; documented examples include drawing and recognition/translation services. [Extension Builder][mblock-extensions]
- **Tools:** sprite/backdrop/audio workflows appear in its release history, but that history is not a current asset-tool specification. [Update history][mblock-history]
- **Editor:** device selection and extensions shape available blocks. Extension authors can configure custom widgets and code mappings for different targets. The Python mode article is from 2021, so it should not be used as a current list of supported devices. [Extension configuration][mblock-config], [Python modes][mblock-python]

### MIT App Inventor

- **Core:** named procedures with parameters and optional results, dictionaries, and, in the current reference, anonymous/higher-order procedures. [Procedures][appinventor-procedures], [dictionaries][appinventor-dictionaries]
- **Library:** UI/layout components, drawing/animation, media, sensors, storage, connectivity, maps, and charts. Components expose properties, events, and methods. [Component reference][appinventor-components]
- **Tools:** the visual screen designer authors the component arrangement. This is UI content creation, not sprite painting. [Designer and Blocks][appinventor-designer]
- **Editor:** the Designer and Blocks views connect structure to behavior; defining a procedure adds its call block, and renaming it updates callers. [Designer and Blocks][appinventor-designer], [procedures][appinventor-procedures]

### Code.org App Lab

- **Core:** JavaScript through blocks or text, with event-driven app behavior. [Lab comparison][codeorg-comparison]
- **Library:** UI components and persistent app data. [Lab comparison][codeorg-comparison]
- **Tools:** Design mode composes screens through positioned and resized UI elements. [Design mode][applab-design]
- **Editor:** a property pane and stable element IDs connect visually authored components to code. [Design mode][applab-design]

### Delightex Edu, formerly CoSpaces Edu

- **Core:** CoBlocks exposes variables, lists, functions, return values, and control of scene flow. [CoBlocks reference poster][delightex-blocks]
- **Library:** 3D object transforms, object relationships, media, and physics. The official Pro guide documents physics settings, so do not assume every capability is available in every tier. [CoBlocks reference poster][delightex-blocks], [Pro guide][delightex-pro]
- **Tools:** construct scenes with ready-made objects or primitives; import media/models, choose environments, and record narration. [3D creation][delightex-creation]
- **Editor:** spatial composition and scene organization are central to the programming workflow. This is a useful reference for object placement beyond a 2D stage. The FAQ confirms the product's former name. [3D creation][delightex-creation], [FAQ][delightex-faq]

### EduBlocks

- **Core:** blocks closely represent written code, with Python among the supported targets. This is the closest surveyed reference to the proposed blocks-to-Python learning flow. [Product overview][edublocks]
- **Library:** capabilities depend on the selected environment, including Python and physical-computing targets. The overview does not establish universal desktop Python package compatibility. [Product overview][edublocks]
- **Tools:** the documented emphasis is code and learning workflows; a built-in sprite, sound, or level authoring suite was not established by the reviewed sources. [Product overview][edublocks]
- **Editor:** a real-time text view and classroom block/text assignment modes. Teacher tooling includes starter projects and output-based tests; that is a separate platform feature from the language. [Product overview][edublocks], [teacher guide][edublocks-classrooms]

### Blockly Games

- **Core:** staged practice with block connections, loops, conditionals, functions, and mathematical expressions. [About the games][blockly-games]
- **Library:** each activity supplies a small domain, such as a maze, drawing turtle, music, or programmable pond inhabitants. [About the games][blockly-games]
- **Tools:** the reviewed material describes puzzle environments rather than a general asset-production suite. [About the games][blockly-games]
- **Editor:** constrained activities and gradual exposure to text; Pond Tutor alternates blocks and JavaScript, while Pond accepts either. Offline use is documented. [About the games][blockly-games]

### Framework distinction: Blockly

Blockly supplies a customizable visual code editor and code generation infrastructure. It does not by itself supply a sprite engine, Python execution, sound studio, level editor, or complete learning product. Those are responsibilities of the host application. This is the relevant baseline for our repository. [What is Blockly?][blockly-framework]

## 4. Consolidated feature inventory

The following **68 feature entries** are a vocabulary for product planning. They are not 68 commitments. Each row includes an observed reference and the integration or semantic distinction that matters when implementing it. The final column is our design analysis, not a claim that every referenced product implements the proposed behavior.

### C — Core language: 16 entries

| ID | Feature | Observed reference | Integration or decision for Python Blocks |
| --- | --- | --- | --- |
| C01 | Ordered statements and script entry points | [ScratchJr triggers/scripts][scratchjr-blocks] | Define what runs at startup and how multiple entries relate. |
| C02 | Values, arithmetic, comparisons, Boolean/text operations | [Scratch operators][scratch-operators] | Keep block behavior consistent with Python types and conversions. |
| C03 | Conditional branching | [Blockly Games Maze/Bird][blockly-games] | Show Boolean sockets and nested branches clearly. |
| C04 | Counted, conditional, and indefinite repetition | [ScratchJr repeat/forever][scratchjr-blocks]; [Blockly Games][blockly-games] | Indefinite loops require a responsive Stop and a scheduling policy. |
| C05 | Mutable variables | [MakeCode variables][arcade-variables] | Naming UI, readable assignment, and inspection belong alongside semantics. |
| C06 | Local state and scope | [Snap! block variables][snap-blocks]; [MakeCode scope][arcade-variables] | Distinguish function-local, object, and shared state explicitly. |
| C07 | Lists as values; nested collections | [Snap! first-class lists][snap-lists] | Decide indexing, mutation, iteration, and visual inspection. |
| C08 | Dictionaries and structured records | [App Inventor dictionaries][appinventor-dictionaries] | Useful for app/data work; requires key/value editing and display. |
| C09 | Named command procedures | [Scratch custom blocks][scratch-procedures] | Definition, call block, navigation, and rename behavior form one feature. |
| C10 | Procedure parameters | [Tynker function inputs][tynker-pen] | Support signature editing and update existing call sites. |
| C11 | Functions returning values; predicates | [Snap! custom reporters][snap-blocks]; [App Inventor results][appinventor-procedures] | Separate statement calls from expression calls without losing Python clarity. |
| C12 | Recursion | [Snap! recursive blocks][snap-blocks] | Needs understandable call-stack errors and execution limits. |
| C13 | First-class/anonymous procedures and higher-order calls | [Snap! procedures as data][snap-procedures]; [App Inventor procedures][appinventor-procedures] | Advanced capability; a language may support it before the beginner palette does. |
| C14 | Events, messages, and handlers | [ScratchJr message triggers][scratchjr-blocks] | Specify event payload, ordering, fan-out, and handler lifetime. |
| C15 | Waits, concurrent activities, and cancellation | [ScratchJr wait/stop][scratchjr-blocks]; [Sprite Lab behavior model][codeorg-comparison] | Decide yielding and Stop semantics; emitting several Python loops is insufficient. |
| C16 | Reusable custom block definitions/libraries | [Snap! library export][snap-blocks] | Reuse requires dependencies, names, and serialization, beyond a block shape. |

### L — Libraries and runtime: 22 entries

| ID | Feature | Observed reference | Integration or decision for Python Blocks |
| --- | --- | --- | --- |
| L01 | Pen/turtle drawing | [Tynker pen][tynker-pen] | Coordinates, heading, stroke state, clearing, and renderer. |
| L02 | Sprite creation, cloning, destruction | [Scratch clones][scratch-clones]; [Arcade sprites][arcade-sprites] | Distinguish authored objects from runtime instances and define copied state. |
| L03 | Position, direction, size, and depth | [Arcade sprite properties][arcade-sprites] | Coordinate convention, units, anchors, inspector, and stage handles. |
| L04 | Appearance, costumes, visibility | [Scratch sprite artwork][scratch-paint]; [ScratchJr looks][scratchjr-blocks] | Asset identity and picker, initial appearance, and runtime updates. |
| L05 | Frame and movement animation | [Arcade animation extension][arcade-animation] | Animation assets, timing, playback state, and interruption. |
| L06 | Overlap/collision detection and events | [Arcade sprites][arcade-sprites] | Collision shape, filtering, event frequency, and optional debug overlays. |
| L07 | Velocity, acceleration, and wall response | [Arcade sprites][arcade-sprites] | Time step and units must be explicit; movement is more than changing x/y. |
| L08 | Physics bodies, forces, and impulses | [Tynker physics][tynker-physics] | Full physics is a separate scope choice from detecting overlap. |
| L09 | Backgrounds, camera, and screen effects | [Arcade scene API][arcade-scene] | Separate world coordinates, viewport, and decorative backdrop. |
| L10 | Tilemaps, walls, and tile-based placement | [Arcade tilemaps][arcade-tilemaps] | Map assets, collision metadata, scene loading, and spawn locations. |
| L11 | Keyboard/controller and device input | [Arcade simulator controls][arcade-ide]; [micro:bit APIs][microbit-reference] | Bindings, focus, device differences, and event versus polling APIs. |
| L12 | Audio asset playback and completion | [Scratch sound/music][scratch-music]; [playback semantics][scratch-play-sound] | Playing, waiting, overlapping sounds, and stopping are separate behaviors. |
| L13 | Musical notes, instruments, and songs | [Scratch Music extension][scratch-music]; [Arcade song editor][arcade-song] | Symbolic music differs from playing a recorded audio file. |
| L14 | Score, lives, timers, and game HUD | [Arcade game information][arcade-info] | Decide whether these are convenience library objects or generic UI. |
| L15 | UI widgets, screens, component properties/events | [App Inventor components][appinventor-components] | Requires an authored component model and event bindings. |
| L16 | Persistent app data | [App Lab overview][codeorg-comparison]; [App Inventor storage category][appinventor-components] | Persistence lifetime and failure behavior are separate from variables. |
| L17 | Sensors, LEDs, pins, and actuators | [micro:bit APIs][microbit-reference] | Device capabilities, permissions, simulator behavior, and deployment target. |
| L18 | Radio, serial, and external connectivity | [micro:bit APIs][microbit-reference]; [App Inventor connectivity][appinventor-components] | Connection state and asynchronous failures need visible feedback. |
| L19 | Data sampling, logging, and charts | [micro:bit Data Viewer][microbit-data]; [logging][microbit-logging] | Specify sample schema, timestamps, storage, and chart configuration. |
| L20 | Recognition/translation and other service extensions | [mBlock extensions][mblock-extensions] | Service availability, consent, latency, and clear extension boundaries. |
| L21 | 3D transforms and object relationships | [CoBlocks reference][delightex-blocks] | World/local coordinates, hierarchy, camera, and spatial selection. |
| L22 | Scene/page transitions and restart | [ScratchJr pages][scratchjr-blocks]; [CoBlocks reference][delightex-blocks] | Define which state persists between scenes and how reset works. |

### T — Content creation tools: 10 entries

| ID | Feature | Observed reference | Integration or decision for Python Blocks |
| --- | --- | --- | --- |
| T01 | Bitmap/vector costume painting | [Scratch artwork guide][scratch-paint] | Persist editable artwork as well as a runtime-renderable asset. |
| T02 | Pixel/image drawing for game assets | [Game Lab Animation tab][gamelab-animation] | Canvas size, palette, transparency, previews, and asset registration. |
| T03 | Multi-frame animation authoring | [Game Lab frames/onion skin][gamelab-frames] | Ordered frames, duration, duplication, playback preview, and frame references. |
| T04 | Sound recording | [Scratch sound/music][scratch-music]; [Snap! recording][snap-ui] | Microphone permission, recording state, preview, naming, and storage. |
| T05 | Waveform editing and audio effects | [Scratch sound-editor source][scratch-sound-editor] | Selection, trim, destructive edits, undo, and preserving source audio. |
| T06 | Song composition/sequencing | [Arcade song editor][arcade-song] | Note grid, instruments, tempo/timing, and reusable song assets. |
| T07 | Tilemap/level painting | [Arcade tilemap authoring][arcade-tile-authoring] | Tile palette, layers, walls, dimensions, and gameplay metadata. |
| T08 | 3D scene construction | [Delightex 3D creation][delightex-creation] | Primitive/asset placement, transforms, environment, and hierarchy. |
| T09 | Asset importing and library reuse | [Scratch asset packs][scratch-assets]; [Delightex formats][delightex-faq] | File validation, dimensions/units, naming, references, and provenance. |
| T10 | Visual UI/screen composition | [App Lab Design mode][applab-design] | Produces component/layout data; selection and property editing also belong to E. |

### E — Editor and project workflow: 20 entries

| ID | Feature | Observed reference | Integration or decision for Python Blocks |
| --- | --- | --- | --- |
| E01 | Connected blocks, sockets, and nested workspace | [Blockly framework][blockly-framework] | Connection rules, dragging, readable layout, and touch behavior. |
| E02 | Toolbox categories and block search | [Tynker Workshop][tynker-workshop] | Discoverability, progressive disclosure, and search vocabulary. |
| E03 | Procedure definition and call-site maintenance | [App Inventor procedures][appinventor-procedures] | Add/remove parameters, rename references, and jump to definition. |
| E04 | Object/component list and relevant code | [Tynker actors][tynker-workshop]; [App Inventor views][appinventor-designer] | Make the currently edited object unambiguous. |
| E05 | Direct stage placement and initial properties | [Tynker placement][tynker-workshop]; [ScratchJr home position][scratchjr-blocks] | Separate saved initial state from positions changed while running. |
| E06 | Page/scene navigation and organization | [ScratchJr pages][scratchjr-blocks]; [Delightex scenes][delightex-creation] | Scene identity, order, duplication, and transition targets. |
| E07 | Asset lists, previews, and rich input editors | [Game Lab assets][gamelab-animation]; [Arcade music gutter editor][arcade-song] | Stable asset references must survive rename and blocks/text switching. |
| E08 | Run, stop, restart, and simulator | [Arcade IDE][arcade-ide]; [micro:bit simulator][microbit-simulator] | Define reset behavior and simulation limitations. |
| E09 | Pausing and execution stepping | [Snap! stepping][snap-blocks] | Requires execution-to-block mapping, not just a toolbar button. |
| E10 | Variable/object-property watchers | [Game Lab watchers][gamelab-watchers] | Show changing state without forcing print statements into every script. |
| E11 | Generated-code view and syntax switching | [EduBlocks live text][edublocks]; [Arcade editor views][arcade-ide] | Preview, editable text, and reversible conversion are different promises. |
| E12 | Saving and recovery | [Snap! UI manual][snap-ui] | Versioned project format, autosave status, migration, and recovery. |
| E13 | Project import/export | [Arcade project files][arcade-ide]; [Snap! library export][snap-blocks] | Distinguish a runnable project with assets from source-only export. |
| E14 | Device/target selection and deployment | [mBlock Python modes][mblock-python]; [Arcade download][arcade-ide] | Target choice may change available APIs and language behavior. |
| E15 | Extension discovery and configuration | [mBlock Extension Builder][mblock-extensions] | Explain required devices/services and version dependencies. |
| E16 | Guided tasks and progressively introduced concepts | [Blockly Games][blockly-games] | Tutorial state and restricted palettes are separate from language limits. |
| E17 | Undo, duplication, comments, workspace organization | [Snap! UI manual][snap-ui] | Consistent history and non-executable annotations. |
| E18 | Keyboard operation and accessibility | [Snap! keyboard editing][snap-ui] | Audit focus, screen-reader descriptions, zoom, contrast, and touch separately. |
| E19 | Contextual help and examples | [Snap! block help][snap-ui] | Link the selected concept to examples and meaningful explanations. |
| E20 | Sharing/remixing and source-control integration | [Sprite Lab remixing][sprite-lab]; [Arcade GitHub integration][arcade-ide] | UI workflow depends on platform services and project portability. |

## 5. Cross-layer bundles: what a “feature” actually requires

The bundles below are design deductions from the surveyed patterns. They explain implementation scope rather than asserting identical internals across products.

| User-facing feature | C: language | L: runtime | T: creation | E: editor | Project data to preserve |
| --- | --- | --- | --- | --- | --- |
| **Named procedure** | Definition, arguments, scope; optionally return value | Call execution; tracebacks/stack | Usually no asset tool | Define/signature UI, call blocks, rename, navigation | Stable definition identity and call references |
| **Controllable sprite** | Event handlers and references to objects | Lifecycle, transforms, drawing, collisions | Costume/animation creation | Sprite list, picker, inspector, stage placement | Authored sprite, asset references, initial properties |
| **Create and use a sound** | Calls/events; optional wait-for-completion semantics | Playback, mixing, stopping | Recorder, waveform editor, effects; music composer is separate | Asset browser, preview, input selector | Audio or song data, metadata, references |
| **Stage with placed objects** | References and startup behavior | Scene instantiation and reset | Backdrop/art creation | Drag placement, ordering, properties, scene selection | Authored scene and initial object state |
| **Tile-based game level** | Transitions and gameplay handlers | Map loading, collisions, camera, spawning | Tile painting, layers, wall/spawn annotation | Level list, palette, map preview, property editing | Map dimensions, cells, tile assets, metadata |
| **Blocks and editable Python** | Defined representable subset and semantics | Same execution behavior in both views | Asset tools accessible from either view | Source mapping, conversion, error/conflict handling | Program plus asset references and representation state |

Three especially consequential distinctions:

1. **Backdrop, object placement, and tilemap are separate features.** A background picture does not encode walls or spawn locations. A visual stage may allow drag placement without being a level editor. Arcade's tilemap tools provide a useful concrete reference for the additional structure. [Tilemap authoring][arcade-tile-authoring]
2. **A Python label does not establish ordinary Python compatibility.** MakeCode documents a static subset/transpilation model; mBlock distinguishes host and device Python modes. Evaluate syntax, interpreter, library availability, and deployment separately. [MakeCode language model][makecode-language], [mBlock modes][mblock-python]
3. **Playback, recording, editing, and composition are different capabilities.** Snap! documents recording without a sound editor; Scratch exposes waveform editing; Arcade composes songs. A single “supports sound” checkbox would erase these differences. [Snap! UI][snap-ui], [Scratch source][scratch-sound-editor], [Arcade composer][arcade-song]

## 6. Implications for Python Blocks

These are proposals for discussion, not changes to the [roadmap](../roadmap.md).

### Preserve the Python-first premise, but budget for the creative environment

The [current architecture](../architecture.md) already separates Blockly, generated Python, execution, and rendering. Extend that separation to **assets, authored scenes, and editor state**. Python supplies procedures and data structures; it does not automatically supply costume editors, stage placement, music composition, or block-aware debugging.

For a library to feel native to the product, consider a registration contract containing its Python API, blocks/generators, asset input types, inspector fields, event bindings, serialization needs, and execution permissions. This is our architectural inference from the cross-layer patterns, especially App Inventor's components and MakeCode's asset editors.

### Use different products as references for different problems

| Design problem | Most useful references from this survey | What to study next |
| --- | --- | --- |
| Named procedures that lead toward Python functions | Snap!; App Inventor | Definition/call UX, parameters, returned values, and scope visualization. |
| Immediate sprite creativity | Scratch; Sprite Lab; Tynker | Object selection, initial placement, costume workflow, and event discoverability. |
| Real game-level authoring | MakeCode Arcade | Tilemaps, walls, spawns, camera behavior, and reusable assets. |
| Block/text learning transition | EduBlocks; MakeCode | Code readability and view switching, while retaining our CPython semantics. |
| Linking authored objects to code | App Inventor; App Lab | Stable IDs, inspector fields, component events, and rename behavior. |
| Animation creation | Game Lab | Frame organization, preview, and onion skin. |
| Gradual introduction of concepts | ScratchJr; Blockly Games | Small initial vocabulary and progressively richer tasks. |

### Candidate boundaries for a first creative slice

A coherent next prototype would combine named functions and parameters, a small sprite library, a sprite list/inspector, direct initial placement, simple asset selection, input events, and understandable Run/Stop/reset behavior. It needs an explicit concurrency decision before several sprites run independent scripts.

Do not treat an advanced waveform editor, physics engine, tilemap authoring, robotics, mobile app builder, or 3D world builder as prerequisites for that slice. Each is a substantial extension with its own data model and editor work. Imported images/audio and a small bundled asset set can test creative workflows before building every asset tool.

Keep three project concepts distinct from the beginning:

- **Program:** block representation, generated Python, procedures, and event bindings.
- **Authored content:** assets, scenes, object identities, and saved initial properties.
- **Execution state:** current positions, active sounds, variables, clones, and running handlers.

This separation should make restart predictable and prevent a learner's original scene placement from being accidentally overwritten by a run. It also leaves room for both source export and complete project export.

## 7. Adjacent platform features and remaining research

Classrooms, assignments, feedback, sharing communities, moderation, and account management should have their own product inventory. For example, EduBlocks documents starter code, block/text assignment modes, and automated output checks; these are learning-platform capabilities rather than Python language features. [Teacher guide][edublocks-classrooms]

This first round does not establish pricing, license compatibility, accessibility conformance, privacy suitability, offline parity, or exact mobile support. Those need separate checks before selecting or reproducing a dependency or promising a deployment target. In particular:

- MakeCode capabilities depend on its target; an Arcade feature is not automatically a micro:bit feature.
- mBlock device modes and extensions vary; the reviewed Python article is older documentation.
- Tynker tutorials describe features across releases; plan/module availability remains unverified.
- Delightex's Pro documentation must not be read as a promise about its free tier.
- Snap!'s manual notes ongoing updates; source and documentation evidence do not replace testing the chosen release.
- Arbitrary Python-to-block conversion, unrestricted Python packages, and full keyboard accessibility were **not** established merely by finding a Python view or keyboard mode.

The most useful next research is a small hands-on comparison using the same tasks: define a parameterized function returning a value; place two sprites and reset them; coordinate two timed scripts; create/import and play a sound; save and reopen a project; and inspect the corresponding text code. Record which steps require language changes, runtime APIs, content tools, and editor integration using the IDs above.

## Sources

Links throughout the document point to the primary materials reviewed. Official tutorials may predate the research date; the date above is the review date, not a claim that every page was newly published or every described feature is available in every edition.

[scratchjr-blocks]: https://www.scratchjr.org/explore/blocks
[scratchjr-paint]: https://scratchjr.org/pdfs/paint-editor-guide.pdf
[scratchjr-curriculum]: https://www.scratchjr.org/curricula/playground/playground-games-full.pdf
[scratch-operators]: https://scratchfoundation.org/learn/learning-library/operators
[scratch-procedures]: https://cms.scratchfoundation.org/assets/a717cdc3-723b-4189-92f3-54e966aabb4b
[scratch-clones]: https://www.scratchfoundation.org/learn/learning-library/clones
[scratch-music]: https://www.scratchfoundation.org/learn/learning-library/sound-music
[scratch-paint]: https://cms.scratchfoundation.org/assets/3cd9dade-be5e-48c9-b507-f4cbf450f07e
[scratch-assets]: https://cms.scratchfoundation.org/assets/c5577dea-af6d-4897-8629-4b0ee30eca15
[scratch-sound-editor]: https://github.com/scratchfoundation/scratch-editor/blob/develop/packages/scratch-gui/src/components/sound-editor/sound-editor.jsx
[scratch-play-sound]: https://scratch.mit.edu/help/studio/tips/blocks/playsound/
[codeorg-comparison]: https://support.code.org/hc/en-us/articles/360039984911-What-are-the-differences-between-App-Lab-Game-Lab-Web-Lab-Sprite-Lab-and-Java-Lab
[sprite-lab]: https://code.org/en-US/tools/sprite-lab
[tynker-pen]: https://www.tynker.com/blog/tynker-toolbox-the-pen-blocks/
[tynker-course]: https://www.tynker.com/school/coding-curriculum/programming-202/15
[tynker-workshop]: https://www.tynker.com/blog/tynker-workshop-basics/
[tynker-physics]: https://www.tynker.com/blog/tynker-toolbox-the-physics-blocks/
[snap-intro]: https://docs.snap.berkeley.edu/
[snap-blocks]: https://docs.snap.berkeley.edu/building-a-block/
[snap-procedures]: https://docs.snap.berkeley.edu/procedures-as-data/
[snap-lists]: https://docs.snap.berkeley.edu/first-class-lists/
[snap-ui]: https://docs.snap.berkeley.edu/user-interface-elements/
[makecode-language]: https://makecode.com/language
[arcade-variables]: https://arcade.makecode.com/blocks/variables/var
[arcade-sprites]: https://arcade.makecode.com/reference/sprites
[arcade-scene]: https://arcade.makecode.com/reference/scene
[arcade-info]: https://arcade.makecode.com/reference/info
[arcade-animation]: https://arcade.makecode.com/reference/animation
[arcade-ide]: https://arcade.makecode.com/ide-tour
[arcade-tile-authoring]: https://arcade.makecode.com/concepts/setting-the-scene
[arcade-tilemaps]: https://arcade.makecode.com/reference/scene/set-tilemap
[arcade-song]: https://arcade.makecode.com/reference/music/song-editor
[gamelab-animation]: https://studio.code.org/docs/concepts/game-lab/animation-tab/
[gamelab-frames]: https://studio.code.org/docs/concepts/game-lab/animation-tab/multi-frame-animations/
[gamelab-watchers]: https://studio.code.org/docs/concepts/game-lab/debugging-with-watchers/
[microbit-reference]: https://makecode.microbit.org/reference
[microbit-data]: https://makecode.microbit.org/device/data-analysis
[microbit-logging]: https://www.microbit.org/get-started/user-guide/data-logging/
[microbit-simulator]: https://makecode.microbit.org/device/simulator
[mblock-python]: https://support.makeblock.com/hc/en-us/articles/4411195519511-Python-Programming-on-mBlock-5
[mblock-extensions]: https://support.makeblock.com/hc/en-us/articles/15232549794199-About-mBlock-5-Extension-Builder
[mblock-config]: https://support.makeblock.com/hc/en-us/articles/15236012027287-Configuration-Add-an-Extension
[mblock-history]: https://support.makeblock.com/hc/en-us/articles/14778939402135-mBlock-5-Update-History
[appinventor-procedures]: https://ai2.appinventor.mit.edu/reference/blocks/procedures.html
[appinventor-dictionaries]: https://ai2.appinventor.mit.edu/reference/blocks/dictionaries.html
[appinventor-components]: https://ai2a.appinventor.mit.edu/reference/components/
[appinventor-designer]: https://appinventor.mit.edu/explore/designer-blocks
[applab-design]: https://studio.code.org/docs/concepts/app-lab/design-mode/
[delightex-blocks]: https://cdn.edu.delightex.com/site/assets/pdf/CoBlocks-overview-poster_2%20_1.pdf
[delightex-pro]: https://cdn.edu.delightex.com/site/assets/pdf/Delightex-Edu-Pro-Guide.pdf
[delightex-creation]: https://www.delightex.com/edu/3d-creation
[delightex-faq]: https://www.delightex.com/edu/tech-check-faq
[edublocks]: https://edublocks.org/
[edublocks-classrooms]: https://docs.edublocks.org/docs/classrooms/for-teachers
[blockly-games]: https://blockly.games/about?lang=en
[blockly-framework]: https://docs.blockly.com/guides/get-started/what-is-blockly/
