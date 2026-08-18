/**
 * Scroll lock — the second half of the overlay infrastructure. While a modal
 * surface is open the document behind it must not scroll. {@link lockScroll}
 * freezes `<html>` overflow and compensates for the now-missing scrollbar with
 * matching padding so the page does not shift. It is **reference-counted**:
 * nested/stacked overlays each take a lock and the page only unfreezes once the
 * last one releases.
 */

let count = 0;
let restore: () => void = () => {};

/** Lock document scrolling; returns an idempotent unlock function. */
export function lockScroll(): () => void {
  count += 1;
  if (count === 1) {
    const root = document.documentElement;
    const body = document.body;
    const previousOverflow = root.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - root.clientWidth;
    root.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    restore = () => {
      root.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    if (count === 0) restore();
  };
}
