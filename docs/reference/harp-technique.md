# Harp technique: how a harpist sits at the harp and plays it

This file is the target of the pose and the motion of the deer harpist of the app. It describes
the size of the harp, the place of the harp at the player, the lean, the hands and their
registers, the arms, the hand shape, the pluck, and the rest of a harpist, with a source for each
fact.

**Upkeep.** This file is current. A change of the pose, the motion, or the place of the harp
updates section 6 "Use in the app" and each fact that it finds wrong, in the same commit. Each new
fact gets its source.

**Source marks.** Each fact names its source by a number of section 7. "(derived)" marks a value
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

## 7. Sources

All sources opened on 2026-10-25.

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
