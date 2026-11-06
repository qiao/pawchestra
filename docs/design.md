# Pawchestra: design

This document records the design of a WebGL MIDI player for orchestral music. Low-poly animals
play the music on a small stage.

The design is the single source of truth for the product and design decisions. Each section holds
the current state, the rules, and the reasons. The tuned values live in the code, and a section
names the constant that holds each one. The text of sections 1 to 9 is in [`design/`](design/),
in one file for each section. The two-digit number at the start of a file name is the number of
its section. Thus a pointer "design X.Y" names the heading "X.Y" in the file of section X. For
example, design 4.5 is the heading "4.5 Visual values" in `design/04-stage-cast-look.md`. Read
only the files of your area.

A new decision goes into its design section, with its reason and with no history. Research
results go into the design or into a technique reference of [`reference/`](reference/). Git
history keeps the old decision files and research reports.

| File                                                    | Section and scope                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-goals.md`](design/01-goals.md)                     | 1. Goals and budgets: the platform, the budgets, and the reference images                                                             |
| [`02-product.md`](design/02-product.md)                 | 2. Product: input, first screen, layout, play and keyboard, camera, quality tiers, privacy, and UI spec (2.1 to 2.8)                  |
| [`03-midi-to-seats.md`](design/03-midi-to-seats.md)     | 3. From MIDI to seats: pipeline, data model, file rules, ports and channels, program map, channel 10, seats, and players (3.1 to 3.8) |
| [`04-stage-cast-look.md`](design/04-stage-cast-look.md) | 4. Stage, cast, and look: look, layout, species, models, visual values, model inventory, and rig (4.1 to 4.7)                         |
| [`05-animation.md`](design/05-animation.md)             | 5. Animation: pose index, pose function, rest pose, instrument motion, conductor, silent seats, and camera shots (5.1 to 5.6)         |
| [`06-audio.md`](design/06-audio.md)                     | 6. Audio: engine, SoundFont, load flow, block scheduler, seek and pause, mute and solo, clock, and interfaces (6.1 to 6.8)            |
| [`07-architecture.md`](design/07-architecture.md)       | 7. Architecture: modules, first download, third-party licenses, and search and share (7.1 to 7.4)                                     |
| [`08-demos.md`](design/08-demos.md)                     | 8. Demos: license rules, list, changes to the files, OpenScore files, and demo tests (8.1 to 8.5)                                     |
| [`09-process.md`](design/09-process.md)                 | 9. Process: repository, CI, tests, manual test, order of work, docs, targets, and reviews (9.1 to 9.8)                                |
