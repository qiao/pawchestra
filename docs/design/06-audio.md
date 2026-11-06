# 6. Audio

## 6.1 Engine

The app uses its own AudioWorklet processor, which bundles `spessasynth_core` and `stb-vorbis`
(both Apache-2.0, pinned to exact versions). The thin wrapper `spessasynth_lib` is not used. These
options are rejected:

| Option | Reason for rejection |
|---|---|
| WebAudioFont | GPL-3.0, which conflicts with an Apache-2.0 app. |
| gleitz sound sets | No loop points, and the licenses conflict. |
| Tone.js Sampler | No loop point for each sample. |
| js-synthesizer | LGPL, a large SF3 decoder, and no mute API. |
| spessasynth_lib | A main-thread scheduler cannot cancel queued events. Its sequencer does not restart held notes at a seek, and a pause loses the pedal state. |

### Room and mix

The sound is full and professional, in the room of a concert hall, and never dry or thin.

- **Pan and send.** `stageMix()` of `score/stage-mix.ts` gives each synth channel the pan of the
  mean place of its players in the default camera view (4.5), so a player on the left of the
  screen sounds on the left. The reverb send grows with the distance from the podium, so the back
  rows sound farther away (`NEAR_REVERB_SEND`, `FAR_REVERB_SEND`).
- **Choir gain.** A choir channel gets `CHOIR_GAIN_DB`, because one channel sings for a full
  choir. The vocal soloists get no gain. It is a channel gain of spessasynth_core, because CC 7
  gives only a few dB above its value 100.
- **Velocity curve.** The demo files give each dynamic mark only as a note velocity, with CC 7 at
  100 and no CC 11. The SF2 default curve (960 cB) puts pp (velocity 28) 21 dB below f (velocity
  96), and p (velocity 40) 15 dB below f. A soft sample layer adds `LAYER_STEP_DB`. Thus
  `narrowVelocityCurve()` of `audio/velocity-curve.ts` sets the amount of this modulator in each
  bank to `VELOCITY_ATTENUATION_CB`. Each modulator of GeneralUser GS with the same source and
  destination gets the same share. `SynthEngine.addBanks()` applies it before the synth makes a
  voice. The curve acts on each note, so it has no pumping, and each crescendo keeps its timing.
  The synth gets the velocity of the file, so it selects the same sample layer. 6.8 gives the rule
  for the amount.
- `mixSynthEvents()` replaces the pan (CC 10) and the reverb send (CC 91) of the file with the mix.
- **Room and hall.** The synth has no chorus. Its reverb is the short GS room "Room 1", locked
  with `reverbLock` over each reset. The worklet has one stereo output, so the hall reverb of the
  output chain (6.8) gets the full mix.
- **Mix bus.** The output chain (6.8) adds a pre-delay, a band filter, and a width stage to the
  hall return, a tone EQ, and a glue compressor before the limiter. Two mix presets set it:
  `hall`, the default, and `cinematic`, with a longer hall, more low end, and more width. The
  query `?mix=` selects one for a listening test.

## 6.2 SoundFont

The SoundFont has high quality, and a larger download is acceptable for it: about 10 MB of
preset files for one piece, after the first frame. The first download stays below 1 MB (7.2).

- `tools/build-soundfont.ts` makes `assets/soundfont/Pawchestra.sf3` from locked sources
  (`tools/soundfont-lock.json`), so two builds write the same bytes.
- The base is GeneralUser GS. Its license asks us not to link to the files of the author, so the
  site serves its own copy. The orchestral presets come from the CC0 libraries VSCO 2 CE and VCSL
  (`tools/soundfont-recipes.ts`). No source with a usable license has a choir, a celesta, or a
  section of basses.
- Each new preset matches the level of the GeneralUser GS preset that it replaces. Every preset
  gets the headroom `SOUNDFONT_HEADROOM_DB`, which the output chain adds back.
- `tools/split-soundfont.ts` writes one file for each preset at
  `sf/<bank>/<program>.<hash>.sf3`, and `sf/index.json` with the path and the size of each file.
  The hash is the first 10 hex digits of the SHA-256 of the file, so a host can keep each preset
  file in the cache for a long time and check only the index. The app finds a preset or its fallback in the index
  (bank 0, or kit 0). The build gzips each preset file in place (7.2).
- The hall impulse response of St Paul's Hall (CC BY 4.0) is in `assets/hall/`.

## 6.3 Load flow

The decode of a sample on the audio thread can take longer than one block, so the app decodes all
samples before play.

```text
the file loads (the default demo: right after the first frame)
   │
   v
main thread: parse the file -> Score -> list of presets
   │ fetch each preset file that the synth does not have: sf/<bank>/<program>.sf3
   v
Web Workers (1 to 4): spessasynth_core converts each SF3 file to a PCM SF2 (no cache)
   │ transfer the PCM buffers (transferable objects, no copy)
   v
AudioWorklet: add the new banks (each add resets the synth) ── kept for the session
   │
   v
play is enabled
```

- The Workers work while the `AudioContext` is suspended, so the default demo is ready before the
  first click. Each bank add resets the synth, so all banks load before play starts (2.4).
- The synth keeps each bank for the session, and the `Player` asks only for the presets that the
  synth does not have. Thus each preset is in memory one time.
- The decode starts when `sf/index.json` arrives. `splitDecodes()` spreads the files over up to
  four Workers, because one Worker made the decode the slowest part of the load.
- The app starts the audio output service of the browser when it starts (`warmAudioOutput()`),
  and the `AudioContext` waits for it. In Chrome, the first `AudioContext` of a browser otherwise
  blocks the main thread until the service runs: one long task of the load (7.2).

## 6.4 Block scheduler

The processor holds the full event list of the `Score` and runs the scheduler inside each audio
block. Thus there is no queue to cancel and no timer, and a hidden tab does not change the sound.

```text
Main thread                           AudioWorklet thread (our processor)
┌──────────────────────────┐          ┌───────────────────────────────────┐
│ score/ -> synthEvents    │  one     │ event list (typed arrays)         │
│ (typed arrays, seat ids) │  time    │                                   │
│                          │─────────>│ each 128-frame block:             │
│ Player: play, pause,     │ commands │  1. apply transport commands      │
│ seek, rate, seat audible │─────────>│  2. send the events that are due  │
│                          │          │     (skip notes of silent seats)  │
│ now(): from the anchor   │ anchors  │  3. spessasynth_core renders      │
│ and the clock (6.7)      │<─────────│  4. post an anchor after a change │
└──────────────────────────┘          └───────────────────────────────────┘
```

- `SynthEngine` (`audio/engine.ts`) holds the synth and the pure scheduler with no Web Audio code,
  so the Node tests render it offline. The events arrive as a `SynthEventTable` of typed arrays.
- An event sounds from the start of the block that holds its song time: up to one block early,
  and never late.
- The processor makes all synth channels before the first event, and `process()` catches a render
  error and outputs silence, because either fault would stop the processor for good.
- `addBanks()` warms up the voice code of each new preset, silent, while the context is suspended,
  because the first notes of a preset run cold code.
- The context uses `latencyHint: 'interactive'`, because a larger buffer adds latency in Chrome.

## 6.5 Seek, pause, resume, and unmute

- A seek releases all notes, resets the synth, and sends the chase: the programs, the banks, and
  the controllers at the seek point.
- A held note starts before the seek point and continues after it. Only instruments with a long
  sound (bowed strings, winds, brass, choir, organ, synth leads and pads) start held notes again
  (`sustainsAfterSeek()`). The same rule applies after a pause, after the count-in, and at an
  unmute. `notePairs()` sends a note off only when its note on sounds, because the synth pairs note
  offs first in, first out.
- At the song end, the transport pauses at the song length, and a play there starts from 0.
- **Count-in.** The conductor gives a count-in before the music (5.4). The song time starts one
  count-in before the start point (the pause point, or 0), in song seconds. `startPlay()` of
  `app/transport.ts` gives both values, so the `Player` and the pose use one count-in.
- A seek to the song start during play has the start point `Number.MIN_VALUE`, because the pose
  gives the ready gesture only to a count-in from 0.

## 6.6 Mute and solo

Mute and solo work for each seat, also when seats share a channel, and several seats can be
soloed. A seat sounds if it is not muted, and no seat or this seat is soloed.

- A seat that becomes silent gets note offs for its held notes at once, and the processor skips
  its later notes (3.2). A seat that becomes audible starts its held notes again (6.5).
- When all seats of a channel are silent, the processor stops all notes of the channel, so that a
  sustain pedal does not keep them. On a channel with audible seats, it sends a pedal up and then
  the old pedal value.
- The processor plans all seat changes of one block together, so a solo is as fast as one seat
  change.
- Mute and solo reset when a new file loads. A load resets the seat flags of the `Player`, so the
  app sends each silent seat again after it.

### Speed of a mute

A user expects silence at once from the mute button of the bar. A seat mute removes one voice of
the orchestra, and the hall rings on, as in a real hall.

```text
bar mute:   synth ── room ── hall ── limiter ── volume gain: 1 -> 0, VOLUME_TIME_CONSTANT
                                                   └─ dry sound and all tails stop together
seat mute:  note offs of the seat -> release of the voices -> room and hall ring on
```

The hall gets the full mix, so it cannot stop the tail of one seat alone.

## 6.7 Clock

`Player.now()` gives the song time of the sound that the listener hears now. Bluetooth headphones
often add more than 100 ms of output latency, so the sync of the animation needs this clock.

- The processor posts a `ClockAnchor` at each transport change and one time each second.
- `AudioContext.getOutputTimestamp()` already includes the output latency, except in Firefox.
  Thus `chooseHeardTime()` takes `currentTime - outputLatency` when the timestamp is later by more
  than half of the latency, with no check of the browser name.
- `now()` uses the last anchor at or before the heard time, so after a seek the old anchor stays
  in effect until the listener hears the seek. `addAnchor()` keeps the anchors of the last 1 s,
  because 1 s is more than the largest output latency.

## 6.8 Interfaces

```typescript
interface Player {
  /** Loads the engine on the first call, then the presets of the score. */
  load(score: PlayerScore, onProgress: ProgressListener): Promise<void>;
  /** Plays from the start point after a count-in of `countInSec` song seconds (6.5). */
  play(countInSec: number): void;
  pause(): void;
  seek(songSec: number): void;
  setRate(rate: number): void;
  /** Sets the volume gain at the end of the output chain (6.6). */
  setVolume(gain: number): void;
  /** The app calculates this value from the mute and solo rules (6.6). */
  setSeatAudible(seatIndex: number, audible: boolean): void;
  /** Song seconds of the sound that the listener hears now (6.7). Smooth between blocks. */
  now(): number;
}

/** The processor sends this when a transport change takes effect, and one time each second. */
interface ClockAnchor {
  /** AudioContext seconds at the start of the block where the change took effect. */
  readonly contextTime: number;
  /** Song seconds at that block start. */
  readonly songTime: number;
  /** Playback rate. 0 while paused. */
  readonly rate: number;
  /** The number of the score in the engine: 1 for the first `loadScore()`, then 2, and so on. */
  readonly load: number;
}

interface PlayerScore extends Pick<Score, 'durationSec' | 'synthEvents' | 'presets'> {
  /** The pan, the reverb send, and the gain of each synth channel, from `stageMix()` (6.1). */
  readonly mix: readonly ChannelMix[];
  /** The gain of the piece in dB, from `pieceGainDb()`. */
  readonly gainDb: number;
}
```

- `WorkletPlayer` implements the interface. A load resolves only after its own banks are in the
  synth. A later `load()` replaces a pending one (2.2), which rejects with a `LoadReplacedError`.
- An error ends the engine, and the next `load()` starts a new one, so the "Try again" button of
  2.8 can succeed. A failure that no pending load reports goes to `onError`.
- Safari and iOS can refuse a resume of the context outside a user gesture. Thus a click that waits
  for the samples, and a selection of a demo, resume the context at once.

### Output chain

`createOutputChain()` of `audio/output-chain.ts` makes this chain one time for the session, with
the mix bus of the mix preset. Its constants hold the gains, the mix buses, the limiter, and the
time constant.

```text
AudioWorkletNode (stereo)
       │
       v
GainNode "input": the headroom of the SoundFont plus the gain of the piece
       ├──────────────────────┐
       │                      v
       │              DelayNode (preDelay)
       │                      v
       │              ConvolverNode (hall impulse response, stereo, normalize off)
       │                      v
       │              BiquadFilterNode high-pass, then low-pass (returnBand)
       │                      v
       │              ChannelSplitter -> 4 GainNodes -> ChannelMerger (returnWidth)
       v                      v
GainNode "dry" (1)    GainNode "wet" (wet)
       v                      v
GainNode "sum"
       │
BiquadFilterNode x 4: tone EQ (TONE_EQ: low shelf, low-mid peak, presence peak, high shelf)
       │
DynamicsCompressorNode "glue" (glue: low ratio, slow attack and release, hard knee)
       │
GainNode "glueTrim" (removes the makeup gain of the glue)
       │
DynamicsCompressorNode "limiter" (LIMITER: below full scale, hard knee, fast attack)
       │
GainNode "trim" (removes the makeup gain of the limiter)
       │
GainNode "volume": the volume slider and the mute button, VOLUME_TIME_CONSTANT
       │
context.destination
```

`MIX_BUSES` holds one `MixBus` for each mix preset:

```typescript
/** The settings of the mix bus of one mix preset. */
interface MixBus {
  /** The impulse response of the hall reverb: a FLAC file and a WAV file. */
  readonly hall: HallImpulse;
  /** The delay before the convolver, in seconds. */
  readonly preDelay: number;
  /** The cutoffs of the reverb return, in Hz. */
  readonly returnBand: readonly [highPass: number, lowPass: number];
  /** The gain of the side signal of the reverb return: 1 keeps the width. */
  readonly returnWidth: number;
  /** The gain of the reverb return. */
  readonly wet: number;
  /** The tone EQ on the sum of the dry path and the reverb return. */
  readonly tone: Tone;
  /** The glue compressor before the limiter, with the knee 0. */
  readonly glue: Compressor;
}

/** The gains of the tone EQ in dB, at the frequencies and Q values of TONE_EQ. */
interface Tone {
  readonly lowShelf: number;
  readonly lowMid: number;
  readonly presence: number;
  readonly highShelf: number;
}
```

- **Mix presets.** `hall` is the default. It uses the impulse response of St Paul's Hall
  (`ST_PAULS_HALL`), a concert hall of medium size, with small steps of each stage. `cinematic`
  uses the Konzerthaus of Detmold (`KONZERTHAUS`), a longer pre-delay, a wider return, more low
  end, and more glue. The Konzerthaus measure has the enhancement system of the hall on, which
  gives the decay of a large hall. Both files are measured halls with a CC BY 4.0 license (8.1),
  and `assets/hall/README.md` gives their sources. The wet gain of each preset sets the share of
  the hall in the output, because the energy of the two files differs by about 13 dB.
- **Query flag.** `mixOfQuery()` of `app/mix-query.ts` reads `?mix=hall` or `?mix=cinematic`, and
  gives `hall` with no query or with an unknown value. The app gives the preset to the `Player`
  and to `pieceGainDb()`. The flag is for a listening test of the two presets. The settings have
  no control for it.
- **Reverb return.** The pre-delay keeps the onset of each note clear before the hall starts. The
  high-pass keeps the low notes of the reverb from a boom, and the low-pass removes the hiss of
  the noise floor of the measurement. The width stage changes only the side signal of the return
  (mid-side), so the dry path keeps the pan of each seat (6.1).
- **Tone EQ.** The low shelf gives the body of the low strings and the brass. The cut in the low
  mids removes the mud of many instruments that sum there. The high shelf gives air. The presence
  peak cuts a harsh band of the SoundFont: in the 1/3-octave spectrum of a tutti, a chamber
  demo, and the choir demo, the band at 3.15 kHz is 4 dB to 6 dB above a line fit.
- **Glue.** The glue compressor joins the sections in a tutti with a little gain reduction: about
  1 dB to 2 dB with `hall` (`pnpm loudness`). Its slow attack lets the onsets pass, and its trim
  removes its makeup gain, as the trim of the limiter does. The knee is 0, so `makeupTrimDb()` is exact. Each compressor delays the output by
  6 ms in Chromium, and the clock (6.7) does not correct this small delay.
- **Gain of the piece.** `pieceGainDb()` brings each demo to `TARGET_LOUDNESS` (integrated) with
  the values of `DEMO_LOUDNESS` of the mix preset. The target is the music loudness of AES TD1008,
  because a louder target needs more gain reduction on the dynamic demos. A file of the user gets
  0 dB. `pnpm loudness --fit --write --mix <name>` measures and writes the values again after a
  change of a demo, the SoundFont, the velocity curve, the mix, the mix bus, the hall, or the
  limiter.
- **Loudness range.** A soft passage must stay audible at a volume that suits the loud passages.
  The median short-term loudness of the first 10 s of `beethoven-8` and `brahms-2` must be at most
  12 LU below `TARGET_LOUDNESS` (`st10` of `pnpm loudness`). `VELOCITY_ATTENUATION_CB` (6.1) is the
  largest amount of a sweep that obeys this rule and the limit of the limiter of
  `TARGET_LOUDNESS`. Thus each demo keeps as much range as the rule permits. A public domain
  recording of Brahms 2 mvt 4 by the Musopen Symphony
  ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Brahms_-_Symphony_No._2_in_D_major,_Op._73_-_IV._Allegro_con_spirito_%28Musopen_Symphony%29.flac))
  starts 13 LU to 14 LU below its integrated loudness. The piece gain does not compress a demo.
- **Limiter.** The trim removes the makeup gain of the compressor, so the chain does not change the
  level below the threshold. The threshold keeps the true peak of each demo at or below -1 dBTP
  (EBU R 128).
- **Volume.** The app gives the gain "volume" the square of the slider position, and 0 for the
  mute button (2.8). The volume comes after the limiter, so the limiter acts the same at each
  volume, and a mute also stops the hall tail.
- **Hall file.** The `Player` fetches only the impulse response of its mix preset, after the first
  frame: the lossless FLAC file (`flacUrl` of `HallImpulse`), and the WAV file (`wavUrl`) only
  when `decodeAudioData()` refuses the FLAC file.
