/**
 * Focus trap — the `inert` + focus-cycle half of the overlay infrastructure
 * (Base UI's internal focus management). A modal surface (Dialog, Alert Dialog,
 * Drawer) calls {@link trapFocus} on open: focus moves into the surface, `Tab`
 * and `Shift+Tab` cycle within it, and on release focus returns to whatever was
 * focused before. `aria-modal="true"` on the surface is what tells assistive
 * tech the rest of the page is inert; this trap enforces the same for the
 * keyboard.
 */

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable]:not([contenteditable='false'])",
].join(",");

/** Tabbable descendants of `root`, in DOM order, skipping hidden/inert ones. */
export function getFocusable(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      !el.hasAttribute("hidden") &&
      el.getAttribute("aria-hidden") !== "true" &&
      !el.closest("[inert]"),
  );
}

export interface FocusTrapOptions {
  /** Element to focus first; defaults to `[autofocus]`, then the first tabbable. */
  initialFocus?: HTMLElement | null;
}

// Active traps, oldest first. Only the topmost trap handles Tab, so stacked
// modal surfaces (a dialog opening a second dialog/drawer) don't fight over
// focus — the outer trap stays dormant until the inner one releases.
const trapStack: symbol[] = [];

/**
 * Trap keyboard focus inside `container`. Returns a release function that
 * detaches the trap and — unless called with `restoreFocus: false` — restores
 * focus to the previously-active element. The listener is always removed, so a
 * surface torn down while open (disconnect) must still call release to avoid
 * leaking the document-level capture handler.
 */
export function trapFocus(
  container: HTMLElement,
  options: FocusTrapOptions = {},
): (restoreFocus?: boolean) => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const token = Symbol("focus-trap");
  trapStack.push(token);

  const initial =
    options.initialFocus ??
    container.querySelector<HTMLElement>("[autofocus]") ??
    getFocusable(container)[0] ??
    container;
  initial.focus?.();

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    // Dormant while a newer trap sits above this one on the stack.
    if (trapStack[trapStack.length - 1] !== token) return;
    const focusable = getFocusable(container);
    if (focusable.length === 0) {
      e.preventDefault();
      container.focus?.();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (active && !container.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("keydown", onKeydown, true);
  return (restoreFocus = true) => {
    document.removeEventListener("keydown", onKeydown, true);
    const i = trapStack.lastIndexOf(token);
    if (i >= 0) trapStack.splice(i, 1);
    if (restoreFocus) previouslyFocused?.focus?.();
  };
}
