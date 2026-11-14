# 3. From MIDI to seats

## 3.1 Pipeline

The diagram shows how a file becomes the notes that each animal plays.

```text
.mid file (bytes)
   │ midi/: parse
   v
MidiFile: tracks of events in ticks, with ports
   │ score/: file rules (3.3), tempo map from all tracks
   v
Channel events in seconds, with no SysEx
   │ score/: program map (3.5), channel 10 map (3.6)
   v
Notes with a section ───> Seats (3.7)
   │ score/: player allocation (3.8)
   v
Score: seats, player notes, beats, synth events, presets
   │                                  │
   v                                  v
pose/: poses for the scene       audio/: the worklet plays the synth events
```

The sound and the visuals come from the same `Score`. Thus they follow the same rules.

## 3.2 Data model

`score/types.ts` holds the types. The snippet shows the main fields, with no `readonly`.

```typescript
/** The order of `SECTION_ORDER`. `sound-only` holds the notes with no animal (3.5). */
type SectionId =
  | 'violin' | 'viola' | 'cello' | 'contrabass' | 'harp' | 'piano'
  | 'flute' | 'oboe' | 'clarinet' | 'bassoon'
  | 'horn' | 'trumpet' | 'trombone' | 'tuba'
  | 'timpani' | 'percussion' | 'choir' | 'sound-only';

type Technique = 'normal' | 'pizzicato' | 'tremolo';

/** One group of animals of one section (3.7). */
interface Seat {
  section: SectionId;
  /** The (port, channel) pairs that feed the seat. A merge (3.7) gives more than one. */
  sources: { port: number; channel: number }[];
  /** 0 for the first seat of its section. Selects the species variant (4.3). */
  indexInSection: number;
  /** 1 to the cap of the section (3.8). 0 for the sound-only seat. */
  playerCount: number;
  /** The melodic programs, in the order of first use. */
  programs: number[];
  /** The drum kits of the rhythm sources (3.6), in the order of first use. */
  kits: number[];
}

/** One note of one player. */
interface PlayerNote {
  seatIndex: number;
  /** 0 is the principal player of the seat. */
  player: number;
  pitch: number;
  velocity: number;
  startSec: number;
  /** At key release. The sustain pedal does not change it. */
  endSec: number;
  technique: Technique;
  /** `port * 16 + channel` of the note on. A gesture reads the controllers of it (5.3). */
  synthChannel: number;
}

/** One conducted beat (5.4). */
interface Beat {
  timeSec: number;
  /** 0 is the downbeat of the bar. */
  indexInBar: number;
  beatsInBar: number;
  /** The baton pattern. 'generic' is one down-up motion for each beat. */
  pattern: 1 | 2 | 3 | 4 | 6 | 'generic';
  /** True when a pulse of the felt pulse starts at this beat (5.1). */
  pulse: boolean;
}

/** One event for the synth, in song seconds. There is no SysEx. */
interface SynthEvent {
  timeSec: number;
  /** portIndex * 16 + channel (3.4). */
  channel: number;
  /** High nibble of the MIDI status byte. */
  kind: 0x80 | 0x90 | 0xa0 | 0xb0 | 0xc0 | 0xd0 | 0xe0;
  data1: number;
  data2: number;
  /** The seat of a note event, or -1 for an event of a full channel. */
  seatIndex: number;
}

interface Score {
  /** The last note-off. The UI shows `Math.floor(durationSec + 0.001)` seconds. */
  durationSec: number;
  /** FF 03 of the first track, or '' for none, no letter, or a generic name (8.2). */
  sequenceName: string;
  /** The rule of 3.8. The setting "Section size" does not change it. */
  orchestral: boolean;
  /** The seat at the front left of the conductor (3.8, 4.2), or `null`. */
  soloist: number | null;
  /** The choir seat of the vocal soloists (3.8), or `null`. */
  vocalSoloists: number | null;
  /** In the order of `SectionId`, then of the first (port, channel). */
  seats: Seat[];
  /** Sorted by startSec. */
  notes: PlayerNote[];
  beats: Beat[];
  /** Sorted by timeSec. */
  synthEvents: SynthEvent[];
  /** The presets that load before play, in the order of first use. Drum kits use bank 128. */
  presets: { bank: number; program: number; drumKit: boolean }[];
}
```

The diagram shows how the types refer to each other.

```text
┌──────────────┐ 1      * ┌──────────────────┐
│    Score     │<>───────>│       Seat       │
└──────┬───────┘          └────────┬─────────┘
       │ *                         ^
       ├──────> PlayerNote ────────┤ seatIndex
       │ *                         │
       └──────> SynthEvent ────────┘ seatIndex (-1 for an event of a full channel)
```

The app builds the score with one function of `score/score.ts`. A change of the setting "Section
size" builds the score again.

```typescript
type FileError = 'not-midi' | 'format-2' | 'too-large' | 'no-notes';

type SectionSize = 'auto' | 'one-per-part' | 'full';

type ScoreResult = { ok: true; score: Score } | { ok: false; error: FileError };

function buildScore(bytes: Uint8Array, sectionSize: SectionSize): ScoreResult;
```

## 3.3 File rules

- **Refused files.** The app shows a message of 2.8 and keeps the current piece, also a demo that
  still loads, for each of these: a file that is not a valid Standard MIDI File, a file of
  format 2, a file with no notes, a file that the page cannot read (`readScoreFile()` in
  `app/file-rules.ts`), and a file of more than `MAX_FILE_BYTES`. The size check comes before
  the read into the memory.
- A file with SMPTE time division is not valid, because music files use ticks for each quarter
  note.
- A file with more than `MAX_BEATS` conducted beats (5.4) is not valid. Without this limit, one
  far note off gives a song of thousands of hours, and its beat list fills the memory. The limit
  counts beats, so it also holds for a very fast tempo.
- The text of a name event (`FF 03`) is UTF-8, else Latin-1 read with the `windows-1252` decoder
  of the WHATWG Encoding standard.
- The app removes all SysEx messages before the synth and the visuals get the events. Thus a GS
  drum part SysEx cannot change the sound without a change to the visuals.
- A tempo event or a time signature event in any track applies to all tracks, because some
  format 1 files put them outside track 0. At the same tick, the event of the later track applies.
- The pairs of note ons and note offs come from all tracks of a port, as the synth pairs them on
  each channel. A note on with velocity 0 is a note off. The first note off on a key ends the
  oldest open note on that key. A note with no note off ends at the end of its track. A note off
  with no open note has no effect on the synth, so `score/` drops it.
- A channel with no program change uses program 0. A file with no tempo or time signature uses
  120 BPM in 4/4.

## 3.4 Ports and channels

- Each MIDI port is a group of 16 channels. The app does not merge ports.
- A port event (`FF 21`) sets the port of its track, and the first one applies to the full track.
  A track with no port event uses port 0.
- Only the tracks with channel events give ports. The ports are ordered by port number, and a
  seat names the port index, so the first port of each file is port 0. The synth channel is
  `portIndex * 16 + channel`.
- Channel 10 (index 9) of each port is a rhythm channel.

## 3.5 Program map

`programPlace()` in `score/program-map.ts` gives the section of each GM program.

| GM programs | Instruments | Section |
|---|---|---|
| 0-7, 8, 16-23 | Pianos, celesta, organs | piano |
| 9-15, 112-119 | Mallets, bells, percussive | percussion |
| 24-31, 46, 104-108 | Guitars, harp, plucked ethnic | harp |
| 32-39, 43 | Basses, contrabass | contrabass |
| 40, 110 | Violin, fiddle | violin |
| 41 | Viola | viola |
| 42 | Cello | cello |
| 44, 45 | Tremolo, pizzicato | the earlier section of the channel, else the next later one, else divided by pitch |
| 48-51, 88-95 | String ensembles, synth pads | divided by pitch across the strings |
| 47 | Timpani | timpani |
| 52-54 | Choir, voices | choir |
| 56, 59 | Trumpet, muted trumpet | trumpet |
| 57 | Trombone | trombone |
| 58 | Tuba | tuba |
| 60 | French horn | horn |
| 61-63 | Brass sections | divided by pitch across the brass |
| 64-67, 71 | Saxophones, clarinet | clarinet |
| 68, 69, 109, 111 | Oboe, English horn, bagpipe, shanai | oboe |
| 70 | Bassoon | bassoon |
| 72-79 | Piccolo, flute, other pipes | flute |
| 55, 80-87, 96-103, 120-127 | Orchestra hit, synth leads, effects | `sound-only` |

- "Divided by pitch" uses fixed pitch bands (`STRING_BANDS`, `BRASS_BANDS`). Each boundary is
  the lowest note of the higher instrument.
- For a note of 44 or 45, "the earlier section of the channel" is the section of the last earlier
  note of another program on the same (port, channel).
- The sound-only seat shows in the seat list as "Other sounds", so the user can mute and solo it.
  It has no players.
- Program 44 gives `tremolo`. Programs 45 and 32 to 39 give `pizzicato`, because a bass guitar is
  plucked and MuseScore plays contrabass pizzicato with program 32.
- A bank select (CC 0) takes effect at the next program change of its channel. A missing bank
  falls back to bank 0 in the synth. The visuals use only the program.

## 3.6 Channel 10

The GM1 drum map has no timpani. The GS and GM2 Orchestra kit (`ORCHESTRA_KIT`) adds timpani on
keys 41 to 53, where GM1 has toms and a crash cymbal. Thus the visual map follows the kit that the
synth plays. A program change on a rhythm channel selects the kit (`score/drum-map.ts`).

| Keys | Orchestra kit | Keys | Other kits (GM1) |
|---|---|---|---|
| 41-53 | timpanist | 41, 43, 45, 47, 48, 50 (toms) | timpanist |
| 35, 36 | bass drum | 35, 36 | bass drum |
| 38, 40 | snare drum | 37, 38, 40 | snare drum |
| 57, 59 | cymbals | 42, 44, 46, 49, 51, 52, 55, 57, 59 | cymbals |
| all other keys | small percussion | all other keys | small percussion |

- Melodic program 47 on any channel also goes to the timpanist.
- GM2 rhythm on channel 11 and GS SysEx drum parts play as melodic channels.

## 3.7 Seats

A **seat** is one group of animals of one section. The seat key is (port, channel, section).

- A program change inside a section keeps the players and changes only the technique. A change to
  another section makes a new seat, and the old seat rests.
- One channel can feed several seats, as a string ensemble divided by pitch does.
- **Articulation channels.** In a format 1 file, the (port, channel) pairs of one track that map
  to one section form one seat. MuseScore puts each articulation of a part on its own channel, so
  this rule keeps one part in one seat. A rhythm channel never merges with a melodic channel.
- **Single players.** All channels of the piano, the harp, or the timpani form one seat with one
  player. A piece for two pianos thus shows one pianist.
- **More than 60 seats.** If more than `MAX_PLAYERS` seats have players, the seat with the fewest
  notes moves its notes to the sound-only seat until `MAX_PLAYERS` remain. Of two equal seats, the
  later one moves. The synth events stay, so the sound does not change.

## 3.8 Players

`assignPlayersSteps()` in `score/players.ts` gives the players. `CAPS` holds the cap of each seat, and
`BASE_SIZES` the base sizes of the strings and the choir.

| Seat | Players |
|---|---|
| Woodwinds, brass | One player for each simultaneous note. |
| Piano, harp, timpani, mallets | One player plays all notes. |
| Channel 10 percussion | One player for each key group that the file uses, at most 4: bass drum, snare drum, cymbals, small percussion. |
| Strings and choir, orchestral file | The base size. A chord divides the players across the notes (divisi), highest note first. |
| Strings and choir, other file | One player for each simultaneous note. |

- A file is **orchestral** if it has a woodwind or brass seat, a timpani seat with program 47 or
  the Orchestra kit, an ensemble program (44, 45, 48-51), or program 43. The GM1 toms and the
  bass guitars do not count, because many pop files use them.
- The setting "Section size": "Auto" uses the rule above, "One per part" gives one player for each
  simultaneous note, and "Full" gives the base sizes.
- The scene has at most `MAX_PLAYERS` players. The conductor is not a player.
- Above `MAX_PLAYERS`, the app removes one player at a time: first from the largest string or
  choir seat, down to its "One per part" size, then from the largest other seat. A seat keeps at
  least one player. Of two equal seats, the later one loses the player.
- A percussion seat with fewer players than key groups gives the other groups to its last player.
- When a seat has more notes than players, a player takes two notes, as a double stop. A wind
  player cannot play two notes, so the pose decides what it shows (section 5).
- In a chord, the highest note goes to player 0. Thus each player keeps a stable pitch range.
- **Overlap.** Two notes are simultaneous when the earlier note ends more than `OVERLAP_SEC`
  after the start of the later note. A shorter overlap is a legato or a grace note, and one
  player plays it.
- **Chord.** Notes with the same start are one chord. A later note joins if it starts within
  `OVERLAP_SEC` of the first note, and each note of the chord is longer than `OVERLAP_SEC`. Thus a
  rolled chord gets the same players as a chord with equal starts. An earlier note that sounds at
  the chord start counts for all notes of the chord, and each chord gets one division of the
  players.
- A new note takes the player of its pitch rank among the sounding notes. If an earlier note holds
  that player, it takes the nearest free player, the higher one at the same distance.
- **Divisi.** With an uneven division, each higher note gets one more player. With more notes than
  players, the players take the notes in pitch order, highest first.

**Soloist.** A seat that is clearly the soloist sits at the front left of the conductor, as in a
real concerto. `findSoloist()` in `score/soloist.ts` finds it with the player counts of the size
rule, before the removal above 60 players, on a time grid. `SOLOIST_RULE` holds the shares. The
soloist gets one player, and `Score.soloist` holds it.

- A **piano seat** with a piano program (0 to 5) is always the soloist, so a piano with an
  orchestra has the layout of a piano concerto (4.2). A harpsichord, a clavinet, a celesta, or an
  organ plays color or continuo in an orchestra. It is the soloist only by the test below, else it
  sits beside the harp (4.2).
- A **candidate** is a seat of a section that can carry a solo (no timpani, percussion, or choir),
  with at least three other seats with players. It has one player and no other seat of its
  section has players, or it is an **exposed solo line**: one line on channels that feed no other
  seat, which sounds alone in its section or louder than it for most of its time.
- A seat is **one line** when it has one voice, or when two or more of its notes sound together
  in less than `SOLOIST_RULE.chords` of its sounding time. A solo part can hold a few double
  notes, as the bassoon of K. 191 does, and they make no section. A seat of one line with one
  player for each simultaneous note thus counts as a seat of one player. A string section with
  its base size has more players than voices, so it is no line of one player.
- A candidate is **clearly the soloist** when it sounds in a large share of the piece, is above
  the orchestra (by its key or by its loudness) in most of its time, and has an orchestra with it.
  Loudness lets a low soloist, such as a bassoon, lead.
- Exactly one candidate must pass. Two candidates that pass, as in a double concerto, give no
  soloist.
- The share "above the orchestra" is high enough that a concertino of several equal soloists,
  as in Brandenburg Concerto 2, gives no single soloist. Thus the first violin desk stays clear
  in all section sizes, and the K. 315 flute stays the soloist.

**Vocal soloists.** A choral work can have solo singers beside the choir, such as the four
soloists of a symphony finale. `findVocalSoloists()` in `score/vocal-soloists.ts` finds them on
the same grid. No demo has vocal soloists, and the rule serves a file of the user.

- A candidate is a choir seat with at most four voices, beside another choir seat with players.
- It sings with no other choir seat in most of its time, and one voice sings alone in a part of
  its time, as in a recitative.
- Exactly one candidate must pass. `Score.vocalSoloists` holds it. The seat gets one singer for
  each voice, and the singers stand in front of the choir (4.5).
