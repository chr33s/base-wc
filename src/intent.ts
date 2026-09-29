/**
 * Hover intent — the open/close timer state machine and the **delay groups**
 * shared by Tooltip, Preview Card, Navigation Menu and submenu grace closing.
 *
 * {@link hoverIntent} is the timer pair: entering schedules an open after the
 * intent delay, leaving schedules a close after the close delay, and each side
 * cancels the other so sweeping across a trigger never queues stale work. An
 * optional `warm` check skips the open delay (see the delay groups below), and
 * the `armed` guard ignores the `pointerenter` a browser fires when a trigger
 * renders *under* a resting cursor (mount / re-render) rather than from an
 * intentional hover — it re-arms once the pointer actually leaves.
 *
 * The delay-group half: the first member of a named group to open waits the
 * full open delay; while any member is open (and for a short cooldown after the
 * last one closes) sibling members open instantly. This is what makes sweeping
 * across a row of tooltips feel responsive instead of re-incurring the delay on
 * every one. Components without a `group` never participate.
 *
 * {@link onPointerMoved} is the third piece: the filter that tells a hover the
 * user actually performed from one the page performed *at* them.
 */

/** Timing and callbacks for one {@link hoverIntent} surface. */
export interface HoverIntentOptions {
  /** Whether the surface is currently open (read per event, never cached). */
  isOpen: () => boolean;
  /** Open the surface (fired after the intent delay, or by `openNow`). */
  open: () => void;
  /** Close the surface (fired after the close delay, or by `closeNow`). */
  close: () => void;
  /** Open-intent delay in ms, read per schedule so live attributes apply. */
  openDelay: () => number;
  /** Close delay in ms, read per schedule. */
  closeDelay: () => number;
  /** Skip the open delay (e.g. {@link isGroupWarm} for a warm delay group). */
  warm?: () => boolean;
  /** Start disarmed when the trigger mounts under a resting cursor. */
  armed?: boolean;
}

/** Controls for a hover surface's open/close timers, returned by {@link hoverIntent}. */
export interface HoverIntent {
  /** Pointer entered the trigger: cancel a pending close, schedule the open. */
  scheduleOpen(): void;
  /** Pointer left: re-arm, cancel a pending open, schedule the close. */
  scheduleClose(): void;
  /** Pointer re-entered an "inside" part: keep the surface open. */
  cancelClose(): void;
  /** Drop a pending open (e.g. the hover moved to a different target). */
  cancelOpen(): void;
  /** Keyboard focus: open immediately, cancelling a pending close. */
  openNow(): void;
  /** Keyboard blur: close immediately, cancelling a pending open. */
  closeNow(): void;
  /** Clear both timers (teardown). */
  cancel(): void;
}

/** Create the hover-intent open/close timer pair for one hover surface. */
export function hoverIntent(options: HoverIntentOptions): HoverIntent {
  let armed = options.armed ?? true;
  let openTimer = 0;
  let closeTimer = 0;

  return {
    scheduleOpen() {
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      if (options.isOpen() || !armed) return;
      const delay = options.warm?.() ? 0 : options.openDelay();
      openTimer = window.setTimeout(() => options.open(), delay);
    },
    scheduleClose() {
      armed = true; // the pointer has left → future enters are intentional
      clearTimeout(openTimer);
      if (!options.isOpen()) return;
      clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => options.close(), options.closeDelay());
    },
    cancelClose() {
      clearTimeout(closeTimer);
    },
    cancelOpen() {
      clearTimeout(openTimer);
    },
    openNow() {
      clearTimeout(closeTimer);
      options.open();
    },
    closeNow() {
      clearTimeout(openTimer);
      options.close();
    },
    cancel() {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    },
  };
}
interface Group {
  warm: boolean;
  timer: number;
}

const groups = new Map<string, Group>();

function ensure(name: string) {
  let group = groups.get(name);
  if (!group) {
    group = { warm: false, timer: 0 };
    groups.set(name, group);
  }
  return group;
}

/** True while `name`'s group is warm (a member is open or just closed). */
export function isGroupWarm(name: string | null): boolean {
  return name != null && (groups.get(name)?.warm ?? false);
}

/** Mark a group warm because one of its members opened. */
export function openGroup(name: string | null): void {
  if (name == null) return;
  const group = ensure(name);
  group.warm = true;
  clearTimeout(group.timer);
}

/** A member closed: keep the group warm for `cooldown` ms, then cool it. */
export function closeGroup(name: string | null, cooldown: number): void {
  if (name == null) return;
  const group = ensure(name);
  clearTimeout(group.timer);
  group.timer = window.setTimeout(() => {
    group.warm = false;
  }, cooldown);
}

/**
 * Listen for `pointermove`s that actually moved the pointer.
 *
 * A scrolling list slides a new row under a *stationary* cursor, and Safari
 * reports that as a `pointermove` at unchanged coordinates. Any handler that
 * treats a move as "the user is hovering this" then yanks the highlight away
 * from the item the keyboard just navigated to — the highlight chases the
 * scroll instead of the arrow keys. Comparing against the last coordinates is
 * what separates a hover the user performed from one the page performed at
 * them, so every scrollable hover surface (the combobox's virtualized viewport,
 * a long menu popup) needs the same guard.
 *
 * Returns a dispose that detaches the listener.
 */
export function onPointerMoved(
  target: EventTarget,
  handler: (e: MouseEvent) => void,
  options?: AddEventListenerOptions,
): () => void {
  let lastX: number | null = null;
  let lastY: number | null = null;
  const onMove = (event: Event) => {
    if (!(event instanceof MouseEvent)) return;
    const e = event;
    if (e.clientX === lastX && e.clientY === lastY) return;
    lastX = e.clientX;
    lastY = e.clientY;
    handler(e);
  };
  target.addEventListener("pointermove", onMove, options);
  return () => target.removeEventListener("pointermove", onMove, options);
}
