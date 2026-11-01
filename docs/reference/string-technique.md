# String technique: how professional players move both hands

This file is the target of the motion of the string players of the app: the violin, the viola,
the cello, and the double bass (the app calls it the contrabass). It describes how professional
players move the left hand, the fingers, and the bow arm, with a source for each fact.

**Upkeep.** This file is current. A change of the string motion of the app updates section 3 "Use
in the app" and each fact that it finds wrong, in the same commit. Each new fact gets its source.

**Source marks.** Each fact names its source by a number of section 4. "(abstract)" marks a fact
from an abstract or a search summary, because the full text did not open. "(secondary)" marks a
fact that another source quotes. "(derived)" marks a value that this file calculates from the
values of its sources. A fact with no mark comes from the text of the source.

## Terms

- **Position.** The place of the left hand on the neck. The first finger marks it. On the A
  string of the violin, the first finger on B is the first position, on C the second position, and
  on D the third position [1].
- **Frame.** The span of the fingers in one position, from the first finger to the fourth finger
  [1].
- **Shift.** A move of the hand from one position to another position.
- **Extension.** A finger that reaches past the frame, below the first finger or above the fourth
  finger, with no shift.
- **Thumb position.** The cello and the double bass put the side of the thumb on the string high
  on the neck. The thumb then acts as a movable nut [5].
- **Guide finger.** The finger that stays on the string and slides during a shift [20].
- **String plane.** The plane of the bow that touches one string and not its neighbors. The bow
  turns around the strings from one plane to the next plane.
- **Sounding point.** The place of the bow on the string, as the distance from the bridge.
- **Bow change.** The turn of the bow from a down-bow to an up-bow, or back.

## 1. The left hand

### 1.1 The open strings and the string lengths

| Value | Violin | Viola | Cello | Double bass |
|---|---|---|---|---|
| Open strings, low to high (`TUNINGS` of `src/pose/fingering.ts`) | G3 D4 A4 E5 | C3 G3 D4 A4 | C2 G2 D3 A3 | E1 A1 D2 G2, an octave below the written part |
| Vibrating string length | 330 mm (Stradivari and Guarneri del Gesù) [8] | No standard. Bodies from 360 mm to 430 mm [8] | About 700 mm [8] | 1,050 mm to 1,100 mm on orchestral basses [8] |
| First semitone at the nut (derived) | 18.5 mm | 20.8 mm at a string of 370 mm | 39.3 mm | 60.3 mm at a string of 1,075 mm |

The first semitone takes 5.6% of the string, `L × (1 − 2^(−1/12))`. Each higher semitone is 5.6%
shorter than the semitone below it, so the same interval is shorter in mm high on the string.

### 1.2 Positions and the hand frame

The frame of the violin and the viola is a perfect fourth (5 semitones) from the first finger to
the fourth finger. Galamian named it the "frame" of the hand [1]. Small hands spread less than a
perfect fourth in the first position, and the frame is smaller in mm in the higher positions [1].
The cello hand covers a minor third (3 semitones) from the first finger to the fourth finger [6]
[7]. The closed hand of the double bass (Simandl) covers a whole tone (2 semitones) with the
fingers 1, 2, and 4 [9 (abstract)].

| Value | Violin and viola | Cello | Double bass |
|---|---|---|---|
| Frame, first finger to fourth finger | Perfect fourth, 5 semitones [1] | Minor third, 3 semitones, in the patterns 1-2-4 (half step, whole step) and 1-3-4 (whole step, half step) [6] | Whole tone, 2 semitones, fingers 1-2-4 (the closed hand of Simandl). The open hand 1-2-3-4 spans a minor third [9 (abstract)] |
| First position on the A string (violin, viola, cello) or the G string (bass) | B (1), C or C♯ (2), D (3), E (4) [1] [4] | B (1), C (2), C♯ (3), D (4). The first finger is about 6 cm from the nut [7] | A (1), A♯ (2), B (4) (derived from the frame) |
| Extension | The fourth finger reaches one semitone up. Use extensions sparingly, so that the hand keeps the feeling of its position [1] | A whole tone between the first and the second finger gives a major third, 1-x2-4 [6] | The hand pivots on the thumb (Rabbath) [10 (abstract)] |
| Half position | The first finger a semitone above the open string [4] | All fingers a semitone lower than in the first position [11] | The first finger a semitone above the open string (Simandl) [12 (abstract)] |
| Other positions | The third position puts the first finger a fourth above the open string. The fifth position plays the notes of the first position on the string above [4] | The fourth position starts with the first finger on E on the A string, a fifth above the open string [11]. The neck positions use a little less than half of the fingerboard [13] | The closed hand of Simandl covers 85% to 90% of the playing [9 (abstract)] |
| Thumb position | None | From the half-string harmonic (the octave). Thumb, first finger, and second finger are a whole step and a whole step apart, and the third finger a half step above the second finger: thumb on A, fingers on B, C♯, and D [5] | Above the octave of the G string. The third finger takes the place of the fourth finger [5] |

Good fingerings keep the frame. Fischer calls them "blocks" of fingers in one position, with no
move "from note to note or phrase to phrase" where the music permits [1].

### 1.3 Pitch ranges of the parts

The smallest range that holds 95% of the notes of each part in a corpus of string quartets is D4
to D6 for the first violin, A3 to F5 for the second violin, E3 to B4 for the viola, and D2 to D4 for
the cello [14]. The ranges of the second violin, the viola, and the cello fit in the first position
with the open strings. The top of the first violin, D6, is the fourth finger in the third position
on the E string (derived). Haydn and Mozart used F6 in the fifth position as the top of their
orchestral violin parts [15]. The first and the third positions are the two most common positions
in beginning and intermediate viola music [16]. No source of this file gives the share of the
notes in each position of a professional orchestral part.

### 1.4 When a player shifts

- Play "with as few changes … as possible". The most common shift is a third, such as from the
  first position to the third position [17].
- Take the time of the shift from the note before it: "cut the value of the note before the shift
  by half and use the remainder of the time to shift" [2]. Galamian: "One of the commonest faults
  found in shifting is that of shortening the note preceding the move" [2 (secondary)].
- Shift on an open string or after it. Two fingering programs give a shift after an open string
  half of its cost, or a cost of its own, because the open string hides the slide [18] [19].
- Shift after a rest or a long note. One fingering model counts a rest four times as much as a
  note of the same length, as time for a change of the hand [18].
- Keep the bow on one string or on a neighbor string. A skip of a string costs five times a cross
  to a neighbor string in one fingering program [19].
- Avoid an open string in a lyric line, because it cannot take vibrato. A fingering model learned
  this rule from the fingerings of professionals [36].

### 1.5 How a shift moves

The left hand takes 294 ms to 461 ms for a shift of a third: the mean of each of six professional
violinists, from the start of the shift to the new pitch [20]. The tempo (60 to 100 bpm) changed
the time for only two of the six players. Each player has a speed of shift of his or her own [20].

| Player (height) | 60 bpm | 72 bpm | 100 bpm |
|---|---|---|---|
| S1 (1.86 m) | 317 ± 40 ms | 308 ± 38 ms | 300 ± 30 ms |
| S2 | 404 ± 57 ms | 404 ± 62 ms | 389 ± 45 ms |
| S3 | 333 ± 40 ms | 319 ± 39 ms | 294 ± 33 ms |
| S4 | 364 ± 18 ms | 376 ± 24 ms | 351 ± 42 ms |
| S5 | 302 ± 57 ms | 309 ± 34 ms | 305 ± 34 ms |
| S6 (1.50 m) | 461 ± 42 ms | 453 ± 43 ms | 455 ± 43 ms |

The shift starts in the old note, and the new finger lands before the bow change [20] [23]:

```text
            old note                          | new note
  ------------------------------------------- 0 ms: bow change ------>
  [ shift: 294 ms to 461 ms, starts in the old note ]
  the guide finger slides on the string (5 of 6 players)
                          the new finger lands 26 ms to 41 ms before 0
                                     a finger lift that starts a lower
                                     note comes 29 ms to 51 ms after 0
```

- **The part that leads.** The thumb starts most shifts of the shorter players: 87% of the
  downward shifts and 72% of the upward shifts. The wrist starts 83% of the upward shifts of the
  taller players. Only two of six players moved the elbow to the side to start a shift. Five of six
  players kept a guide finger on the string until the new finger arrived [20].
- **The arm on the violin and the viola.** Between the first and the fourth positions, the forearm
  turns at the elbow, and the elbow stays in place. From the third to the sixth position, the hand
  goes "up and over" the shoulder of the instrument on the thumb, and the elbow swings a little to
  the right. Between the seventh and the ninth positions, the hand moves "almost from the wrist
  alone". On the way down, below the fifth position, the thumb goes back to the side of the neck,
  and the elbow swings back to the left [1].
- **The elbow in a high position.** In the sixth position, the angle of the left upper arm from
  the vertical is 2° to 4.7° larger than in the second position, for each of five holds of the
  violin. The mean over all holds and positions is 21.4°, with a range of 12° to 32° [21].
- **The cello.** Gravity helps the elbow on the upward shifts. The thumb at the joint of the neck
  and the body is a landmark for the fourth position [22 (abstract)].
- **The bow in a slurred shift.** Galamian asks for "a slight slowing down of the bow stroke and a
  gentle lifting of the pressure during the motion of the left hand" [3 (secondary)].
- **Timing against the bow.** A shift does not change the time of the finger against the bow
  change. The new finger lands 26 ± 17 ms before the bow change with no shift, and 35 ± 27 ms
  before it with a shift. With a string change, it lands 29 ± 9 ms before with no shift, and
  41 ± 13 ms before with a shift [23]. The shifts run "in parallel rather than in series" with the
  bow [23].

### 1.6 The fingers

- **Land before the bow.** The finger of a new note lands before the bow change, and a finger
  lift that starts a lower note comes after it. The time from the finger to the bow is −12 ms to
  60 ms, and the finger lifts are 30 ms to 50 ms after the bow on the mean, with a standard
  deviation of about 20 ms. The tempo (110 to 180 bpm) did not change them [24]. "The bow must
  always 'wait' for the finger to be down" (Fischer, 1993) [25 (secondary)].
- **Keep the fingers down.** "No finger should leave the string unless obliged to do so"
  (Courvoisier, 1893) [25 (secondary)].
- **Prepare the next finger.** In a line that goes down, the next lower finger moves slowly onto
  the string almost one note early, under the finger that sounds. The lift of the upper finger
  then starts the new note. The neighbor fingers move and stop together, short of the string [24].
- **Fast fingers start late.** "The faster the finger drops on to the string or lifts from it, the
  later the dropping or lifting must begin" (Fischer, 2010) [25 (secondary)].
- **Force.** A violinist presses the string with 2.7 N on the mean, about 1 N at fast tempos, and up
  to 5 N in loud passages [26 (secondary)].

### 1.7 Vibrato

Vibrato rocks the fingertip along the string, so the vibrating length changes [4] [27]. The change
is less than ±5 mm on a violin string of about 300 mm, about ±20 cents [27].

| Value | Violin | Viola | Cello | Double bass |
|---|---|---|---|---|
| Rate | About 5.5 Hz in 40 high school and university violinists and cellists, with no difference between the instruments [28 (abstract)]. 5.7 Hz in the first position and 6.3 Hz in a higher position for one professional [30 (abstract)]. About 5 Hz [27] | A little slower than the violin in the same students [29 (abstract)] | 6.5 Hz (s = 0.42) in 54 excerpts of concerto recordings, and 5.3 Hz (s = 0.28) in a sample library [31] | No source |
| Width | ±20 cents from the finger motion, and about 50 cents in the example of an expert [27]. Wider in high registers [29 (abstract)] | A little narrower than the violin [29 (abstract)] | Narrower than the violin [28 (abstract)]. Wider in high positions [31] | No source |
| What moves | The fingers alone, the wrist, or the whole forearm, by the style of the player [4] | As the violin | The upper arm turns in the shoulder (low positions), the forearm opens and closes at the elbow, the forearm and the hand turn, and the knuckles follow [35]. A contact further on the pad gives a fuller vibrato [13] | No source |

A depth of 0.2 to 0.35 semitones (Meyer, 1992) is a common value for the string instruments [31
(secondary)]. The string length changes by 0.15 mm for each cent at the first position of the
violin, by 0.32 mm on the cello, and by 0.52 mm on the double bass (derived from section 1.1).

### 1.8 The left arm and the elbow for each string

- **Violin and viola.** The left elbow hangs under the instrument. It is a little to the right of
  the vertical on the G string, and more to the left on the E string [1]. Players bring the left
  elbow "to where they can see it" to reach the lower strings [4]. A forum report says that many
  teachers teach four places of the elbow for the four strings, and that the move is very small in
  a fast scale [32]. No source of this file gives the angle of the elbow for each string.
- **Cello.** The left elbow is higher for the lower strings. One teacher gives an elbow at about
  45° on the A and the D strings, a little higher on the G string, and "almost level with the
  ground" on the C string [33]. Another teacher writes that the need for a low elbow grows from the
  lower strings to the higher strings because of the curve of the fingerboard, and is largest on
  the A string [34 (abstract)].
- **Double bass.** No source.

### 1.9 The hand on the neck

- **The thumb.** The thumb sits on the side of the neck, opposite the fingers. In the first
  position, Auer puts it opposite the second finger, Galamian between the first and the second
  fingers or opposite the first finger, Flesch and Ševčík opposite the first finger, and Suzuki
  between the first finger and the nut. An open space stays between the base of the thumb and the
  first finger, and the hand does not squeeze the neck [67].
- **The first finger.** The side of the first finger touches the neck lightly [67].
- **The fingers.** The fingers keep a natural curve, and they move from the base joints, while the
  hand stays still [68].
- **The wrist.** "In low positions the back of the hand should be in a straight line with the
  elbow, wherever possible." In the higher positions, the wrist bends outward. A wrist that sticks
  out can give tension [68].

### 1.10 The violin under the jaw

- **The place.** The player places the violin or the viola on the left collarbone, or in the soft
  spot just behind it, and rests "the left side of your jaw on the chin rest" [76, 77]. The chin
  can be on the right edge of the chin rest [78].
- **The level and the angle.** The instrument "is held horizontally (parallel with the floor) and
  is angled to the left of a straight forward position" [76, 77]. One guide gives "about 45
  degrees" to the left, with the fiddle "slightly tilted down toward the right but is still level
  to the ground" [78].
- **The head.** The player keeps the head straight and holds the instrument between the chin rest
  and the shoulder rest [78]. No source of this file gives the angle of the head.
- **The left elbow and the left shoulder.** "The left elbow is always mobile underneath the
  violin." It is more to the right on the G string and in the high positions [79]. In a study of
  violin students, the left upper arm turned 16° to 25° from the vertical toward the middle of the
  body (adduction), and the left shoulder (the acromion) moved forward (protraction) by 7.7 mm to
  9.1 mm in the hold of each player. With the violin further out from the middle of the body, it
  moved forward by 22.5 mm (standard deviation 7.4 mm), and with the violin 30° nearer to the
  middle, by 4.8 mm [80].
- **The size of the viola.** Violas have no fixed size. A shop gives the body length: 380 mm to
  400 mm for a full viola, 330 mm to 340 mm for a 3/4, and 280 mm to 320 mm for a 1/2. It measures
  the left arm extended to the front, from the shoulder to the middle of the open palm [82]. A
  chart goes from 10 to 16.5 inches, and pairs 10 inches with an arm of 36 cm, 11 inches with
  38 cm, 12 inches with 46 cm, and 13 inches with 51 cm. Adults "typically choose between 15,
  15.5, and 16+ inch sizes". The chart measures the left arm extended to the side, from the base
  of the neck to the center of the palm [81].

## 2. The right arm and the bow

### 2.1 The bow hold and the bow

- **Double bass.** The French bow is held "as if the hand is resting by the side of the performer
  with the palm facing toward the bass". The German bow has a taller frog, and the player holds it
  "with the palm angled upwards" [37].
- **The tilt of the bow.** The stick tilts toward the fingerboard by about 30° in normal violin
  playing, and up to about 45° in pianissimo near the frog [40]. The tilt is "less so on the
  lower-pitched instruments" [41].
- **The width of the hair**, as a share of the open string length: violin 2.4% to 3.7%, viola 2.4%
  to 3.5%, cello 1.5% to 2.6%, double bass 1.4% to 1.7% [41].
- **Gravity.** The weight of the bow on the string changes by about 3 N from the tip to the frog,
  most of it in the last third toward the frog. The index finger and the little finger balance it
  [38 (secondary)].

### 2.2 The string planes and the arm levels

| Value | Violin | Viola | Cello | Double bass |
|---|---|---|---|---|
| Angle between neighbor string planes | 17° to 18° between the middles of the zones of one player in motion capture, with the double stops at −22°, −5°, and +13° and the outer edges at −44° and +36° [39]. 14° to 23° in a patent, smaller on the higher strings [42 (secondary)]. 15° to 16.4° (derived) from a bridge arc of 42 mm radius and 11 mm to 12 mm between the strings [43 (abstract)] | No source | No source | About 25° [42 (secondary)] |
| Arm level | The arm is higher for the G string and lower for the E string. The range of the shoulder in a full bow falls from 24° on the lowest string to 16° on the highest string [44 (abstract)] | As the violin | The bow is "close to your body and lower than the others" on the C string, and it reaches "far away from your body" on the A string [45]. The range of the shoulder rises from 16° on the C string to 30° on the A string [44 (abstract)] | No source |
| Elbow range in a full bow | 71°, the same on all strings [44 (abstract)] [46] | No source | 33° [44 (abstract)] | No source |

### 2.3 String crossings

- **The joints.** The elbow (flexion and extension) makes the motion of the bow along its length.
  The shoulder (abduction, adduction, and rotation) makes the string crossings [47].
- **Arm and wrist.** "The vertical movement of the upper arm is the main part of the arm used to
  cross from one string to another". "A small amount of forearm rotation replaces a large amount of
  vertical upper arm movement". Fast repeated crossings use "very little upper arm movement" [48].
- **Timing.** The crossing comes a little before the bow change: the turn of the bow leads the
  speed of the bow by about 15° of the phase of a stroke pair [47]. At 7.5 notes a second, 15° is
  about 11 ms (derived). The bow touches both strings for about 0.32 of the turn from one string to
  the other (0.41 in forte, 0.28 in piano) [47].
- **The path of the frog.** A détaché on two strings at about 7 notes a second moves the frog on a
  circle. An arpeggio on three strings moves it on a figure eight. The bow speed reaches about
  ±100 cm/s on two strings and ±200 cm/s on three strings [39].
- **Fast patterns.** Fast patterns run at 4 to 8 notes a second. Professionals chose 123 bpm (111 to
  137) for a pattern of sixteenth notes, about 8.2 notes a second [47 (derived)].
- **Duration.** "String crossings do not occur instantly", because the strings and the hair bend
  [39]. No source gives a time in ms.

### 2.4 Bow speed, force, and the sounding point

On the violin, players change the sounding point and the force more than the speed for a change of
loudness. Two players of one study (Askenfelt, 1989) [38 (secondary)]:

| Player | Loudness | Bow speed | Distance from the bridge | Bow force |
|---|---|---|---|---|
| 1 | Piano | 29 cm/s | 42 mm (about 1/8 of the string, derived) | 0.5 N |
| 1 | Forte | 21 cm/s | 18 mm (about 1/18 of the string, derived) | 2.3 N |
| 2 | Piano | 21 cm/s | 42 mm | 0.4 N |
| 2 | Forte | 24 cm/s | 20 mm | 1.7 N |

- **Typical values of the violin.** Bow speeds of about 20 cm/s are typical [49]. Normal forces are
  0.5 N to 1.5 N [41]. In a fast arpeggio, the bow moves at more than 1 m/s, and the force stays at
  about 1 N [40].
- **A crescendo on a whole bow.** The speed rises, the bow moves toward the bridge, and the force
  rises [40].
- **Cello, six players.** Legato with four notes in a whole bow at 80 bpm (0.8 s notes): a mean
  speed of 16.6 cm/s (6.1 to 32.4) and a mean sounding point of 59 mm (24 to 112). Détaché in the
  lower two thirds of the bow at 160 bpm (0.34 s notes): 40.5 cm/s (12.3 to 89.9) and 76 mm (32
  to 119). Players move faster and nearer to the bridge on the higher strings, with up to 20 cm/s
  more on the A string than on the D string [50].
- **Stroke length (derived).** A détaché on two violin strings at 7 notes a second is about 7 cm
  for each note. A cello détaché of 0.34 s at 40 cm/s is about 14 cm. A cello legato note of 0.8 s
  at 16.6 cm/s is about 13 cm, so a slur of four notes takes about 53 cm.

### 2.5 The strokes and the part of the bow

| Stroke | Motion | Part of the bow | Rate |
|---|---|---|---|
| Détaché | Separate notes, one bow for each note [4] | The middle and the upper half (no measure) | 4 to 8 notes a second in fast patterns [47] |
| Legato | Notes "connected without any intervening silence" [4]. Several notes in one bow: four notes in a whole bow on the cello [50] | The whole bow | As the music |
| Martelé | The force falls fast from about 1.5 N to less than 0.5 N after the attack, and the bow stops on the string between the strokes [51] | No source | No source |
| Spiccato | The bow leaves the string. The frog moves on a diagonal, and the stick turns at twice that rate, a figure eight. The tone builds in about 30 ms, then the bow leaves the string [52] [38] | The balance point, about 1/3 from the frog, for a slow spiccato, and higher for a faster spiccato [53 (secondary)]. Galamian: the lower two thirds [54] | Up to about 100 bpm in sixteenth notes, about 6.7 notes a second (derived) [54]. The bow bounces at 6 Hz to 35 Hz for impacts at 8 cm to 60 cm from the frog, and a spiccato works best 1 Hz to 2 Hz below this rate [52] [38] |
| Sautillé | The bow bounces from the stroke alone. The speed is a half sine for each stroke, up to about 100 cm/s. The peak force is about 0.74 N in mezzo forte, from 0.5 N in piano to more than 3 N in forte [51] | The balance point (Dounis) [54] | Faster than spiccato [54] |
| Ricochet | Several bounces in one bow | No source | 10 to 20 a second [41] |
| Tremolo | Short fast strokes. An unmeasured tremolo is played as fast as possible [55] | No source | No measure. "The rate of bowing is usually left to the performer" [55] |
| Pizzicato | No source of this file | | |

As the rate of the strokes rises, the speed profile of a stroke changes from a rectangle to a sine,
and at the highest rates the wrist and the elbow move in phase [56 (abstract)].

### 2.6 The bow change

- **The path.** Many players move the hand on "a figure eight or a narrow oval" at the bow change,
  and the bow slows down faster than it speeds up after the change [38].
- **Speed.** A path a little off a circle makes the bow change about 14% faster [57].
- **The fingers and the wrist.** The suppleness of the fingers and the wrist sets the largest
  acceleration of the bow [41].
- **The cello.** Expert cellists move the shoulder and the elbow at the bow change of an open
  string at 80 bows a minute. Novices move only the shoulder [58].
- **The attack.** Listeners accept a noisy start of up to 50 ms or 90 ms, by the kind of noise, on
  the open G string of a violin [41 (secondary)].

### 2.7 The cello on the chair and at rest

- **The contacts.** The cellist sits, and the endpin carries the weight of the cello. The cello is
  steadied on the lower bout between the knees, and on the upper bout against the upper chest
  [59]. The inside of each knee touches the cello [60], and the legs press it gently [61].
- **The neck.** The neck of the cello is above the left shoulder, and the C-string peg is just
  behind the left ear [59]. The cello rests against the chest a little to the left of the middle,
  so that its neck is near the neck of the player, and the peg is behind the ear or brushes the
  neck [60].
- **The feet and the hips.** Both feet are flat on the floor, shoulder-width apart, and point
  forward. The pelvis is a little higher than the knees [60].
- **The angle.** Some players prefer a shorter endpin and a more vertical cello. Others play with
  a longer endpin and a more forward angle [60]. A teaching handout puts the cello at 55° to 65°
  from the floor [65] (abstract). The cellist sits upright, or leans a little forward into the
  cello, and does not lean back [66] (abstract).
- **The size.** The total length of a cello is 121.9 cm for a 4/4, 114.3 cm for a 3/4, and
  106.6 cm for a 1/2 [62] (abstract): 0.94 and 0.87 of a 4/4 (derived). The back of a 4/4 is at
  least 30 in long, of a 3/4 26 in to 27.25 in, and of a 1/2 23 in to 26 in [63] (abstract). A
  size guide takes a 1/2 for a player of 4 ft 0 in to 4 ft 6 in with an arm of 20 in to 22 in,
  and a 4/4 for a player of at least 5 ft 0 in with an arm of at least 24 in. Two of the height,
  the arm length, and the finger span must match [64]. A 1/10 cello of one maker has a back of
  19.5 in [84] (search summary): 0.65 of the back of a 4/4 (derived).
- **The bow at rest.** In a first lesson, the screw of the frog stands on top of the right knee,
  so that the bow points up at the ceiling, and the left hand rests on the left knee [61]. No
  source of this file gives the rest of an orchestral cellist between pieces.

### 2.8 The standing double bass player

- **The contacts.** The player turns the bass slightly to the right and tilts it back, so that it
  rests against the left side of the hip. Some bassists rest the bass against the stomach [69].
  A lean of the bass against the leg is the most common way to stand, and the left knee against
  the bottom of the instrument controls its turn [70] (abstract). Thus the bass touches the body
  (derived).
- **The height and the feet.** The end pin is set so that the nut is at the level of the
  eyebrows. The feet are shoulder width apart [69].
- **The left hand on the neck.** The hand forms a C, and the fingers are curved. The thumb gently
  touches the back of the neck, behind the first or the second finger. The elbow is relaxed and
  not held high, so that the forearm and the wrist form a straight line [71]. Thus only the thumb
  and the fingers touch the neck, and the wrist does not (derived).
- **The high positions.** In the thumb position, the fingers point down the fingerboard, the hand
  is a little pronated, and the knuckles are raised. The elbow rises just enough to bring the
  inside of the wrist up off the shoulder of the instrument [71].
- **Pizzicato.** The right hand comes up from the side, relaxed, and the wrist is a little bent
  (pronated), so that the hand hangs from the arm. The thumb may rest on the edge of the
  fingerboard. Many bassists strike with the side of the index finger. For fast passages, some
  pluck higher on the fingerboard, nearer to the left hand [72].

### 2.9 The violin and the viola at rest

- **The seated rest.** The seated player rests the violin on the left thigh and holds its neck with
  the left hand [73]. Orchestra violinists sit with their violins upright on their laps [75]. A
  school orchestra holds the violin "out in front, straight up and down, with the fiddle resting
  on your knee" [74].
- **The side of the top plate.** In the standing rest, the violin lies under the right arm with
  the scroll forward and the bridge facing out [73]. No source of this file gives the side of the
  top plate in the seated rest.
- **The horizontal hold.** A violinist or a violist can hold the instrument in the "banjo"
  position, horizontally on the lap, and pluck the strings with the right thumb. This hold is
  rarely used, and it is a hold to play [83]. In a time of shoulder pain, one orchestral violinist
  put the instrument on his lap and let the left arm hang free [74]. No source of this file gives
  a rest with the scroll to the side.

## 3. Use in the app

Each species plays with a `BowedHold` of `src/pose/bowed-rig.ts` (`DOG_HOLD`, `HIPPO_HOLD`, and
the others). The left hand and the strokes come from `src/pose/fingering.ts` and
`src/pose/strokes.ts`, and the pose from `poseBowed()` of `src/pose/bowed.ts`. The paws of the
meshes have one finger bone and a thumb with no bone, so the app shows no single fingers and no
thumb on the neck.

### 3.1 The left hand

The app follows these facts:

- **The position plan (1.2 to 1.4).** `planHand()` plans the position, the string, and the
  finger of each stroke from the score, with the frames of `HAND_FRAMES` and the rules of
  `FINGERING_COSTS`. Each player takes the orchestral style: low positions and open strings. The
  hand moves only in a shift.
- **The shift (1.5).** `bowStateAt()` moves the hand in the second half of the note before the
  shift. The shift ends when the finger of the new note lands, a little before the note
  (`LEFT_HAND`).
- **The fingers (1.6).** The finger of each stopped note lands before the note and presses at the
  note start. An open string has no press. The hand turns a little toward the finger of the note,
  and rolls around the neck to its string (`BOWED_HANDS.reachTurn`, `BOWED_HANDS.rollL`).
- **Vibrato (1.7).** A long stopped note gets vibrato after a short delay, with a seeded rate for
  each player, and wider in a high position and in a loud note (`LEFT_HAND.vibrato`,
  `vibratoRate()`, `vibratoWidth()`). The whole hand moves, as a forearm vibrato. No source gives
  the contrabass, so it takes the lower end of the measured rates.
- **The left elbow for each string (1.8).** `leftElbow()` turns the left elbow toward the body for
  the lower strings of the violin and the viola, and up for the lower strings of the cello and the
  contrabass (`BowedHold.elbowPerString`). It turns a little further in the high positions
  (`BowedHold.highElbow`). No source gives the angles, so each hold sets them, with no fold of the
  skin of the arm.
- **The hand over the shoulder of the instrument (1.5).** In the high positions, `leftTilt()`
  tilts the left hand further over the neck (`BowedHold.highTilt`), and the wrist comes up beside
  the upper bout.
- **The violin under the jaw (1.10).** The instrument lies about level and points to the left of
  the front of the chest, and the jaw lies on the chin rest. The chin rest is at the left of the
  tailpiece, on the side of the G string (`CHIN_REST`). The left shoulder bone turns forward
  in the play (`BowedHold.reachL`, `shoulderTurnL()`), as the left shoulder of a violinist moves
  forward, so that the short left arm reaches the nut.
- **The shoulder rest (1.10).** A shoulder rest lies under the back of the lower bout
  (`SHOULDER_REST`). Its high end is on the side of the E string, over the left shoulder and the
  upper arm of the animal.
- **The size of the viola (1.10).** The cat plays a smaller viola (`SpeciesParams.violaScale`),
  the smallest size of the chart of [81]. The chin rest lies under the long jaw, further from the
  shoulder along the viola than on a person.

The app does not follow these facts:

- **The guide finger (1.5).** No finger slides on the string, because the four fingers are one
  block. The press lifts to a light contact.
- **The fingers down and the next finger (1.6).** The fingers do not stay down for the lower
  notes, and the next finger is not prepared, because the block cannot show single fingers.
- **The start of the tilt (1.5).** The tilt starts one position earlier than a real hand, because
  the left forearm of the cat touches the upper bout from the third position. Only the cat tilts,
  and its wrist bends more than the straight wrist of a real player.
- **The hand on the neck (1.9).** `stopHandAt()` puts the paw below the neck on the side of the
  high strings, with the palm toward the low strings, and tilts it over the neck
  (`BowedHold.tiltL`), so that the fingers come down on the strings from above. The cat tilts
  further, so that its paw curls around the neck, and a smaller tilt pinches the skin of its
  wrist. Thus its wrist bends off the line of the forearm in the low positions.
- **The left upper arm (1.10).** The left upper arm turns further out to the side than the arm of
  a violin student (`BowedHold.poleL`). With the elbow further in, the left paw twists too far on
  its forearm.
- **The head (1.10).** The head of the cat lifts, so that the jaw lies on the chin rest near the
  neck, and its viola falls to the scroll. A larger shoulder turn sinks the back of the left arm
  root into the body. The rabbit lowers its head a little (`BowedHold.headDrop`), so that its
  violin sits higher out of the chest. The red fox lifts its head a little, because its long jaw
  already lies on the chin rest.

### 3.2 The bow arm

The app follows these facts:

- **The bow hold (2.1).** The stick passes through the middle of the closed right paw
  (`SpeciesParams.bowGrip`), as the fingers of a real player close around it.
- **The tilt of the stick (2.1).** `heldBowAt()` turns the bow around its hair by
  `BowedHold.bowTilt`, less on the lower instruments.
- **The string planes (2.2).** The bow turns around the strings by `BowedHold.stringTurn` for each
  string: the real angle, or the largest angle below it with which the bow arm still reaches the
  full hair (`bowRangeOf()`). The arm levels come from the geometry, higher for the lower strings.
- **The crossing leads the note (2.3).** `bowStateAt()` turns the bow to the string of the next
  note, and the turn ends a little before the note (`BOW_MOTION.crossSec`, `crossShare`,
  `crossLeadSec`).
- **The upper arm in a fast crossing (2.3).** In a fast run across two neighbor strings,
  `crossStrings()` gives the notes next to a change of the string the mean of the two strings.
  `crossPole()` then keeps the right elbow near the elbow of the mean string, and the forearm and
  the wrist make the rest of the crossing. The bow turns the full angle to each string.
- **The sounding point (2.4).** `soundingPointAt()` moves the contact point from
  `BowedHold.soundingPoint[0]` of the string length in piano to `soundingPoint[1]` in forte, after
  the violinists of Askenfelt and the six cellists. The bow follows a change of the loudness with
  a time constant (`followLoudness()`). No source measures the contrabass.
- **The bow length (2.4).** The bow length grows with the duration of the note or of the whole
  slur (`BOW_MOTION.length`), near the measured stroke lengths. The loudness changes the length
  only a little, because real players change the sounding point and the force more than the
  speed.
- **The slurs (2.5).** The MIDI files have no slurs, so `slurSizes()` guesses them from the score
  (`BOW_MOTION.slur`): short notes in one beat that change the pitch join into one bow. A
  repeated pitch takes a new bow. The bow keeps one speed and slows to a stop in the last note.
- **The fast bows (2.5).** A bow before a fast next bow moves toward the balance point and the
  middle of the bow (`balanceShift()`, `BOW_MOTION.fastSec`, `BOW_MOTION.balance`).
- **The rest (2.9).** The violin and the viola rest upright on the left knee or thigh. The left paw
  holds the neck in a rest grip near the grip of the play (`restHandAt()`,
  `BowedHold.restPawTurnL`), and the left elbow hangs near the side (`BowedHold.restPoleL`). The
  cat rests the viola nearer to the hip, so that its shorter arm bends, and closes its paw around
  the neck.

The app does not follow these facts:

- **The bow hand (2.1).** The fingers turn the stick in the paw by the tilt, and the hand keeps
  the turn of the bow with no tilt. The skin of the arm folds with a turned hand.
- **The smaller string turns (2.2).** Some holds turn the bow less than the real angle. A larger
  turn folds the skin of the right arm, or puts the bow paw into the instrument or the belly.
- **The hair near the frog (2.5).** Some holds play no hair near the frog
  (`BowedHold.frogHair`): there, the forearm of the dog and the hippo crosses the rim, and the bow
  paw of the rabbit comes to its jaw.
- **The bow elbow (2.3).** No source gives the direction of the right elbow at the frog. Each hold
  keeps the elbow near the level of the bow (`BowedHold.poleR`, and `poleTipR` at the tip). A
  lower elbow turns the broad side of the flat upper arm of the rabbit to the front, and puts the
  upper arm of the cat into the trunk. The right shoulder turns forward (`BowedHold.reach`), so
  that the bow arm keeps off the belly.
- **The measured tremolo (2.5).** No source gives its stroke length. `measuredTremolo()` moves
  the bow a short way and back on each note of a fast run of one pitch (`BOW_MOTION.measured`), so
  the arm stays nearly still and only the hand moves.
- **The pizzicato of the violin and the viola (2.8).** No source gives its place. The rabbit and
  the red fox pluck over the end of the fingerboard (`BowedHold.pluckPlace`), because a pluck near
  the bow puts the right forearm into the body. The cat plucks from the side of the frog
  (`BowedHold.pluckSide`), as a bass hand comes up from the side. Its short arm goes into its
  round chest with the palm over the strings.
- **The lift and the lowering.** No source gives the path of the violin or the viola from the lap
  to the chin. The left paw carries the instrument by its neck, and the instrument turns with the
  paw (`carryLift()`). The paw supinates on its forearm on the way, as a real forearm turns. The
  bind of the left paw is supinated, so that the rest twist and the play twist lie on one side of
  180°, and the forearm skin follows the paw with no jump. In the middle of the move, the wrist
  moves off its line (`BowedHold.liftReach`), so that the instrument keeps out of the body near
  the jaw. A banjo roll with the scroll to the side avoids the twist, but no source gives it as a
  rest.
- **The top plate at rest (2.9).** No source gives its side in the seated rest. The top plate of
  the violin faces the front. The top plate of the viola faces the front and a little to the left,
  because with the top to the front the bow paw of the cat turns too fast in a lowering. The bow
  paw rests low at the front of the lap or the lower belly, with the elbow hanging and a straight
  wrist.

### 3.3 The cello on the chair and at rest

The app follows these facts:

- **The contacts (2.7).** Each seated body holds the cello at a place from its body
  (`CELLO_PLACE`, `fitCelloPlace()`): the endpin on the floor right of the middle, the top of the
  back at the height of the chest, and the neck at the left of the head, above the left shoulder.
  The end pin of each body fits its chest (`celloPinOf()`), as a cellist sets the end pin. The
  dog keeps a fixed place of its own (`DOG_HOLD`).
- **The angle (2.7).** The cello leans back 25.7° and 14° to the left, 28° from the vertical, in
  the range of the handout [65]. The trunk leans 3° forward [66].
- **The size (2.7).** The cello rule (`celloRule()` of `tools/cello-size.ts`) takes the largest
  cello at which the left paw reaches the first position with the elbow bent, the end pin fits
  the chest, and the lower bout is not below the knees. It clamps the size from a 1/10 [84] to a
  4/4 [63].
- **The rest (2.7).** The cello stays between the knees, and the left paw holds it. The right paw
  holds the bow with the tip up, as in the first lesson of [61]. The right upper arm hangs as in
  the bind pose, and the forearm points forward (`forearmGrip()`). The dog holds the bow over the
  right knee.
- **The high positions (1.5).** The left paw tilts further over the neck from the second position
  to the fifth position (`BowedHold.highTilt`), as the hand goes over the shoulder of the
  instrument.
- **The pizzicato (2.8).** The right paw comes up from the side and plucks right of the strings,
  near the end of the fingerboard (`BowedHold.pluckSide`, `pluckPlace`), with the elbow out and
  down, as a bassist. No source of this file gives the cello pizzicato.

The app does not follow these facts:

- **The chest (2.7).** The middle line of the back stands 0.28 H in front of the trunk, the room
  of the arms in the accepted dog hold. Pressed onto the chest, the cello went 5 cm to 12 cm into
  the bodies of the cast matrix.
- **The knees (2.7).** The short thighs of most bodies end far behind the lower bout of the leaned
  cello, so the knees do not touch it.
- **The elbow (1.9).** No source gives the bend of the left elbow at the first position. The rule
  takes the bend of the dog at its accepted cello, 65° between the upper arm and the forearm.
- **The left hand (1.9).** The left paw tilts further over the neck from the bass side
  (`BowedHold.tiltL`), so that the thick paw keeps off the fingerboard.
- **The bow at rest (2.7).** The short arm does not reach the knee, so the grip is above the
  thigh, in front of the body, and the tip leans out and forward. No source gives the rest of an
  orchestral cellist.

### 3.4 The standing contrabass player and the rest

The app follows these facts:

- **The size (1.1).** The hippo plays a smaller contrabass (`SpeciesParams.bassScale`), as a child
  plays a fractional size, with a short end pin (`BASS_END_PIN` of
  `src/models/instruments/strings.ts`).
- **The contacts (2.8).** The hippo stands, as many orchestral bassists do, with `HIPPO_HOLD`. The
  end pin stands on the floor in front of it, the contrabass leans to the left and back, and the
  nut is beside the head. The back of the contrabass touches the front of the belly, as a real
  bassist rests the bass against the stomach [69].
- **The pizzicato (2.8).** The right paw comes up from the side and plucks right of the strings
  (`BowedHold.pluckSide`). The right elbow points out to the right, so that the straight arm
  passes outside the rim of the upper bout. The bow tip points up, square to the strings
  (`BowedHold.pizzicatoTip`), so that the forearm meets the paw as in the play. No source gives
  the place of the bow in the hand in pizzicato.

The app does not follow these facts:

- **The hip and the knee (2.8).** The knee of the hippo lies under its belly, so the contrabass
  stands in front of the belly. Both shoulders turn forward (`BowedHold.reach`,
  `BowedHold.reachL`), so that the short arms reach the strings.
- **The left hand (2.8).** The thick left paw tilts over the neck, as the paw of the dog, so that
  the left arm keeps off the body. The thick wrist then touches the neck while the fingers stop
  the strings, where a real bassist touches the neck with the thumb alone.
- **The high positions (2.8).** The left shoulder lies behind the upper bout, and the short arm
  does not reach over it. Thus the left paw stops the strings only up to `BowedHold.stopEnd`, and
  the high notes take places lower on the neck.
- **The pizzicato place (2.8).** The paw lies further right than a real hand, because the right
  shoulder is behind the back of the contrabass.
- **The hair near the frog (2.5).** The short bow arm reaches the frog only straight, and then it
  crosses the rim of the upper bout. Thus the hippo plays no hair near the frog
  (`BowedHold.frogHair`).
- **The bow hand (2.1).** `rollToward()` rolls the paw around the stick, so that the back of the
  paw points to the elbow, and `BowedHold.farSideR` keeps the roll at one end of its range on the
  low strings. The paw keeps the bend of its bind pose on the forearm (`BowedHold.pawKeepR`), as
  the French bow is held "as if the hand is resting by the side". The hand turns in the plane of
  its palm around the grip (`BowedHold.stickTurnR`), so that the paw keeps one place on the stick
  and a straight wrist. The bow then turns a little in the paw over a stroke, as the fingers of a
  player let the bow turn.
- **The rest.** No source gives the rest of an orchestral bassist. The contrabass stays at its
  playing place, and the left paw holds the neck. The right paw hangs beside the belly with the
  bow tip down, because the knee is under the belly. The right elbow points down and a little out
  (`BowedHold.restPoleR`), so that the skin of the hanging upper arm twists less.

## 4. Sources

Each source opened on 2026-10-17, except where its entry gives another date.

1. S. Fischer, "Basics: Changing position", The Strad, July 2011.
   https://www.simonfischeronline.com/uploads/5/7/7/9/57796211/241_july_2011_shifting.pdf
2. S. Fischer, "Changing position", Basics series, The Strad, with Galamian, *Principles of Violin
   Playing and Teaching* (1962), p. 26.
   https://www.simonfischeronline.com/uploads/5/7/7/9/57796211/175_shifting.pdf
3. S. Fischer, "Shifting", Basics series, The Strad, with a quote of Galamian.
   https://www.simonfischeronline.com/uploads/5/7/7/9/57796211/201_shifting.pdf
4. Wikipedia, "Violin technique". https://en.wikipedia.org/wiki/Violin_technique
5. Wikipedia, "Thumb position". https://en.wikipedia.org/wiki/Thumb_position
6. Bornoff, "Cello Finger Patterns 'Within the Hand'" (handout).
   https://fase.org/wp-content/uploads/2021/01/Bornoff-Cello-Finger-Patterns-_within-the-hand_-PDF.pdf
7. A. McDonagh, "Cello Basics 07: Introduction to first position".
   https://www.ailbhemcdonagh.com/cello-basics-07-introduction-to-first-position.html
8. Wikipedia, "Scale length (string instruments)".
   https://en.wikipedia.org/wiki/Scale_length_(string_instruments)
9. M. Morton and J. Gale, *Triangulation of Fingering Systems for the Double Bass*, vol. 1
   (description of the book).
   https://shop.doublebasshq.com/products/triangulation-of-fingering-systems-for-double-bass-vol-1
10. Double Bass Blog, "Simandl-Plus: Rabbath versus Simandl follow-up discussion".
    https://doublebassblog.org/category/student-resources/page/52
11. Cellomoji, "3.5 Positions". https://cellomoji.com/positions/
12. Thesis on the double bass and the electric bass of John Patitucci, University of Évora (2016),
    with the half position of Simandl.
    https://rdpc.uevora.pt/bitstream/10174/18726/1/Double%20Bass%20and%20Electric%20Bass%20The%20case%20study%20of%20John%20Patitucci%20Definitive%20Version%2025th%20July%202016.pdf
13. Wikipedia, "Cello". https://en.wikipedia.org/wiki/Cello
14. B. Aarden and P. von Hippel, Music Theory Online 10.2 (2004), section 4.2.2.
    https://mtosmt.org/issues/mto.04.10.2/mto.04.10.2.aarden_hippel_4.2.2.html
15. E. Prout, *The Orchestra*, vol. 1, chapter III.
    https://timbreandorchestration.org/treatises/figures/prout/volume-1/chapter-iii
16. Viola Online, "Shifting". https://www.violaonline.com/shifting.htm
17. *A Dictionary of Music and Musicians* (Grove), "Shift".
    https://en.wikisource.org/wiki/A_Dictionary_of_Music_and_Musicians/Shift
18. W. Nagata, S. Sako, T. Kitamura, "Violin Fingering Estimation According to Skill Level based on
    Hidden Markov Model", Proc. ICMC and SMC 2014, pp. 1233 to 1238.
    https://speech.di.uoa.gr/ICMC-SMC-2014/images/VOL_2/1233.pdf
19. K. Noguchi, violin-fingering (open code, GPL-3.0), `violin_fingering_core.js`.
    https://github.com/knoguchi/violin-fingering
20. P. Visentin, S. Li, G. Tardif, G. Shan, "Unraveling mysteries of personal performance style;
    biomechanics of left-hand position changes (shifting) in violin performance", PeerJ 3:e1299
    (2015), Results and Table 2. https://pmc.ncbi.nlm.nih.gov/articles/PMC4636401/
21. O. Margulies, M. Nübling, W. Verheul, W. Hildebrandt, H. Hildebrandt, "Determining factors for
    compensatory movements of the left arm and shoulder in violin playing", Frontiers in
    Psychology 13:1017039 (2023), Tables 4 and 5. https://pmc.ncbi.nlm.nih.gov/articles/PMC9901209/
22. Chen and others, "Accuracy and underlying mechanisms of shifting movements in cellists",
    Experimental Brain Research (2006) (abstract).
23. O. Kazennikov, M. Wiesendanger, "Bimanual coordination of bowing and fingering in violinists:
    effects of position changes and string changes", Motor Control 13(3):297 to 309 (2009),
    Table 1. https://folia.unifr.ch/documents/301523/files/wies_bcb.pdf?download
24. A. P. Baader, O. Kazennikov, M. Wiesendanger, "Coordination of bowing and fingering in violin
    playing", Cognitive Brain Research 23:436 to 443 (2005).
    https://folia.unifr.ch/documents/300019/files/1_wiesendanger_cbf.pdf?download
25. The Strad, "6 tips for improved coordination" and "7 tips for playing fast passages", with
    quotes of Courvoisier (1893) and Fischer (1993, 2010).
    https://www.thestrad.com/playing-hub/6-tips-for-improved-coordination/138.article and
    https://www.thestrad.com/7-tips-for-playing-fast-passages-for-string-players/160.article
26. A. Hofmann and W. Goebl, Frontiers in Psychology 7:1140 (2016), with Kinoshita and Obata,
    JASA 126:388 to 395 (2009).
    https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01140/full
27. N. H. Fletcher, "Vibrato in music: physics and psychophysics", Proc. ISMA 2010, Sydney.
    https://www.acoustics.asn.au/conference_proceedings/ICA2010/cdrom-ISMA2010/papers/p59.pdf
28. J. M. Geringer and M. L. Allen, "An analysis of vibrato among high school and university violin
    and cello students", Journal of Research in Music Education 52(2) (2004).
    https://journals.sagepub.com/doi/abs/10.2307/3345438
29. R. B. MacLeod, "Influences of dynamic level and pitch register on the vibrato rates and widths
    of violin and viola players", Journal of Research in Music Education 56(1) (2008).
    https://www.researchgate.net/publication/249808850
30. M. L. Allen, J. M. Geringer, R. B. MacLeod, "Performance practice of violin vibrato: an
    artist-level case study" (2009). https://www.researchgate.net/publication/283122059
31. S. Hu, S. H. Kim, H. H. Kim, H. Mackay, E. J. Heller, "Influence of string register locations on
    vibratos among violoncellists", arXiv 2512.18162 (2025). https://arxiv.org/html/2512.18162v1
32. Violinist.com, discussion "Question on left arm technique".
    https://www.violinist.com/discussion/archive/10757/
33. A. McDonagh, "Cello Basics 08: Starting the Left Hand, C-Shape and 1st Finger Placement".
    https://www.ailbhemcdonagh.com/cello-basics-08-starting-the-left-hand-c-shape-and-1st-finger-placement.html
34. Cello Fun, "Fingertips or Pads? Elbow Height?".
    https://cellofun.eu/home/cello-blog-encyclopaedia/mechanics-technique/left-hand-homepage-a-musician-is-an-athlete-of-the-small-muscles/finger-string-contact/fingertips-or-pads/
35. J. Fiste, "Cello Vibrato", CelloProfessor.com. https://celloprofessor.com/Cello-Vibrato.html
36. V. K. M. Cheung, H.-K. Kao, L. Su, "Semi-supervised violin fingering generation using
    variational autoencoders", Proc. ISMIR 2021, pp. 113 to 120.
    https://archives.ismir.net/ismir2021/paper/000013.pdf
37. Wikipedia, "Double bass". https://en.wikipedia.org/wiki/Double_bass
38. K. Guettler, "A closer look at the string player's bowing gestures", CASJ 4(7) Series II
    (2003), pp. 12 to 16, with the measures of A. Askenfelt, JASA 86:503 to 516 (1989).
    https://knutsacoustics.com/files/guettler_gestures0317.pdf
39. E. Schoonderwaldt, "Control and coordination of complex bowing patterns", Proc. 2nd Vienna Talk
    (2010), pp. 133 to 136, Figures 2 to 4.
    https://viennatalk.mdw.ac.at/papers/Pap_01_11_Schoonderwaldt.pdf
40. E. Schoonderwaldt, M. M. Wanderley, "Visualization of bowing gestures for feedback: the Hodgson
    plot" (2007), and E. Schoonderwaldt, S. Sinclair, M. M. Wanderley, ENACTIVE 2007.
    https://idmil.org/wp-content/uploads/2022/06/schoondw_visualization.pdf and
    https://idmil.org/wp-content/uploads/2022/06/Schoondw2007_enactive.pdf
41. K. Guettler, "Bow notes", Proc. Institute of Acoustics 19(5), ISMA 1997.
    https://knutsacoustics.com/files/bow-notes--i.o.a-1997-.pdf
42. US patent 5,918,297 (1999), Related Art. https://patents.google.com/patent/US5918297A/en
43. Violinist.com, discussion of the bridge arc and the string spacing.
    https://www.violinist.com/discussion/archive/27175
44. L. Turner-Stokes, K. Reid, "Three-dimensional motion analysis of upper limb movement in the
    bowing arm of string-playing musicians" (abstract).
    https://nippon.zaidan.info/seikabutsu/1997/00313/contents/144.htm
45. A. McDonagh, "Cello Basics 12: Understanding bow angles".
    https://www.ailbhemcdonagh.com/cello-basics-12-understanding-bow-angles.html
46. Wales, "3D movement and muscle activity patterns in a violin bowing task", MSc thesis, Brock
    University (2007). https://brocku.scholaris.ca/items/01b51757-95f0-4f42-9fa3-1c56934b1fe5/full
47. E. Schoonderwaldt, E. Altenmüller, "Coordination in fast repetitive violin-bowing patterns",
    PLoS ONE 9(9):e106615 (2014). https://pmc.ncbi.nlm.nih.gov/articles/PMC4160185/
48. S. Fischer, "Basics: Forearm rotation", The Strad.
    https://www.simonfischeronline.com/uploads/5/7/7/9/57796211/074for~1.pdf
49. E. Schoonderwaldt, K. Guettler, A. Askenfelt, "An empirical investigation of bow-force limits
    in the Schelleng diagram", Acta Acustica united with Acustica 94:604 to 622 (2008).
    https://knutsacoustics.com/files/schoonderwaldt-et-al.-empirical-schelleng.pdf
50. M. Chudy, S. Dixon, A. Pérez, paper on cello bowing parameters, ICA 2013, Table 1 and Figures 1
    to 4. https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2013/Chudy-Dixon-Perez-ICA2013.pdf
51. M. Demoucron, "The violinist's bestiary: characterizing bowing parameters of technical bow
    strokes", Proc. 2nd Vienna Talk (2010), pp. 55 to 58.
    https://viennatalk.mdw.ac.at/papers/Pap_01_50_Demoucron.pdf
52. K. Guettler, *The Bowed String*, PhD thesis, KTH (2002), pp. 15 to 17.
    https://knutsacoustics.com/files/thesis-guettler-020607.pdf
53. Wikipedia, "Spiccato". https://en.wikipedia.org/wiki/Spiccato
54. R. Klopčič, "Spiccato and sautillé: two important bow strokes which are often confused", The
    Strad (2004, reprinted 2021).
    https://www.thestrad.com/improve-your-playing/spiccato-and-sautille-two-important-bow-strokes-which-are-often-confused/13970.article
55. J. Wolfe, "Violin articulation", UNSW, and Wikipedia, "Tremolo".
    https://newt.phys.unsw.edu.au/jw/violinarticulation.html and
    https://en.wikipedia.org/wiki/Tremolo
56. N. Rasamimanana and others, bow strokes at rising rates, LNCS 5085 (2009), pp. 216 to 226
    (abstract). https://www.idmil.org/?p=3488
57. K. Guettler, "Bowing gesture analysis: for whom, why, and how?", Proc. 2nd Vienna Talk (2010),
    Figure 2. https://viennatalk.mdw.ac.at/papers/Pap_01_20_Guettler.pdf
58. J. Verrel, M. Woollacott, U. Lindenberger, Frontiers in Human Neuroscience (2014).
    https://pmc.ncbi.nlm.nih.gov/articles/PMC4137756/
59. Wikipedia, "Cello technique". https://en.wikipedia.org/wiki/Cello_technique
60. A. McDonagh, "Cello Basics 01: How to Sit Properly with the Cello".
    https://www.ailbhemcdonagh.com/cello-basics-01-how-to-sit-properly-with-the-cello.html
61. R. Hirschl, S. Strohm Mullins, "First Lessons on Cello", The Instrumentalist, May 2009.
    https://theinstrumentalist.com/may-2009/first-lessons-on-cello/
62. Bax Music, "Cellos", the total length of each size (search summary).
    https://bax-shop.co.uk/string-instruments/cello
63. Hidersine, "What size cello do I need?", the back length of each size (search summary).
    https://hidersine.com/education/blog/item/112-what-size-cello-do-i-need
64. Stringers Music, "Cello Size Guide".
    https://www.stringersmusic.com/pages/cello-size-guide
65. "Cello Posture and Technique Guide" (curriculum example, Scribd). The text did not open in
    full on 2026-10-17, and the fact comes from a summary.
    https://www.scribd.com/document/397158821/curriculum-example
66. Cellofun, "The spike (endpin)", seating posture. The page gave the HTTP status 502 on
    2026-10-17, and the fact comes from a summary.
    https://cellofun.eu/home/cello-blog-encyclopaedia/mechanics-technique/basic-principles-of-technique/seating-posture/the-spike-endpin/
67. S. Fischer, "Basics: The left thumb", The Strad.
    https://www.simonfischeronline.com/uploads/5/7/7/9/57796211/046thumb.pdf
68. S. Fischer, "Basics: Freeing the left hand", The Strad.
    https://www.simonfischeronline.com/uploads/5/7/7/9/57796211/210_dec_freeing_the_left_hand.pdf
69. String Bass Online, "How to hold the bass", standing position. Opened on 2026-10-21.
    https://stringbassonline.com/howtoholdthebass.htm
70. Double Bass Blog, a post on the standing position (2492), and the transcript of the
    interview with Andrew Anderson, Contrabass Conversations. Neither page opened on 2026-10-21,
    and the facts come from a search summary.
    https://doublebassblog.org/?p=2492
71. "Elements of Double Bass Shifting", The Instrumentalist, April 2015. Opened on 2026-10-21.
    https://theinstrumentalist.com/april-2015/elements-of-double-bass-shifting/
72. No Treble, "Right-hand technique for upright bass: pizzicato" (2009). Opened on 2026-10-21.
    https://www.notreble.com/buzz/2009/11/09/right-hand-technique-for-upright-bass-pizzicato/
73. Taylor Violin, "Playing posture", the rest position, standing and seated. Opened on
    2026-10-24. http://taylorviolin.com/playing-posture
74. G. Elias, "Tales of an orchestral violinist: sitting correctly", The Strad, 10 March 2021.
    Opened on 2026-10-24.
    https://www.thestrad.com/playing-hub/tales-of-an-orchestral-violinist-sitting-correctly/11628.article
75. Violinspiration, "Proper violin posture in 5 steps", the photo of a seated orchestra. Opened
    on 2026-10-24. https://violinspiration.com/violin-posture/
76. Violin Online, "How to hold the violin". Opened on 2026-10-24.
    https://www.violinonline.com/howtoholdtheviolin.htm
77. Viola Online, "How to hold the viola". Opened on 2026-10-24.
    https://violaonline.com/howtoholdtheviola.htm
78. M. J. Sanchez, "How to hold the fiddle", Fiddle For Dummies. Opened on 2026-10-24.
    https://www.dummies.com/article/academics-the-arts/music/instruments/violin-fiddle/how-to-hold-the-fiddle-146255
79. S. Fischer, "Basics: Left elbow", The Strad. Opened on 2026-10-25.
    https://www.simonfischeronline.com/uploads/5/7/7/9/57796211/157_left_elbow.pdf
80. O. Margulies, M. Nübling, W. Verheul, W. Hildebrandt, H. Hildebrandt, "Determining factors
    for compensatory movements of the left arm and shoulder in violin playing", Frontiers in
    Psychology 13:1017039 (2023). Opened on 2026-10-25.
    https://pmc.ncbi.nlm.nih.gov/articles/PMC9901209
81. Violinlounge, "Viola size chart: choose the right size viola". Opened on 2026-10-25.
    https://violinlounge.com/blog/viola-size-chart-choose-the-right-size-viola
82. Corilon Violins, "Finding a student violin in the proper size", the size chart of the violins
    and the violas. Opened on 2026-10-25.
    https://www.corilon.com/gb/library/practical-advice/finding-a-student-violin-in-the-proper-size
83. Wikipedia, "Pizzicato", the "banjo" position of the violin and the viola. Opened on
    2026-10-27. https://en.wikipedia.org/wiki/Pizzicato
84. PMT Online, "Stentor Student I Cello (Back Length 19.5in) 1/10", a product page. The page did
    not open on 2026-11-01, and the fact comes from a search summary.
    https://pmtonline.co.uk/stentor-student-i-cello-back-length-19-5in-1-10
