/**
 * `ui-menubar` — a bar of `ui-menu`s (Base UI's Menubar). Builds on Menu:
 * `role="menubar"`, one roving tab stop across the menu triggers, and shared
 * open state — once a menu is open, the arrows along the bar's own axis (and
 * hover) move to the adjacent menu and open it. The cross-axis keys and in-menu
 * navigation stay with each `ui-menu`; a focused submenu trigger consumes its
 * open key (`ui-menu` stops its propagation), so it never reaches the bar.
 *
 * `orientation="vertical"` lays the bar out down the page instead, swapping
 * which arrows cross between menus.
 *
 * Markup: `<ui-menubar>` wrapping sibling `<ui-menu>`s, each with its own
 * `[data-menu-trigger]` + `<ui-menu-popup>`.
 */
import { define } from "./define.ts";
import { isRTL } from "./direction.ts";
import type { UIMenu } from "./menu.ts";
import { RovingElement, isDisabled, type Orientation, type RovingOptions } from "./roving.ts";

export class UIMenubar extends RovingElement {
  /**
   * The axis the bar lays out on. Unlike a menu or listbox this is always
   * announced: `menubar` has no orientation default an author can rely on, so
   * leaving it off makes a vertical bar indistinguishable from a horizontal one.
   */
  get orientation(): Orientation {
    return this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
  }

  protected override initialize() {
    this.setAttribute("role", "menubar");
    this.setAttribute("aria-orientation", this.orientation);
    // `menubar` constrains its children to menuitem/menuitemcheckbox/
    // menuitemradio/group, and a bare `<ui-menu>` wrapper carries no role at
    // all — so without this the bar's required-children contract is violated
    // and screen readers can refuse to treat it as a menubar. Each wrapper
    // becomes a `group` (an allowed child that may in turn contain a menuitem
    // *and* the popup's `role="menu"`), and each trigger the `menuitem` the bar
    // is actually looking for.
    for (const { menu, trigger } of this.#entries()) {
      menu.setAttribute("role", "group");
      trigger.setAttribute("role", "menuitem");
    }
    // Closed-state trigger navigation (arrows, Home/End, RTL flip, wrap and the
    // single tab stop) is the shared roving helper. onMove fires as focus lands
    // on a trigger: when a menu is already open, browsing to a sibling opens it.
    this.attachRoving();
    this.roving?.refresh(0);
    for (const { trigger } of this.#entries()) {
      trigger.addEventListener("pointerenter", () => {
        if (this.#anyOpen()) this.#openOnly(this.#indexOfTrigger(trigger));
      });
    }
    this.addEventListener("keydown", this.#onPopupCrossKeydown);
    // A ui-menu's `open` event bubbles here; move the tab stop to follow it.
    this.addEventListener("open", this.#onMenuOpen);
    return true;
  }

  protected override rovingOptions(): RovingOptions {
    return {
      items: () => this.#triggers(),
      orientation: this.orientation,
      loop: true,
      // `i` indexes the *enabled* triggers roving navigates; #openOnly indexes
      // entries. Resolve through the element rather than reusing the number.
      onMove: (item) => {
        if (this.#anyOpen()) this.#openOnly(this.#indexOfTrigger(item));
      },
    };
  }

  /**
   * The bar's menus paired with their triggers, in DOM order. A menu without a
   * trigger cannot participate at all, and dropping it here — rather than
   * letting two separately-filtered lists drift — is what keeps every index in
   * this file addressing the same thing.
   */
  #entries() {
    return [...this.querySelectorAll<UIMenu>(":scope > ui-menu")].flatMap((menu) => {
      const trigger = menu.querySelector<HTMLElement>("[data-menu-trigger]");
      return trigger ? [{ menu, trigger }] : [];
    });
  }
  /**
   * An entry the keyboard may land on: neither its trigger nor its menu is
   * disabled. Every navigation path — roving, open-state crossing, hover — goes
   * through this one predicate, so a disabled entry is skipped consistently
   * instead of opening from one path and dead-ending from another.
   */
  #enabled(entry: { menu: UIMenu; trigger: HTMLElement }) {
    return !isDisabled(entry.trigger) && !isDisabled(entry.menu);
  }
  /** Roving items: enabled triggers only — a disabled one is not a tab stop. */
  #triggers() {
    return this.#entries()
      .filter((e) => this.#enabled(e))
      .map((e) => e.trigger);
  }
  #indexOfTrigger(trigger: HTMLElement) {
    return this.#entries().findIndex((e) => e.trigger === trigger);
  }
  #anyOpen() {
    return this.#entries().some((e) => e.menu.open);
  }
  /** Move the roving tab stop onto the trigger at `entryIndex`, if it is one. */
  #focusStop(entryIndex: number) {
    const trigger = this.#entries()[entryIndex]?.trigger;
    if (!trigger) return;
    const i = this.#triggers().indexOf(trigger);
    if (i >= 0) this.roving?.refresh(i);
  }

  #onMenuOpen = (e: Event) => {
    const menu = (e.target as Element)?.closest?.("ui-menu") as UIMenu | null;
    const idx = menu ? this.#entries().findIndex((entry) => entry.menu === menu) : -1;
    if (idx >= 0) this.#focusStop(idx);
  };

  // Open-state cross-navigation: an ArrowLeft/ArrowRight bubbling from inside an
  // open menu's popup (focus is on a menu item, not a trigger, so roving ignores
  // it) closes the open menu and opens the adjacent one. A focused submenu
  // trigger stops propagation of its open key, so anything reaching here is
  // genuinely meant to cross menus.
  #onPopupCrossKeydown = (e: KeyboardEvent) => {
    // Cross along the bar's own axis; the other axis belongs to the open menu.
    const vertical = this.orientation === "vertical";
    const [next, previous] = vertical
      ? (["ArrowDown", "ArrowUp"] as const)
      : isRTL(this)
        ? (["ArrowLeft", "ArrowRight"] as const)
        : (["ArrowRight", "ArrowLeft"] as const);
    if (e.key !== next && e.key !== previous) return;
    const entries = this.#entries();
    const openIdx = entries.findIndex((entry) => entry.menu.open);
    if (openIdx < 0) return; // closed — roving owns trigger navigation
    if (this.#triggers().includes(document.activeElement as HTMLElement)) return; // roving's job
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === next ? 1 : -1;
    // Step past disabled entries — roving skips them in the closed state, and
    // landing on one here would close every menu and strand focus.
    for (let step = 1; step < entries.length; step++) {
      const i = (openIdx + dir * step + entries.length) % entries.length;
      const entry = entries[i];
      if (entry && this.#enabled(entry)) {
        this.#openOnly(i);
        return;
      }
    }
  };

  #openOnly(i: number) {
    if (i < 0) return;
    const entries = this.#entries();
    const target = entries[i];
    if (!target || !this.#enabled(target)) return;
    entries.forEach(({ menu }, idx) => {
      if (idx !== i && menu.open) menu.hide("sibling-open");
    });
    this.#focusStop(i);
    target.trigger.focus();
    target.menu.show("sibling-open");
    target.menu.focusFirst();
  }
}

define("ui-menubar", UIMenubar);

declare global {
  interface HTMLElementTagNameMap {
    "ui-menubar": UIMenubar;
  }
}
