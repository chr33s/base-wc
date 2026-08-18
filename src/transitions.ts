/**
 * Enter/exit transitions — keep a popup in the DOM (and the Popover top layer)
 * until its close animation finishes (Base UI's transition status).
 *
 * Components toggle `data-open` and a `data-state` of `open` / `closed`: the
 * *enter* animation is pure CSS (`@starting-style` + a transition on
 * `[data-state="open"]`), and on close they call {@link runExit}, which flips
 * `data-state` to `closed`, waits for the longest transition/animation to finish
 * (with a duration fallback so a dropped `transitionend` can't wedge it open),
 * then runs `done` (e.g. `hidePopover()`). With no CSS transition, `done` runs
 * synchronously — so behaviour is unchanged unless the consumer opts into
 * animation via `[data-state]` styles.
 */
function durationMs(value: string, delay: string): number {
  const toMs = (list: string) =>
    Math.max(
      0,
      ...list.split(",").map((v) => {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? (v.trim().endsWith("ms") ? n : n * 1000) : 0;
      }),
    );
  return toMs(value) + toMs(delay);
}

/** Longest transition or animation on `el`, in ms (0 when none / unsupported). */
function maxDurationMs(el: Element): number {
  if (typeof getComputedStyle !== "function") return 0;
  const s = getComputedStyle(el);
  return Math.max(
    durationMs(s.transitionDuration, s.transitionDelay),
    durationMs(s.animationDuration, s.animationDelay),
  );
}

/** Mark an element's open state for `@starting-style` / `[data-state]` styles. */
export function setOpenState(el: HTMLElement, open: boolean): void {
  el.setAttribute("data-state", open ? "open" : "closed");
}

/** Flip to the closed state and run `done` once the exit animation finishes. */
export function runExit(el: HTMLElement, done: () => void): void {
  el.setAttribute("data-state", "closed");
  const duration = maxDurationMs(el);
  if (duration <= 0) {
    done();
    return;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    el.removeEventListener("transitionend", onEnd);
    el.removeEventListener("animationend", onEnd);
    done();
  };
  // Only the popup's own transition/animation ends the exit — a bubbling
  // `transitionend` from a descendant (e.g. a child button's shorter hover
  // fade) must not cut the exit animation short.
  const onEnd = (e: Event) => {
    if (e.target === el) finish();
  };
  const timer = window.setTimeout(finish, duration + 50);
  el.addEventListener("transitionend", onEnd);
  el.addEventListener("animationend", onEnd);
}
