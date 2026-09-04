/**
 * Scroll lock — the second half of the overlay infrastructure. While a modal
 * surface is open the document behind it must not scroll. {@link lockScroll}
 * freezes `<html>` overflow and compensates for the now-missing scrollbar with
 * matching padding so the page does not shift. It is **reference-counted**:
 * nested/stacked overlays each take a lock and the page only unfreezes once the
 * last one releases.
 *
 * Release **hands the styles back to whoever holds them now**, not to whatever
 * was there when the first lock was taken. This library is never the only thing
 * on a page: a native `<dialog>`, a third-party overlay or a router transition
 * can set `overflow` while our lock is held, and blindly restoring a snapshot
 * from minutes earlier would either strand the page unscrollable or unfreeze
 * one that another component still wants frozen. So the values we wrote are
 * remembered, and on release each is restored only if it is still exactly what
 * we left — otherwise someone else has taken ownership and is left alone.
 */

let count = 0;
let restore: () => void = () => {};

/** Lock document scrolling; returns an idempotent unlock function. */
export function lockScroll() {
  count += 1;
  if (count === 1) {
    const root = document.documentElement;
    const body = document.body;
    const previousOverflow = root.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - root.clientWidth;
    const appliedPadding = scrollbar > 0 ? `${scrollbar}px` : null;
    root.style.overflow = "hidden";
    if (appliedPadding) body.style.paddingRight = appliedPadding;
    restore = () => {
      // "hidden" is what we wrote; anything else means the page moved on.
      if (root.style.overflow === "hidden") root.style.overflow = previousOverflow;
      if (appliedPadding && body.style.paddingRight === appliedPadding) {
        body.style.paddingRight = previousPadding;
      }
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
