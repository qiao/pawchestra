# Camera technique: how a concert film cuts and frames its shots

This file is the target of the cinematic camera of the app (Cinematic mode, design 2.5 and 5.6).
It gives the rules of continuity editing, of the frame, and of the film of an orchestra concert,
with a source for each fact.

**Upkeep.** This file is current. A change of the shot planner (`src/shots/`) updates section 6
"Use in the app" and each fact that it finds wrong, in the same commit. Each new fact gets its
source.

**Source marks.** Each fact names its source by a number of section 7. "(derived)" marks a rule
that this file makes from the facts of its sources. A fact with no mark comes from the text of the
source.

## Terms

- **Master shot.** The wide shot that shows the full scene. It sets the place of each subject on
  the screen.
- **Axis of action (the line).** A line through the subjects, in the direction in which they move
  or look. The 180° rule keeps the camera on one side of it.
- **Screen direction.** The side of the screen to which a subject looks or moves.
- **Jump cut.** A cut between two shots of one subject that are almost the same. The subject seems
  to jump on the screen.
- **Look room.** The space of the frame on the side to which the subject looks. Also "lead room"
  or "nose room".
- **Headroom.** The space between the top of the head and the top of the frame.

## 1. The line and the screen direction

- Screen direction is the direction in which a person or an object looks or moves on the screen.
  The audience judges the action by what it sees on the screen [1, p. 13-17].
- Once a shot sets the screen direction, the camera keeps it when it stays on the same side of the
  axis of action [1, p. 13-19]. The camera operator stays on one side of the axis [1, p. 13-20].
- The camera stays on one side of an imaginary axis between two subjects. A camera that crosses
  the axis makes the subjects seem to swap their places or to face the other way [4].
- A neutral shot has no screen direction: a head-on shot shows only the front of the subject, and
  a tail-away shot only its back. A shot that shows one side of the subject has a direction [1,
  p. 13-17].
- A neutral shot can stand between two shots of opposite screen directions [1, p. 13-17].

## 2. The 30° rule and the jump cut

- Between two shots of the same subject, the camera moves at least 30° around the subject. A
  smaller move gives a jump cut [2, 3].
- Some teachers also ask for a change of the frame, such as from a medium shot to a close-up [2].
  A cut from a full figure to a tighter frame is different enough to show a change [3].
- A cut jars when two shots are so near in angle and distance that the cut has no reason [3].
- The camera changes its angle between the shots of one sequence [1, p. 13-16].
- The three basic shots are the long shot, the medium shot, and the close-up. A long shot sets the
  place [1, p. 13-15]. Use high and low camera angles with caution [1, p. 13-15].

## 3. The frame: look room, headroom, and thirds

- A good frame leaves space in the direction in which the subject looks or moves [5].
- The rule of thirds puts the eyes of the subject one third of the way down from the top of the
  frame [6].
- When the camera zooms or tilts, it keeps the center of interest about one third down from the
  top [6].
- A subject that looks to one side has more space on that side, so it stands on the third line on
  the other side (derived from [5, 6]).
- A shot takes its name from the lowest part of the body at the bottom of the frame: a full
  figure, knee, thigh, waist, bust, head, or tight head shot [1, p. 13-15].
- A shot also takes its name from the number of people in it: a one-shot, a two-shot, a
  three-shot, a group-shot of five or six people, and a crowd-shot of 20 or more [1, p. 13-15].
- The closer the subject, the less headroom it needs. In an extreme close-up, the top of the head
  is out of the frame [6].
- A 21:9 frame is 2.33 times as wide as it is high. A waist shot of a seated player puts its eyes
  one third down from the top and its waist at the bottom. A seated player with its instrument is
  about as wide as it is high from the waist up, so it fills about 0.4 of the frame width
  (derived from [1, 6]).
- An over-the-shoulder shot puts the camera behind the shoulder and the head of a person in the
  foreground. The back of the head in the foreground adds depth to the frame [10].
- A usual over-the-shoulder shot has a shallow depth of field: the shoulder in the foreground is
  soft, and the subject stays sharp [10].
- A shot of one person with the back of the head and the shoulder of another person is also
  called a "dirty" shot, and a shot with no other person a "clean" shot [11].
- The back of the nearer person takes up no more than one third of the frame, so that the face
  of the farther person shows clearly [12].

## 4. Moves across a cut

- Do not cut between pans or tilts that reverse their direction at the cut point [7].
- A move starts and ends at rest, so that a cut never falls in the middle of a fast move (derived
  from [7]).
- A move toward the camera or away from it is neutral, and it can stand between moves to the left
  and to the right (derived from [1, p. 13-17]).

## 5. The film of an orchestra concert

- The video director works from the score, with each entry of each musician marked. The images
  fit the music and show the right musicians at the right moment [8].
- The remote cameras stand on the railings around the concert platform and among the players
  [8]. All of them film the players from the hall, in front of the stage (derived from [8]).
- A director scripts the camera and the shot of each bar of the score before the concert [9].
- When much happens in the orchestra, a director does not fall back to the wide shot. A detail,
  such as an expressive player, is better [9].
- A shot of the conductor between the other shots is a safe choice [9].
- A close-up that stays too long feels uncomfortable. Start to zoom out [9].
- The script leaves enough time between the shots, because a change of the camera takes time [9].

## 6. Use in the app

The shot planner of `src/shots/prepare.ts` makes the shots of each piece one time from the score,
and `cameraAt()` of `src/shots/camera-at.ts` gives the camera of each frame (design 5.6).
`pnpm shot-trace --rules` counts the breaks of the rules of sections 1 to 4 over all demos.

The app follows these facts:

- **The master shot (section 2).** The first shot starts at the default view, a long shot of the
  full stage, and a wide shot comes back at least each `SHOT_TIMES.maxWideGapSec`. The wide shots take
  `WIDE_FOV`, so the stage fills the width of the 21:9 frame.
- **The score (section 5).** The planner reads the music after each cut, and a cut at an entry
  shows the player who enters (`CUT_BONUS.entry`, `TIERS`).
- **The conductor (section 5).** The conductor shots come between the other shots, with some
  shots between them (`SHOT_TIMES.conductorSpacing`).
- **The moves (section 4).** Each move starts and ends at rest (a smoothstep), and the close
  shots push in slowly.
- **The line (section 1).** The default view is the master shot. Each camera looks at most
  `FILM_GRAMMAR.lineAzimuth` (75°) away from the audience axis, so it stays in the hall, as the
  cameras of a concert hall do.
- **The screen direction of a look (section 1).** A close camera shows each player or section
  look to the same side of the screen as in the master shot. A look within
  `FILM_GRAMMAR.neutral` (20°) of the camera axis is neutral, as a head-on or a tail-away shot.
  The conductor shows only from behind, so its look is always neutral.
- **The 30° rule (section 2).** Each shot turns the camera by at least `FILM_GRAMMAR.jumpAngle`
  (30°) around its target from the previous shot, or it changes the size of the frame by
  `FILM_GRAMMAR.jumpSize` (1.5 times, about one step from a medium shot to a close-up).
- **The camera height (sections 2 and 5).** The cameras stand low, near the eye height of the
  players, as the cameras on the railings around the platform. The wanted camera of each kind
  stands at `CAMERA_LOWER` (0.7) of the height of its nominal elevation above the stage top. A
  close camera with heads in the foreground first tries each azimuth at that height, and only
  then rises.
- **Moves across a cut (section 4).** The arc of a shot goes in the direction of the arc of the
  previous shot, and the last shot cranes up in place of a pull-out after a push-in. A push-in
  with no arc is neutral on the axis of the arc.
- **Look room and headroom (section 3).** A close shot turns its camera, so that the eyes of the
  subject stand on the upper third line, and the subject on the third line away from its look. A
  subject with a neutral look stands in the middle.
- **Shot sizes (section 3).** A close shot fits the width of its subject in the 21:9 frame
  (`SHOT_SIZES`) at the end of its push-in, its closest moment. A solo is a knee one-shot of one
  player, a section shot a group-shot or a two-shot, a side view a group-shot of the front half
  of one side, and a conductor shot a thigh shot of the bear from behind. The solo and the
  conductor shots are 1.25 times larger than a waist shot, because the low-poly animals show
  their facets and the seams of their meshes from near. The frame holds the head with no ears
  (`HEAD_BONES`), because the closer the subject, the less headroom it needs, and a close shot
  can cut the top of the head (section 3). Thus the long ears of a rabbit or a fox can leave the
  frame of a solo, and the solo shows the player and its instrument in place of about seven
  players.
- **The group-shot of a side (section 3).** A side view shows the players of its sphere as one
  group (a group-shot of five or six players or more). A head of another player in front of the
  group counts in the foreground rule, and the side camera stays low
  (`KEY_SEARCH.sideCeiling`).
- **The dirty frame (section 3).** A near head or a near box of another object that the depth of
  field blurs can stand at one side edge of a close shot (`FOREGROUND.dirtyBlur`). Its inner edge
  stays in the outer third of the frame width (`FOREGROUND.dirtyShare`), and the dirty heads of a
  frame stay at one side. A head over the subject always counts. Thus a solo camera can stay low
  behind the heads of the front rows.
- **The distance to the animals (section 3).** Each animal in the frame of a close shot, also a
  head of a dirty frame, stays at least `ANIMAL_FLOOR` from the camera, because the low-poly
  animals show their facets and the seams of their meshes from near.

The app does not follow these facts:

- **Short takes (section 5).** A shot lasts from `SHOT_TIMES.minSec` (4 s) to
  `SHOT_TIMES.maxSec` (14 s). A live broadcast uses more and shorter takes, but the planner makes
  each shot one time from the score, and each shot needs a clear camera.
- **The zoom out (section 5).** A long close shot pushes in slowly, and it does not zoom out.
- **The soft shoulder (section 3).** The lens of the app blurs a point in front of the focus to
  at most `LENS.maxNearBlur` of the image height (design 4.5), so the head at the edge of a dirty
  frame is only a little soft.

## 7. Sources

All sources opened on 2026-10-31.

1. U.S. Navy, "Photography (Basic)", NAVEDTRA 14209, 1993, chapter 13 "Motion Media", pages 13-15
   to 13-20. https://everyspec.com/USN/NAVEDTRA/NAVEDTRA_14209_OCT1993_18402/ (text of the
   chapter: https://dofmaster.com/courses/basic/photographycourse-341.html and the pages beside
   it).
2. Wikipedia, "Jump cut", which cites D. Bordwell and K. Thompson, "Film Art: An Introduction",
   8th ed., McGraw Hill, 2006, p. 254. https://en.wikipedia.org/wiki/Jump_cut
3. Wikipedia, "30-degree rule", which cites W. Murch, "In the Blink of an Eye", 2nd ed.,
   Silman-James, 2001, p. 146, and M. Hurbis-Cherrier, "Voice & Vision", 2nd ed., Focal Press,
   2011, p. 600. https://en.wikipedia.org/wiki/30-degree_rule
4. Wikipedia, "180-degree rule", which cites N. T. Proferes, "Film Directing Fundamentals", 2nd
   ed., 2005, pages 5 to 7. https://en.wikipedia.org/wiki/180-degree_rule
5. Wikipedia, "Lead room". https://en.wikipedia.org/wiki/Lead_room
6. Wikipedia, "Headroom (photographic framing)", which cites I. Barbash and L. Taylor,
   "Cross-cultural Filmmaking", University of California Press, 1997, p. 97, G. Millerson,
   "Video Camera Techniques", Focal Press, 1994, p. 80, and R. Thompson, "Grammar of the Shot",
   Focal Press, 1998, p. 64. https://en.wikipedia.org/wiki/Headroom_(photographic_framing)
7. R. Thompson and C. J. Bowen, "Grammar of the Edit", 3rd ed., Focal Press, 2013, and 4th ed.,
   Routledge, 2018: the heading "Avoid cutting pans and tilts that reverse direction at the cut
   point" of the table of contents (PIP #11 of the 3rd edition, item 31 of the 4th edition).
8. Elbphilharmonie Hamburg, "The Stream Team", Mediatheque, 2020-05-22.
   https://www.elbphilharmonie.de/en/mediatheque/the-stream-team/381
9. B. Zaza, "Lessons learned: Live Multi-Camera Directing in Classical Music, Part II",
   Orchestras Canada, 2022-10-31. https://oc.ca/en/?p=11091
10. Wikipedia, "Over-the-shoulder shot", which cites B. Brown, "Cinematography: Theory and
    Practice", Focal Press, 2012, p. 23, G. Mercado, "The Filmmaker's Eye", Focal Press, 2013,
    and M. Svanera, S. Benini, N. Adami, R. Leonardi, and A. B. Kovács, "Over-the-shoulder shot
    detection in art films", CBMI 2015, IEEE. https://en.wikipedia.org/wiki/Over-the-shoulder_shot
11. University of Utah, CS 3660, "Cinematography: Composition & the Camera in Machinima", lecture
    slides, slide 12 "Over the Shoulder (OTS)".
    https://my.eng.utah.edu/~cs3660/LecturesPDF/CS3660Machinima_Cinematography_03%20Jana.pdf
12. N. LaJeunesse, "Over the shoulder shot: Its uses in cinema", Videomaker, section "Camera
    placement".
    https://www.videomaker.com/how-to/shooting/camera-movement/over-the-shoulder-shot-its-uses-in-cinema/
