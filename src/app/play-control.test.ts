import { describe, expect, it } from 'vitest';

import type { LoadProgress } from '../audio/player.ts';
import {
  INSTRUMENTS_TEXT,
  INTRO_TEXT,
  LOADING_TEXT,
  PENDING_SHARE,
  SIZE_AFTER_SEC,
  WAIT_TEXT,
  atSongEnd,
  firstScreenView,
  loadShare,
  loadText,
  noPieceStatus,
  playAction,
  playLabel,
  showsFirstScreen,
} from './play-control.ts';
import type { PieceStatus } from './play-control.ts';

/** A piece on the first screen, with its samples ready. */
const READY: PieceStatus = {
  samples: 'ready',
  playing: false,
  playWhenReady: false,
  played: false,
};

describe('the play button of the bar (design 2.4)', () => {
  it('plays and pauses when the samples are ready', () => {
    expect(playAction(READY)).toBe('play');
    expect(playLabel(READY)).toBe('Play');
    const playing = { ...READY, playing: true, played: true };
    expect(playAction(playing)).toBe('pause');
    expect(playLabel(playing)).toBe('Pause');
  });

  it('waits for the samples, and a second click cancels the wait', () => {
    const loading: PieceStatus = { ...READY, samples: 'loading' };
    expect(playAction(loading)).toBe('wait');
    expect(playLabel(loading)).toBe('Play');
    const waiting = { ...loading, playWhenReady: true };
    expect(playAction(waiting)).toBe('cancel');
    expect(playLabel(waiting)).toBe('Pause');
  });

  it('shows "Play" after a failure, and a click tries again (review of step 5, F9)', () => {
    const failed: PieceStatus = { ...READY, samples: 'failed', played: true };
    expect(playAction(failed)).toBe('retry');
    expect(playLabel(failed)).toBe('Play');
    // The transport pauses on a failure. Until then, the button still offers a retry.
    expect(playAction({ ...failed, playing: true })).toBe('retry');
    expect(playLabel({ ...failed, playing: true })).toBe('Play');
  });
});

describe('the play button at the song end (audit 2026-10-05-ux-design, AM2)', () => {
  const ended: PieceStatus = { ...READY, played: true };

  it('offers to play again when the piece stopped at its end', () => {
    expect(atSongEnd(ended, 193.2, 193.2)).toBe(true);
    expect(atSongEnd(ended, 194, 193.2)).toBe(true);
  });

  it('does not before the end, during play, before the first play, or during a load', () => {
    expect(atSongEnd(ended, 120, 193.2)).toBe(false);
    expect(atSongEnd({ ...ended, playing: true }, 193.2, 193.2)).toBe(false);
    expect(atSongEnd(READY, 193.2, 193.2)).toBe(false);
    expect(atSongEnd({ ...ended, samples: 'loading' }, 193.2, 193.2)).toBe(false);
  });
});

describe('noPieceStatus (design 2.2, review of step 6, B2)', () => {
  it('shows the load on the first screen until the first piece shows', () => {
    const status = noPieceStatus(false, false);
    expect(status.samples).toBe('loading');
    expect(showsFirstScreen(status)).toBe(true);
    expect(playLabel(status)).toBe('Play');
  });

  it('offers a retry on the first screen after the first demo file did not load', () => {
    const status = noPieceStatus(true, false);
    expect(status.samples).toBe('failed');
    expect(showsFirstScreen(status)).toBe(true);
    expect(playLabel(status)).toBe('Play');
    expect(playAction(status)).toBe('retry');
  });
});

describe('the play button of the first screen (design 2.2, audit 2026-10-05-ux-design, LD1)', () => {
  const loading: PieceStatus = { ...READY, samples: 'loading' };

  it('shows "Play" and the load text while the samples load', () => {
    const view = firstScreenView(loading, progressOf(4, 12, 10, 100), true);
    expect(view.waiting).toBe(false);
    expect(view.playLabel).toBe('Play');
    expect(view.loadText).toBe('Loading instruments: 4 of 12');
  });

  it('shows the waiting state after a click during the load, as the bar does', () => {
    const waiting = { ...loading, playWhenReady: true };
    const view = firstScreenView(waiting, progressOf(4, 12, 10, 100), true);
    expect(view.shown).toBe(true);
    expect(view.waiting).toBe(true);
    expect(view.playLabel).toBe(playLabel(waiting));
    expect(view.playLabel).toBe('Pause');
    expect(view.loadText).toBe(`Loading instruments: 4 of 12\n${WAIT_TEXT}`);
    // A second click cancels the wait.
    expect(playAction(waiting)).toBe('cancel');
  });

  it('waits for the first piece after a click before it shows', () => {
    const status = noPieceStatus(false, true);
    expect(firstScreenView(status, null, false).waiting).toBe(true);
    expect(playAction(status)).toBe('cancel');
    // After a failed demo file, a click loads the file again and does not wait.
    expect(noPieceStatus(true, true).playWhenReady).toBe(false);
  });

  it('has no waiting state when the samples are ready', () => {
    const view = firstScreenView(
      { ...READY, playWhenReady: true },
      progressOf(12, 12, 100, 100),
      true,
    );
    expect(view.waiting).toBe(false);
    expect(view.loading).toBe(false);
    expect(view.loadText).toBe('');
  });
});

describe('the intro of the first screen (audit 2026-10-05-ux-design, FI2)', () => {
  it('names the app until the first play of the session', () => {
    expect(INTRO_TEXT.startsWith('Pawchestra: ')).toBe(true);
    expect(firstScreenView(READY, null, true, false).intro).toBe(true);
    expect(firstScreenView(noPieceStatus(false, false), null, false, false).intro).toBe(true);
    // A new piece after the first play shows the first screen with no intro.
    const next: PieceStatus = { ...READY, samples: 'loading', playWhenReady: true };
    expect(firstScreenView(next, null, true, true).intro).toBe(false);
  });
});

describe('showsFirstScreen (design 2.2)', () => {
  it('shows the first screen until the first play of the piece', () => {
    expect(showsFirstScreen(READY)).toBe(true);
    expect(showsFirstScreen({ ...READY, samples: 'loading', playWhenReady: true })).toBe(true);
    expect(showsFirstScreen({ ...READY, played: true })).toBe(false);
  });
});

/**
 * Gives the progress of a load.
 *
 * @param done The preset files that are ready.
 * @param total The preset files of the load.
 * @param bytes The bytes that arrived.
 * @param totalBytes The sum of the sizes of the files.
 * @returns The progress.
 */
function progressOf(done: number, total: number, bytes = 0, totalBytes = 0): LoadProgress {
  return { done, total, bytes, totalBytes };
}

describe('the load text and the load ring (design 2.8)', () => {
  it('gives the text of the spec, and a ring that follows the bytes', () => {
    expect(loadText(progressOf(4, 12), true)).toBe('Loading instruments: 4 of 12');
    // One large file of four arrived: the ring shows the bytes, and the text the files.
    expect(loadShare(progressOf(1, 4, 750, 1000))).toBe(0.75);
    expect(loadShare(progressOf(0, 4, 250, 1000))).toBe(0.25);
  });

  it('counts the files when the sizes are not known', () => {
    expect(loadShare(progressOf(4, 16))).toBe(0.25);
    expect(loadShare(null)).toBe(0);
    expect(loadShare(progressOf(0, 0))).toBe(0);
  });

  it('shows a load text at once (audit 2026-10-05-ux-design, LD2)', () => {
    expect(loadText(null, false)).toBe(LOADING_TEXT);
    expect(loadText(null, true)).toBe(INSTRUMENTS_TEXT);
    expect(loadText(progressOf(0, 0), true)).toBe(INSTRUMENTS_TEXT);
    expect(loadText(progressOf(0, 17, 0, 9000), true)).toBe('Loading instruments: 0 of 17');
  });

  it('turns a short part of the ring before the first byte arrives', () => {
    const loading: PieceStatus = { ...READY, samples: 'loading' };
    for (const view of [
      firstScreenView(noPieceStatus(false, false), null, false),
      firstScreenView(loading, null, true),
      firstScreenView(loading, progressOf(0, 17, 0, 9000), true),
    ]) {
      expect(view.pending).toBe(true);
      expect(view.loadShare).toBe(PENDING_SHARE);
      expect(view.loadText).not.toBe('');
    }
    const view = firstScreenView(loading, progressOf(0, 17, 2700, 9000), true);
    expect(view.pending).toBe(false);
    expect(view.loadShare).toBe(0.3);
  });

  it('keeps the turning part until the bytes pass it (audit 2026-10-06-ux-design-2, N16)', () => {
    const loading: PieceStatus = { ...READY, samples: 'loading' };
    // The first bytes give 1% of the ring. The ring does not jump back from 15% to 1%.
    for (const bytes of [90, 900, 1349]) {
      const view = firstScreenView(loading, progressOf(0, 17, bytes, 9000), true);
      expect(view.pending).toBe(true);
      expect(view.loadShare).toBe(PENDING_SHARE);
    }
    const view = firstScreenView(loading, progressOf(2, 17, 1350, 9000), true);
    expect(view.pending).toBe(false);
    expect(view.loadShare).toBe(PENDING_SHARE);
  });
});

describe('the size in the load text (audit 2026-10-06-ux-design-2, N22)', () => {
  it('adds the megabytes after 10 s of load', () => {
    const progress = progressOf(9, 17, 5_123_456, 9_412_345);
    expect(SIZE_AFTER_SEC).toBe(10);
    expect(loadText(progress, true, 9.9)).toBe('Loading instruments: 9 of 17');
    expect(loadText(progress, true, 10)).toBe('Loading instruments: 9 of 17 (5.1 of 9.4 MB)');
  });

  it('adds no size when the sizes are not known', () => {
    expect(loadText(progressOf(9, 17), true, 30)).toBe('Loading instruments: 9 of 17');
    expect(loadText(null, true, 30)).toBe(INSTRUMENTS_TEXT);
  });

  it('shows the size on the first screen, also while the piece waits', () => {
    const waiting: PieceStatus = { ...READY, samples: 'loading', playWhenReady: true };
    const view = firstScreenView(waiting, progressOf(1, 4, 2_000_000, 8_000_000), true, false, 12);
    expect(view.loadText).toBe(`Loading instruments: 1 of 4 (2.0 of 8.0 MB)\n${WAIT_TEXT}`);
  });
});
