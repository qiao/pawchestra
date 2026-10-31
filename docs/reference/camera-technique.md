# Camera technique: how a concert film cuts and frames its shots

This file is the target of the automatic camera of the app (Cinematic mode, design 2.5 and 5.6).
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

- **The master shot (section 2).** The first shot is the default view, a long shot of the full
  stage, and a wide shot comes back at least each `SHOT_TIMES.maxWideGapSec`.
- **The score (section 5).** The planner reads the music after each cut, and a cut at an entry
  shows the player who enters (`CUT_BONUS.entry`, `TIERS`).
- **The conductor (section 5).** The conductor shots come between the other shots, with some
  shots between them (`SHOT_TIMES.conductorSpacing`).
- **The moves (section 4).** Each move starts and ends at rest (a smoothstep), and the close
  shots push in slowly.

The app does not follow these facts yet:

- **The line (section 1).** A close camera can stand up to `KEY_SEARCH.maxFromFront` from the
  front of its subject, also behind the orchestra.
- **The screen direction of a look (section 1).** A close camera can show a player look to the
  other side of the screen than in the master shot.
- **The 30° rule (section 2).** The planner compares the radius of the subjects, and a wide shot
  and a conductor shot can be too near in angle and in size.
- **Moves across a cut (section 4).** The seeded arcs of two shots in a row can go in opposite
  directions.
- **Look room and headroom (section 3).** A close shot puts the target of its subject in the
  middle of the frame.

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
   "Cross-cultural Filmmaking", University of California Press, 1997, p. 97.
   https://en.wikipedia.org/wiki/Headroom_(photographic_framing)
7. R. Thompson and C. J. Bowen, "Grammar of the Edit", 3rd ed., Focal Press, 2013, and 4th ed.,
   Routledge, 2018: the heading "Avoid cutting pans and tilts that reverse direction at the cut
   point" of the table of contents (PIP #11 of the 3rd edition, item 31 of the 4th edition).
8. Elbphilharmonie Hamburg, "The Stream Team", Mediatheque, 2020-05-22.
   https://www.elbphilharmonie.de/en/mediatheque/the-stream-team/381
9. B. Zaza, "Lessons learned: Live Multi-Camera Directing in Classical Music, Part II",
   Orchestras Canada, 2022-10-31. https://oc.ca/en/?p=11091
