/** The text of the button that copies or shares the link of the page (design 2.2, 2.8). */
export const COPY_LINK_TEXT = 'Copy link';

/** The status after the link is in the clipboard (design 2.8). */
const LINK_COPIED_TEXT = 'The link is copied.';

/** The status after the browser did not copy the link (design 2.8). */
const LINK_FAILED_TEXT = 'The link did not copy. Copy it from the address bar.';

/** The result of a click on "Copy link". */
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Gives the link of the page to the user (design 2.2): the share sheet of the system on a touch
 * device, because a phone shares a link from there, else the clipboard.
 *
 * @param browser The navigator of the page.
 * @param url The link: the URL of the page with its hash.
 * @param title The title of the page.
 * @param touch True on a touch device (`(pointer: coarse)`).
 * @returns The result. A closed share sheet gives `cancelled`.
 */
export async function shareLink(
  browser: Navigator,
  url: string,
  title: string,
  touch: boolean,
): Promise<ShareResult> {
  if (touch && 'share' in browser) {
    try {
      await browser.share({ title, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  try {
    await browser.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * Gives the status text of a result (design 2.8).
 *
 * @param result The result of {@link shareLink}.
 * @returns The text, or '' when the share sheet shows the result.
 */
export function shareStatusText(result: ShareResult): string {
  switch (result) {
    case 'copied':
      return LINK_COPIED_TEXT;
    case 'failed':
      return LINK_FAILED_TEXT;
    case 'shared':
    case 'cancelled':
      return '';
  }
}
