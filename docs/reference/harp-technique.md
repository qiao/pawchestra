# Harp technique: how a harpist sits at the harp and plays it

This file is the target of the pose and the motion of the deer harpist of the app. It describes
the size of the harp, the place of the harp at the player, the lean, the hands and their
registers, the arms, the hand shape, the pluck, and the rest of a harpist, with a source for each
fact.

**Upkeep.** This file is current. A change of the pose, the motion, or the place of the harp
updates section 6 "Use in the app" and each fact that it finds wrong, in the same commit. Each new
fact gets its source.

**Source marks.** Each fact names its source by a number of section 8. "(derived)" marks a value
that this file calculates from the values of its sources. A fact with no mark comes from the text
of the source.

## Terms

- **Soundbox.** The hollow back of the harp. It runs from the base up to the top of the harp, at
  the player. The strings start on its soundboard.
- **Column.** The pillar of the harp, at the far side from the player.
- **Neck.** The curved top bar from the top of the soundbox to the top of the column. The strings
  end in it.
- **Bass strings.** The long, low strings near the column. The treble strings are short and near
  the top of the soundbox, at the player.

## 1. The size of the harp

- A pedal harp stands about 1.8 m high, weighs about 36 kg, and has 47 strings, seven in each
  octave [7].
- A lever harp of 26 strings (Dusty Strings Ravenna 26) is 35 inches (0.89 m) high at the back and
  39 inches (0.99 m) at the front, from C3 to G6 [6]. A leg, a stand, or a step-stool raises it to
  a comfortable height [6].
- A harp that is too short for the player can stand on a small wooden box [4]. Some smaller harps
  are played with no tilt back [4].

## 2. The place of the harp and the lean

- The harp rests on the right shoulder, as near the neck of the player as possible, and on the
  inner side of both knees [1]. It sits on the right shoulder or the collarbone, out of the hollow
  of the neck [2].
- The player pulls the harp back between the legs and sits up straight. The harp moves a little
  to the right, balances lightly on the right shoulder, and the knees hold a part of it [3].
- The player tilts the harp back to its point of balance, so that the shoulder does not hold all
  of its weight [3]. At the right balance, a shrug of the right shoulder moves the harp forward
  [2].
- Present-day harpists put the harp a little to the right of the middle line of the body [5].
- The harp is diagonal to the player. Thus neither arm crosses the middle line of the body [4].
- On a lever harp, the tilt back onto the right shoulder makes the strings about vertical [4]. On
  a pedal harp on the shoulder, the strings are oblique [1].
- No source gives the tilt in degrees. The tilt follows from the two contacts: the soundbox on the
  right shoulder and the base on the floor or a stand (derived).
- The player sits erect, neither too tense nor too relaxed [1], with the spine straight [2], and
  does not lean back in the upper register [1]. The head does not rest on the harp [1].

## 3. The hands and the registers

- The right hand plays the treble strings, and the left hand the bass strings [5]. The left hand
  comes to the strings from the left side of the harp, and the right hand from the right side
  (derived from [1, 5]: the harp rests on the right shoulder).
- The left arm, stretched straight out, touches the column with the finger tips, or wraps the
  lowest string with the hand. Then the harp is at the right place on the shoulder [2].
- With the arms stretched out, the hands come near the middle of the strings [4].
- The fingers play a little below the middle of the strings, and the thumb a little above it [1].
- Both hands are at almost the same level on the strings. The left thumb is a little lower than
  the right thumb, but higher than the fingers of the right hand [1].
- The correct seat height puts both hands at the middle of the strings in the middle register,
  with the forearms horizontal and the shoulders down [1].

## 4. The arms, the wrists, and the hand shape

- Each forearm is horizontal ("elbow up") [1]. In the upper register, the left elbow is a little
  lower [1].
- The elbows rise to a relaxed position, and the wrists go a little down [3].
- The wrists curve in and do not rest on the soundboard. The right wrist can touch it in the upper
  register [1].
- The hand curves, with a hollow in the palm. The fingers point down and play with the finger
  tips [1, 3].
- The thumbs stand upright, almost vertical, a little toward the fingers, with a big space between
  the thumb and the second finger [1]. The thumbs point up [3].
- A harpist plays with the thumb and the first three fingers, and seldom with the little finger
  [7].

## 5. The pluck and the rest

- After a pluck, each finger closes into the palm at once, and the thumb bends over the second
  finger [1]. The closed hand then rises, with the wrist curved in [1].
- When one hand plays alone, the other hand rests lightly on the edge of the soundboard, or gets
  ready for the next passage [1].

## 6. Use in the app

The deer plays the harp at its place of `HARP_PLACE` of `src/models/instruments/harp.ts`, with the
hold `HANDS_HOLDS.harp` of `src/pose/hands.ts`.

The app follows these facts:

- **The size (section 1).** The deer plays a smaller harp (`SpeciesParams.harpScale`), near the
  lever harp. The harp stands on a box (`HARP_STAND`), as a short harp does.
- **The place and the lean (section 2).** The harp leans back (`HARP_PLACE.tilt`), and the top of
  its soundbox rests on the front of the right shoulder, near the neck. The harp is diagonal to the
  deer, with the column at the front left (`HARP_PLACE.turn`).
- **The trunk (section 2).** The spine leans a little forward (`HANDS_HOLDS.harp.lean`), near the
  erect seat. A larger lean brings the long muzzle to the neck of the harp.
- **The registers (section 3).** The left hand plays the bass strings from the left side, and the
  right hand the treble strings from the right side (`faceL`, `faceR`).
- **The elbows (section 4).** The elbows point out and down (`poleL`, `poleR`).
- **The wrists (section 4).** The left palm faces the strings and a little down (`faceL`), so
  that the left wrist bends only a little, as the wrists of a harpist go a little down. A palm
  square to the strings bends the left wrist of the short arm far back, because the left forearm
  points into the strings.
- **The pluck (section 5).** The fingers curl after each pluck (`curl`, `curlClosed`), and the palm
  pulls away from the strings (`HAND_MOTION` of `src/pose/hand-notes.ts`).

The app does not follow these facts:

- **The knees (section 2).** The short knees of the deer lie under its round belly. Thus the base
  stands in front of the knees, and between them only in the front view.
- **The level forearms (section 4).** The forearms rise from the elbow to the wrist, because the
  elbows of the short arms hang below the strings.
- **The level hands (section 3).** The left palm is higher on the strings than the right palm
  (`palmL`, `palmR`). The short left arm reaches the far bass strings only higher on the strings.
- **The rest on the soundboard (section 5).** Each hand rests on a string, a little away from it
  (`restL`, `restR`). A left palm on the thigh folds the left shoulder of the deer mesh.

## 7. Fingering

### 7.1 The fingers and the hands

- A harpist plays with four fingers of each hand, and does not use the fifth finger [1, 12, 17].
  The numbers are 1 (the thumb), 2, 3, and 4 (the ring finger) [1, 14].
- Both thumbs are on top [11]. In each hand, the thumb plays the highest string of a position, and
  finger 4 the lowest [11, 14]. The largest gap of the hand is between the thumb and finger 2, so
  the widest interval of a chord goes there [11].
- The right hand cannot reach the lowest strings, because it reaches around the soundbox. Two
  hands do not play together below the bass staff [12]. Fast passages sound best in the middle
  octaves, and the highest octave has little room for the hands [12].
- Two hands can share one fast line [12]. An arpeggio goes from hand to hand in groups of at most
  four notes [11, 16].
- The strings of one pedal harp are about 13 mm apart in the middle and 15 mm in the bass [18].
  Thus a tenth (9 gaps) spans about 12 cm (derived).

### 7.2 Placing

- **Placing** puts the fingers onto their strings before they sound [1]. The harpist places at
  once after the pluck before, in the order of the play [1]. A sign of the score places a group of
  strings at once [8].
- In a chord, the four fingers go onto their strings at the same time [1]. In an exercise, the
  harpist places the next measure during the count of an empty measure [1].
- The fingers rest lightly on the strings [1]. The hand and the wrist keep the same angle when
  they place anew, and the line of knuckles 2, 3, and 4 sets that angle [1].
- When time separates two notes of a phrase, the next finger slides silently up along its string
  and back, so that the hand keeps its contact [1, 8].
- In an arpeggio at 120 beats per minute, the finger touches its string for the full 250 ms before
  the next note. In a chord at 60 beats per minute, the contact is a quarter of the 500 ms [9].

### 7.3 The pluck and the strike point

- The finger plays with its tip, and the thumb with its outer edge [1]. The pluck is a pull into
  the hand, with the full travel of the finger, because the strings are thick and tight [12].
- After the pluck, the finger closes into the palm, and the thumb bends over finger 2 [1]. The
  hand stays still, and only the fingers move. The strength comes from the arm and the back [1].
- The stick phase of a pluck lasts about 56 to 431 ms, and the slip phase about 1 to 6 ms [9].
  The finger mostly pulls the string out, and turns it by a mean of about 40° to 45° [9].
- Harpists pluck at about one third to two fifths of the string, from the soundboard to the neck.
  The fingers differ by less than 1% of the string length [9]. The fingers play a little below the
  middle, and the thumb a little above [1].
- **Près de la table** (p.d.l.t.) plays very near the soundboard, with a nasal sound like a guitar
  [8, 11]. The hand then spans at most an octave [11], and the wrists rest on the soundboard [1].

### 7.4 Scales, arpeggios, and chords

One fingering serves all scales, because the harp is diatonic [1]. The diagram shows one octave
up in one hand.

```text
 strings, low to high --->
 group A: 4  3  2  1    group B: 4  3  2  1
          (4 lowest, 1 highest)  ^
                                 '-- 4 passes under the thumb before the thumb
                                     plays. Then 3 and 2 go low and 1 high at once.
```

- **Scale up.** Before the thumb plays, finger 4 passes under it and goes low on its string. After
  the thumb plays, the hand pivots on finger 4 as the arm pulls back a little. Then fingers 3 and
  2 go low, and the thumb high, at the same time [1].
- **Scale down.** Before finger 4 plays, the thumb crosses over it and goes high on its string.
  After finger 4 plays, fingers 2, 3, and 4 go low at the same time. The elbow pushes the hand
  forward [1].
- **Groups.** One octave plays 4321 4321 up and 1234 1234 down [14]. In two or more octaves,
  finger 3 turns under after the tonic, so the octave plays in groups of 3 and 4 [14]. The
  arpeggios of seventh chords play groups of 4 only [14].
- **Hard figures.** One hand does not easily play five notes in one group. A figure that changes
  direction, such as an Alberti bass, is harder than a run [11].
- **Chords.** A chord has up to eight notes, at most four in each hand [11, 13]. One hand easily
  reaches a tenth, and spans at most an octave and a fourth [11, 13]. In a large stretch, the
  thumb need not stand up [1].
- **Rolled chords.** A chord with no mark rolls up a little, fast and even, and its last note falls
  on the beat [1, 11]. An octave or a chord of two notes does not roll [1].

### 7.5 Glissandos and repeated notes

- **Glissando.** The hand glides in the middle of the strings: up with finger 3, down with the
  thumb, the hand open and relaxed [8]. Down, each hand plays one note. Up, one hand can play
  thirds or fourths [11]. In a glissando of opposite directions, the hands cross [11].
- **Repeated notes.** A fast repeat is very hard, because a finger that goes back onto a ringing
  string muffles it [12]. A fast repeat uses two hands, or two strings tuned to one pitch, such as
  C sharp and D flat [11, 12].

### 7.6 Damping

- For silence, the harpist places the hands wide open on the strings [8]. A damp puts the flat of
  the hand firmly on the strings, with the fingers apart, from the lowest to the highest string of
  the group [8, 15].
- The left hand damps the bass after a passage while the right hand plays on [15]. The hand then
  leaves with a small outward turn of the wrist, and the finger tips leave last [1].
- **Étouffé** (sons étouffés) stops each note just after it sounds [8]. In skips, the left hand
  lies flat, plucks, and goes back flat at once. The flat hand stops the sound, and the finger that
  played does not. In steps up, the back of the last joint of the finger stops the string before
  [8].
- A staccato note needs a pluck and a damp, and a damp takes twice the time of a pluck. Thus fast
  passages cannot be staccato [11, 12].

### 7.7 The pedals

- Seven pedals set the seven note names, each to flat, natural, or sharp [13]. The left foot moves
  D, C, and B, and the right foot E, F, G, and A [12, 13].
- The heels stay on the floor as much as possible [1, 8]. The knee relaxes, so that the ball of the
  foot guides the pedal silently into its notch [1].
- A harpist moves 1 to 2 pedals per second in short bursts. Two pedals of one foot at the same
  time are difficult [8, 12]. The pedal moves follow the accents of the music [1].

### 7.8 The arm between notes

- In the left arm of three harpists, the elbow is raised about 48° to the front and bends about
  120°. The hand bends back about 26° from the forearm, which helps the fingers close [10].
- The shoulder stays almost still. The elbow, the wrist, and the hand move more, in that order. The
  path of the hand between two notes is smooth and bell-shaped [10].

### 7.9 Rules for a fingering program

No source gives a cost model of harp fingering. These rules follow from the facts above.

- **Hands.** The right hand plays down to about G2, the lowest line of the bass staff (derived
  from [12]). A hand plays at most four strings in one position, with the thumb on the highest
  string [11, 14].
- **Span.** A tenth is easy, and an octave and a fourth is the limit [11, 13]. The widest gap goes
  between the thumb and finger 2 [11]. At p.d.l.t., the limit is an octave [11].
- **Groups.** A run up plays 4321 and passes 4 under the thumb. A run down plays 1234 and crosses
  the thumb over 4 [1, 14]. Groups of 4 and 3 are normal, and a group of 5 is hard [11, 14].
- **Placing time.** A group is placed at the latest at the pluck of the last note of the group
  before, and a chord is placed whole [1]. A finger can rest on its string for the full gap [9].
- **Cost.** A change of direction costs more than a run [11]. A string that sounds again in the
  same hand costs much, because the finger damps it [12]. A damp costs about one more pluck time
  [12].
- **Pedals.** A new accidental of a note name is a move of the pedal of that note, by its foot
  (derived from [13]). Two moves of one foot need time between them [12].

## 8. Sources

Sources 1 to 7 opened on 2026-10-25, and sources 8 to 18 on 2026-11-06, except the search
summary 18.

1. L. Lawrence, "Method for the Harp: Fundamental Exercises with Illustrations and Technical
   Explanations", Schirmer's Scholastic Series vol. 209, G. Schirmer, 1929 (an introduction to
   C. Salzedo, "Modern Study of the Harp").
   https://archive.org/download/methodforharpfun01lawr/methodforharpfun01lawr.pdf
2. L. Aspnes, "Raise your Game: Mastering the Technical Side of Harp Playing", Harp Column Academy
   Summer Camp, 2020.
   https://harpcolumn.com/academy/wp-content/uploads/sites/3/2020/08/Lynne-Aspnes%E2%80%94Raise-Your-Game.pdf
3. Music Mark, "A Common Approach", harp, area B, "Posture, hand position, and recognition of
   strings and levers" (P1, B1).
   https://www.musicmark.org.uk/a-common-approach/harp/area-b/pos-1/b1/
4. My Harp's Delight, "Harp Posture". https://www.myharpsdelight.com/harp-posture/
5. S. Chadwick, "Orientation", Early Gaelic Harp Info. https://earlygaelicharp.info/orientation
6. Dusty Strings, "Ravenna 26". https://manufacturing.dustystrings.com/harp-models/ravenna-26
7. Wikipedia, "Pedal harp". https://en.wikipedia.org/wiki/Pedal_harp
8. C. Salzedo, "Modern Study of the Harp" ("L'étude moderne de la harpe"), G. Schirmer, 1921.
   https://archive.org/download/letudemodernedel00salz4/letudemodernedel00salz4.pdf
9. D. Chadefaux, J.-L. Le Carrou, B. Fabre, and L. Daudet, "Experimentally based description of
   harp plucking", J. Acoust. Soc. Am. 131(1), 844-855, 2012. doi:10.1121/1.3651246.
   https://www.lam.jussieu.fr/Membres/LeCarrou/Articles/A5_Chadefaux_HarpPluckingDescription.pdf
10. D. Chadefaux, M. Wanderley, J.-L. Le Carrou, B. Fabre, and L. Daudet, "Experimental study of
    the musician / instrument interaction in the case of the concert harp", Acoustics 2012,
    Nantes. https://www-media.idmil.org/media/2012/chadefaux_2012_acoustics.pdf
11. D. Freund and D. Cutler, "Harp | Scoring", Extreme Orchestration, Timbre and Orchestration
    Resource, 2024. https://timbreandorchestration.org/isfee/extreme-orchestration/harp/scoring
12. C. Mills (principal harpist, New Zealand Symphony Orchestra), "Writing for the Harp in the
    Orchestra", 2016.
    https://nzso.sgp1.cdn.digitaloceanspaces.com/writing-for-harp-in-orchestra.pdf
13. F. Pomeranz, "Writing for the Harp", Berklee Today, Fall 2004.
    https://www.berklee.edu/node/2392666
14. Trinity College London, "Suggested Fingerings for Harp Technical Work".
    https://pubweb-prod.trinitycollege.com/resource?id=5525
15. Music Mark, "A Common Approach", harp, area B, "Tone quality, sound production and damping"
    (P3, B4). https://www.musicmark.org.uk/a-common-approach/harp/area-b/pos-3/b4/
16. Music Mark, "A Common Approach", harp, area B (P4, B3).
    https://www.musicmark.org.uk/a-common-approach/harp/area-b/pos-4/b3/
17. A. Hugill, "Harp: Hand Techniques", The Orchestra: A User's Manual.
    https://andrewhugill.com/OrchestraManual/harp_techniques.html
18. Harp Column forum, "String spacing on pedal harps" (a search summary only).
    https://harpcolumn.com/forums/topic/string-spacing-on-pedal-harps/
