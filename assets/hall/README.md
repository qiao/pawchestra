# Hall impulse responses

This folder holds the two impulse responses of the hall reverb of the `Player` (design 6.8). The
mix preset `hall` uses St Paul's Hall, and the mix preset `cinematic` uses the Konzerthaus of
Detmold. Each WAV file has a FLAC file beside it with the same samples in a lossless file. The
`Player` fetches the FLAC file of its preset, and the WAV file only when `decodeAudioData()`
refuses it.

## St Paul's Hall

`st-pauls-hall-c8m.wav` comes from the measurement at position C8m in St Paul's Hall, the concert
hall of the University of Huddersfield. The Applied Psychoacoustics Lab measured it for the 360°
BRIR and FOA database.

| Item | Value |
|---|---|
| File | `st-pauls-hall-c8m.wav`, 480,044 bytes, 249 KB after gzip |
| SHA-256 | `aada37ea596e18073a2c0be8db4c2e2e5aef7c4076e4b35b277f813b748e43ac` |
| FLAC file | `st-pauls-hall-c8m.flac`, 127,980 bytes, the 16-bit samples of the WAV file |
| FLAC SHA-256 | `4694f4f067375d369ee90a08c4d3ff05ea522b5bd9b21813cff1f6a91622a1c9` |
| Format | WAV, 16-bit PCM, 2 channels, 48 kHz, 2.5 s (120,000 frames) |
| Source | Bacila, B. I., and Lee, H. (2019). 360° Binaural Room Impulse Response (BRIR) Database for 6DOF Spatial Perception Research. AES Convention 146, e-Brief 513 |
| Source record | <https://doi.org/10.5281/zenodo.2641166> (version 1, 2019-03-03) |
| Source archive | `360-BRIR-FOAIR-database.zip`, 6.6 GB, MD5 `3062197450b799b8d660c1bb1d2d6134` (from the Zenodo record) |
| Source file | `360-BRIR-FOAIR-database/FOA/B Format (AmbiX)/C8m.wav`, 3,840,736 bytes, first-order Ambisonics (AmbiX: W, Y, Z, X), 32-bit float, 48 kHz, 5 s |
| Source file SHA-256 | `824d2ddf643bd544c263185c159968151c028e7c7305edade60f226835c133a9` |
| License | CC BY 4.0, <https://creativecommons.org/licenses/by/4.0/>. The `License.txt` of the database holds the full text |
| License source | <https://github.com/APL-Huddersfield/360-BRIR-FOAIR-database/blob/3f0a8d77c211277d659bdaca4c473f9a91c5fd91/License.txt> |

The Zenodo record and the README of the database give the license "Creative Commons Attribution
4.0 International". The name of the hall is on the page of the lab:
<https://apl-hud.com/perception-of-room-acoustics-in-virtual-augmented-reality-in-the-context-of-6-degrees-of-freedom/>.

### Credit of St Paul's Hall

CC BY 4.0 asks for a credit, a link to the license, and a note of the changes (section 3(a)). The
credits panel and the third-party license file show this line (design 2.8, 7.3):

> Hall reverb: impulse response of St Paul's Hall, University of Huddersfield, from the 360° BRIR
> and FOA database by Bogdan Ioan Bacila and Hyunkook Lee (Applied Psychoacoustics Lab,
> University of Huddersfield), CC BY 4.0. Changed: decoded to stereo, direct sound removed,
> shortened.

`HALL_CREDIT` in `src/audio/hall-credit.ts` holds the same text and the links.

### Changes of St Paul's Hall

These steps make the file from the source file.

1. Decode to stereo with two virtual supercardioid microphones at ±70°:
   `L = 0.37·W + 0.63·(cos 70°·X + sin 70°·Y)`, and `R` is the same with `-sin 70°·Y`.
2. Remove the 49.67 ms of silence before the direct sound. The direct sound starts at the first
   sample whose level in L or R is above 10 % of the peak.
3. Set the first 4 ms to 0, and fade in over the next 1 ms (raised cosine). These 4 ms hold the
   direct sound and a reflection 2 ms after it, which is 70 % of the energy. The `Player` sends
   the full mix to the reverb, and the dry path already holds the direct sound.
4. Keep the first 2.5 s, and fade out over the last 0.5 s (raised cosine). After about 2 s, the
   decay reaches the noise floor of the measurement, about 45 dB below the start.
5. Scale the peak to -1 dBFS, and write 16-bit PCM.
6. Write the FLAC file from the WAV file with `tools/hall-flac.py` (see "FLAC files").

The L/R correlation of the result is 0.14. The T30 of the source position is 2.06 s broadband,
2.47 s at 500 Hz, 2.27 s at 1 kHz, and 1.89 s at 2 kHz.

## Konzerthaus of Detmold

`detmold-konzerthaus-r2.wav` comes from the measurement at the receiver position R2 (seat 163) in
the Konzerthaus of the Detmold University of Music, a concert hall of about 600 seats. The hall
has a room acoustic enhancement system. The file uses its preset "Choir and Orchestra", which
gives a longer decay than the natural hall (about 1.6 s). The authors measured the impulse
response with the system on, so the file is a measured impulse response of the hall in that
state.

| Item | Value |
|---|---|
| File | `detmold-konzerthaus-r2.wav`, 614,444 bytes, 390 KB after gzip |
| SHA-256 | `d882dc58f33d5e9d2fba944d70bf874b44eb3b11511bf8969b0a89e93c96439a` |
| FLAC file | `detmold-konzerthaus-r2.flac`, 226,418 bytes, the 16-bit samples of the WAV file |
| FLAC SHA-256 | `8ac1c10afa31ec04fc803984103499b793a8cc80afed527f1cb400e5164b4104` |
| Format | WAV, 16-bit PCM, 2 channels, 48 kHz, 3.2 s (153,600 frames) |
| Source | Amengual Garí, S. V., Sahin, B., Eddy, D., and Kob, M. (2020). Open Database of Spatial Room Impulse Responses at Detmold University of Music. AES Convention 149 |
| Source record | <https://doi.org/10.5281/zenodo.4116247> (version v0.2, 2020-10-21) |
| Source archive | `DetmoldSRIR_v01.zip`, 985,710,535 bytes, MD5 `dce94799dbab211b72f537395b3b4e47` (from the Zenodo record) |
| Source file | `SetA_SingleSources/Data/KonzertHaus/OpenArray/ArtificialReverb/C1S1R2_RevC5.wav`, 12,583,032 bytes, 6 channels (open array of omni microphones: front, back, right, left, top, bottom, 10 cm apart), 32-bit float, 48 kHz, 10.9 s |
| Source file SHA-256 | `229619c6b2162a2a9ab1baee391dd9748a055985f883b635c1e20db3f2e6b221` |
| Source position | Source S1 on the stage, receiver R2 at seat 163, 19 m from the front, no music stand (`C1`), enhancement preset `RevC5` "Choir and Orchestra (2.6s)" (`KH_Measurement_Info.txt` of the archive) |
| License | CC BY 4.0, <https://creativecommons.org/licenses/by/4.0/>, from the Zenodo record |

A range request can get the source file from the archive with no download of the full archive.
Each request sends the neutral User-Agent `pawchestra-build/1.0`.

### Credit of the Konzerthaus

The credits panel and the third-party license file show this line (design 2.8, 7.3):

> Cinematic hall reverb: impulse response of the Konzerthaus of the Detmold University of Music,
> from the Open Database of Spatial Room Impulse Responses at Detmold University of Music by
> Sebastià V. Amengual Garí, Banu Sahin, Dusty Eddy, and Malte Kob (Detmold University of Music),
> CC BY 4.0. Changed: decoded to stereo, direct sound removed, shortened.

`KONZERTHAUS_CREDIT` in `src/audio/hall-credit.ts` holds the same text and the links.

### Changes of the Konzerthaus

`tools/konzerthaus-ir.py` makes the file from the source file, and gives the same bytes each run:

```bash
uv run --no-project --with soundfile==0.14.0 --with numpy==2.5.4 python -I \
  tools/konzerthaus-ir.py <path of C1S1R2_RevC5.wav>
```

1. Make first-order B-format from the array. W is the mean of the six microphones. X is the front
   microphone minus the back one, and Y is the left microphone minus the right one. The script
   turns the phase of X and Y by -90°, and sets the energy of each 1/3 octave in the tail (0.15 s
   to 1.5 s) to 1/3 of the energy of W. This is the energy of an ideal figure-8 in a diffuse
   field. Below 1.5 kHz, the gain is about `1 / (k d)` with `d` = 10 cm.
2. Decode to stereo with the two virtual supercardioid microphones of St Paul's Hall (step 1
   above).
3. Remove the 77.31 ms of silence before the direct sound, as in step 2 above.
4. Set the first 4 ms to 0, and fade in over the next 1 ms (raised cosine). These 4 ms hold 36 %
   of the energy.
5. Keep the first 3.2 s, and fade out over the last 0.6 s (raised cosine). At 2.6 s, the decay is
   about 55 dB below the start at 1 kHz, near the noise floor of the measurement.
6. Scale the peak to -1 dBFS, and write 16-bit PCM.
7. Write the FLAC file from the WAV file with `tools/hall-flac.py` (see "FLAC files").

The L/R correlation of the result is 0.34. Its T30 is 2.73 s broadband, 2.74 s at 500 Hz, 2.82 s
at 1 kHz, and 2.64 s at 2 kHz.

## FLAC files

`tools/hall-flac.py` writes each FLAC file from its WAV file with libsndfile 1.2.2 (through
soundfile 0.14.0), at the compression level 1.0. The script reads each file back and stops if one
sample differs:

```bash
uv run --no-project --with soundfile==0.14.0 --with numpy==2.5.4 python -I tools/hall-flac.py
```

A FLAC file is a change of the format only. Section 2(a)(4) of CC BY 4.0 permits the Licensed
Material "in all media and formats" with the "technical modifications necessary to do so", and
such a change "never produces Adapted Material". Thus the credit lines stay.

To check the files:

```bash
shasum -a 256 assets/hall/*.wav assets/hall/*.flac
```
