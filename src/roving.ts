/**
 * Composite navigation — the generalized **roving tabindex** helper (Base UI's
 * internal list/composite navigation). A group (radio group, toggle group,
 * toolbar, menubar) owns exactly one tabbable item at a time; arrow keys move
 * the tab stop between items, `Home`/`End` jump to the ends. This is the roving
 * counterpart to the combobox's `aria-activedescendant` model.
 *
 * The helper is deliberately state-light: it never caches the item list (the
 * DOM is the source of truth), taking a live `items()` accessor so additions,
 * removals and disabled changes are always reflected. It does track *which
 * element* holds the tab stop, because "one tabbable item" is an invariant the
 * live list cannot state on its own — remove the tabbable item and the group
 * silently leaves the tab order. A mutation observer restores the invariant,
 * preferring the element that already had the stop over resetting to the first.
 * Horizontal arrow keys flip under RTL (see {@link isRTL}).
 *
 * The observer is the one piece with a lifetime, so every owner calls
 * {@link Roving.destroy} from its `disconnectedCallback` and builds a fresh
 * helper if it is re-inserted. Nothing is lost in the round trip: with no
 * tracked stop, {@link Roving.refresh} adopts whichever item the DOM already
 * marks tabbable.
 */
import { isRTL } from "./direction.ts";
import { LightDomElement } from "./lifecycle.ts";
import { clamp } from "./math.ts";

/** Arrow-key axis a composite navigates along; `"both"` accepts all four arrows. */
export type Orientation = "horizontal" | "vertical" | "both";

/**
 * Disabled via the attribute, or announced so — a non-form custom element can
 * only do the latter. The one predicate every composite's `items()` should use.
 */
export function isDisabled(el: Element): boolean {
  return el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
}

/** Tuning for {@link resolveNavKey}. */
export interface NavKeyOptions {
  /** Arrow-key axis. Default `"horizontal"`. */
  orientation?: Orientation | undefined;
  /** Wrap past the ends (else clamp). Default `true`. */
  loop?: boolean | undefined;
  /** Swap the horizontal arrows for right-to-left contexts. Default `false`. */
  rtl?: boolean | undefined;
}

/**
 * Resolve a navigation keydown to a target index, or `null` when the key does
 * not navigate. This is the one copy of the arrow/Home/End arithmetic shared by
 * {@link roving} and by components with a different focus model (menus,
 * listboxes via `aria-activedescendant`, accordion headers). `current` must be
 * a valid index into the list (callers resolve their "nothing active yet" state
 * before calling).
 */
export function resolveNavKey(
  key: string,
  count: number,
  current: number,
  { orientation = "horizontal", loop = true, rtl = false }: NavKeyOptions = {},
): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const horizontal = orientation !== "vertical";
  const vertical = orientation !== "horizontal";
  let delta: number;
  if (
    (horizontal && key === (rtl ? "ArrowLeft" : "ArrowRight")) ||
    (vertical && key === "ArrowDown")
  ) {
    delta = 1;
  } else if (
    (horizontal && key === (rtl ? "ArrowRight" : "ArrowLeft")) ||
    (vertical && key === "ArrowUp")
  ) {
    delta = -1;
  } else {
    return null;
  }
  const target = current + delta;
  if (loop) return (target + count) % count;
  return clamp(target, 0, count - 1);
}

// Input types that don't consume arrow/Home/End/Space for text editing, so
// roving may still navigate away from them.
const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "radio", "submit", "reset", "image"]);

/** Whether the target is a text field that owns its own caret/typing keys. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return false;
}

/** Configuration for {@link roving}. */
export interface RovingOptions {
  /** Live list of navigable (enabled) items, in DOM order. */
  items: () => HTMLElement[];
  /** Arrow-key axis. Default `"horizontal"`. */
  orientation?: Orientation | undefined;
  /** Wrap past the ends. Default `true`. */
  loop?: boolean | undefined;
  /** Fired when focus moves to an item (e.g. radio selection follows focus). */
  onMove?: ((item: HTMLElement, index: number) => void) | undefined;
  /** Fired on Enter/Space on the focused item. */
  onActivate?: ((item: HTMLElement, index: number) => void) | undefined;
}

/** Handle returned by {@link roving}: re-assert the tab stop, move focus, or tear down. */
export interface Roving {
  /**
   * Re-assert the roving tab stop so exactly one item is tabbable. With an
   * `activeIndex` the stop moves there; with none it stays on whichever element
   * already held it — then on whichever item the DOM marks tabbable, and only
   * then on the first.
   */
  refresh(activeIndex?: number): void;
  /** Move focus (and the tab stop) to an item; index is clamped or wrapped. */
  focusItem(index: number): void;
  /**
   * Drop the keydown listener and the mutation observer. Call it from the
   * owner's `disconnectedCallback`: an observer left running on a detached
   * subtree keeps firing (and keeps the whole component reachable) for as long
   * as anything mutates it. A re-attached owner creates a fresh helper, which
   * adopts the tab stop already in the DOM — see {@link Roving.refresh}.
   */
  destroy(): void;
}

/** Attach roving-tabindex keyboard navigation to `container`. */
export function roving(container: HTMLElement, options: RovingOptions): Roving {
  const orientation = options.orientation ?? "horizontal";
  const loop = options.loop ?? true;
  /** The element that currently holds the tab stop, tracked across item changes. */
  let stop: HTMLElement | null = null;

  const apply = (items: HTMLElement[], index: number) => {
    const next = items[index] ?? null;
    // The previous stop may have left the navigable set while staying in the
    // DOM (disabled / aria-disabled / hidden); nothing else resets it, and a
    // stale 0 would leave the group with two tab stops.
    if (stop && stop !== next && stop.isConnected && !items.includes(stop)) stop.tabIndex = -1;
    items.forEach((el, i) => {
      el.tabIndex = i === index ? 0 : -1;
    });
    stop = next;
  };

  /**
   * Re-assert the tab stop. Called with an explicit index it moves the stop
   * there; called with none it *keeps* the stop on the element that already had
   * it. That distinction is the whole point: items are read live from the DOM,
   * so a group whose items are added, removed or enabled between refreshes
   * would otherwise snap the user back to the first item — or, when the
   * tabbable element is the one that was removed, leave no tabbable item at all
   * and drop the entire group out of the tab order.
   */
  const refresh = (activeIndex?: number) => {
    const items = options.items();
    if (items.length === 0) {
      stop = null;
      return;
    }
    if (activeIndex != null) {
      apply(items, clamp(activeIndex, 0, items.length - 1));
      return;
    }
    // With no tracked stop — a freshly created helper, e.g. after a component
    // was moved and re-attached — adopt whichever item the DOM already marks
    // tabbable before falling back to the first. The DOM is this module's
    // source of truth, so re-attaching must not silently walk the user's tab
    // stop back to the start of the group.
    const kept = stop ? items.indexOf(stop) : items.findIndex((el) => el.tabIndex === 0);
    apply(items, kept >= 0 ? kept : 0);
  };

  const focusItem = (index: number) => {
    const items = options.items();
    if (items.length === 0) return;
    let i = index;
    if (loop) i = (i + items.length) % items.length;
    else i = clamp(i, 0, items.length - 1);
    apply(items, i);
    const target = items[i];
    if (!target) return;
    target.focus();
    options.onMove?.(target, i);
  };

  const onKeydown = (e: KeyboardEvent) => {
    const items = options.items();
    if (items.length === 0) return;
    // Only navigate when focus is on one of the roving items. Keydowns bubbling
    // up from nested content (a link inside an open panel, a control's own
    // children) keep their native behavior.
    const active = document.activeElement;
    const current = active instanceof HTMLElement ? items.indexOf(active) : -1;
    const currentItem = items[current];
    if (!currentItem) return;
    // A focused text field owns its arrow/Home/End/Space keys for caret
    // movement and typing.
    if (isTextEntry(e.target)) return;
    // RTL is read per keydown so a runtime `dir` change is respected.
    const target = resolveNavKey(e.key, items.length, current, {
      orientation,
      loop,
      rtl: orientation !== "vertical" && isRTL(container),
    });
    if (target !== null) {
      e.preventDefault();
      focusItem(target);
    } else if (e.key === "Enter" || e.key === " ") {
      // Only intercept activation when the consumer handles it; otherwise let
      // the item's native action (button click, link navigation) proceed.
      if (!options.onActivate) return;
      // Suppress the default action (Space scrolls the page on non-button
      // custom-element items) before activating.
      e.preventDefault();
      options.onActivate(currentItem, current);
    }
  };

  container.addEventListener("keydown", onKeydown);

  // The item list is read live from the DOM, so nothing tells the group when a
  // tabbable item is removed or a `disabled` flips — and a group with no
  // tabbable item is unreachable by keyboard entirely. Watch for it rather than
  // making every caller remember to refresh. Only writes when the stop is
  // actually missing or duplicated; a no-arg `refresh` keeps it where it is.
  const observer =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          if (
            !stop?.isConnected ||
            options.items().filter((el) => el.tabIndex === 0).length !== 1
          ) {
            refresh();
          }
        });
  observer?.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "hidden"],
  });

  return {
    refresh,
    focusItem,
    destroy: () => {
      observer?.disconnect();
      container.removeEventListener("keydown", onKeydown);
    },
  };
}

/**
 * Compatibility base for roving composites. Its helper uses the same
 * connection lifetime as resources composed by form-associated elements.
 * Existing subclasses may attach it during initialize() to apply an initial tab stop.
 */
export abstract class RovingElement extends LightDomElement {
  #roving: Roving | null = null;

  /** Options for this composite's helper, read once when it is created. */
  protected abstract rovingOptions(): RovingOptions;

  /** The element the keydown listener attaches to. Defaults to the host. */
  protected get rovingContainer(): HTMLElement {
    return this;
  }

  /** The live helper, or `null` before {@link attachRoving} / after disconnect. */
  protected get roving(): Roving | null {
    return this.#roving;
  }

  /** Create the helper unless one already exists. Call it from `initialize`. */
  protected attachRoving(): void {
    this.#roving ??= roving(this.rovingContainer, this.rovingOptions());
  }

  protected override connectResources() {
    this.attachRoving();
    return () => {
      this.#roving?.destroy();
      this.#roving = null;
    };
  }
}
