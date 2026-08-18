/**
 * Composite navigation — the generalized **roving tabindex** helper (Base UI's
 * internal list/composite navigation). A group (radio group, toggle group,
 * toolbar, menubar) owns exactly one tabbable item at a time; arrow keys move
 * the tab stop between items, `Home`/`End` jump to the ends. This is the roving
 * counterpart to the combobox's `aria-activedescendant` model.
 *
 * The helper is deliberately state-light: it never caches the item list (the
 * DOM is the source of truth), taking a live `items()` accessor so additions,
 * removals and disabled changes are always reflected. Horizontal arrow keys
 * flip under RTL (see {@link isRTL}).
 */
import { isRTL } from "./direction.ts";

export type Orientation = "horizontal" | "vertical" | "both";

const NEXT_KEYS: Record<Orientation, string[]> = {
  horizontal: ["ArrowRight"],
  vertical: ["ArrowDown"],
  both: ["ArrowRight", "ArrowDown"],
};
const PREV_KEYS: Record<Orientation, string[]> = {
  horizontal: ["ArrowLeft"],
  vertical: ["ArrowUp"],
  both: ["ArrowLeft", "ArrowUp"],
};

// Input types that don't consume arrow/Home/End/Space for text editing, so
// roving may still navigate away from them.
const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "radio", "submit", "reset", "image"]);

/** Whether the target is a text field that owns its own caret/typing keys. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName === "INPUT")
    return !NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
  return false;
}

export interface RovingOptions {
  /** Live list of navigable (enabled) items, in DOM order. */
  items: () => HTMLElement[];
  /** Arrow-key axis. Default `"horizontal"`. */
  orientation?: Orientation;
  /** Wrap past the ends. Default `true`. */
  loop?: boolean;
  /** Fired when focus moves to an item (e.g. radio selection follows focus). */
  onMove?: (item: HTMLElement, index: number) => void;
  /** Fired on Enter/Space on the focused item. */
  onActivate?: (item: HTMLElement, index: number) => void;
}

export interface Roving {
  /** Reset the roving tab stop so only `activeIndex` (default 0) is tabbable. */
  refresh(activeIndex?: number): void;
  /** Move focus (and the tab stop) to an item; index is clamped or wrapped. */
  focusItem(index: number): void;
  destroy(): void;
}

/** Attach roving-tabindex keyboard navigation to `container`. */
export function roving(container: HTMLElement, options: RovingOptions): Roving {
  const orientation = options.orientation ?? "horizontal";
  const loop = options.loop ?? true;

  // Under RTL the horizontal arrows swap: ArrowLeft advances, ArrowRight goes
  // back. Computed per keydown so a runtime `dir` change is respected.
  const nextKeys = () => {
    const rtl = orientation !== "vertical" && isRTL(container);
    return NEXT_KEYS[orientation].map((k) => (k === "ArrowRight" && rtl ? "ArrowLeft" : k));
  };
  const prevKeys = () => {
    const rtl = orientation !== "vertical" && isRTL(container);
    return PREV_KEYS[orientation].map((k) => (k === "ArrowLeft" && rtl ? "ArrowRight" : k));
  };

  const refresh = (activeIndex = 0) => {
    const items = options.items();
    items.forEach((el, i) => {
      el.tabIndex = i === activeIndex ? 0 : -1;
    });
  };

  const focusItem = (index: number) => {
    const items = options.items();
    if (items.length === 0) return;
    let i = index;
    if (loop) i = (i + items.length) % items.length;
    else i = Math.max(0, Math.min(i, items.length - 1));
    items.forEach((el, n) => {
      el.tabIndex = n === i ? 0 : -1;
    });
    items[i].focus();
    options.onMove?.(items[i], i);
  };

  const onKeydown = (e: KeyboardEvent) => {
    const items = options.items();
    if (items.length === 0) return;
    // Only navigate when focus is on one of the roving items. Keydowns bubbling
    // up from nested content (a link inside an open panel, a control's own
    // children) keep their native behavior.
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    // A focused text field owns its arrow/Home/End/Space keys for caret
    // movement and typing.
    if (isTextEntry(e.target)) return;
    if (nextKeys().includes(e.key)) {
      e.preventDefault();
      focusItem(current + 1);
    } else if (prevKeys().includes(e.key)) {
      e.preventDefault();
      focusItem(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(items.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      // Only intercept activation when the consumer handles it; otherwise let
      // the item's native action (button click, link navigation) proceed.
      if (!options.onActivate) return;
      // Suppress the default action (Space scrolls the page on non-button
      // custom-element items) before activating.
      e.preventDefault();
      options.onActivate(items[current], current);
    }
  };

  container.addEventListener("keydown", onKeydown);
  return {
    refresh,
    focusItem,
    destroy: () => container.removeEventListener("keydown", onKeydown),
  };
}
