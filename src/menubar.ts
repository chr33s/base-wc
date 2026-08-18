/**
 * `ui-menubar` — a horizontal bar of `ui-menu`s (Base UI's Menubar). Builds on
 * Menu: `role="menubar"`, one roving tab stop across the menu triggers, and
 * shared open state — once a menu is open, `ArrowLeft`/`ArrowRight` (and hover)
 * move to the adjacent menu and open it. Down/Up opening and in-menu navigation
 * stay with each `ui-menu`; a focused submenu trigger consumes its open key
 * (`ui-menu` stops its propagation), so it never reaches the bar.
 *
 * Markup: `<ui-menubar>` wrapping sibling `<ui-menu>`s, each with its own
 * `[data-menu-trigger]` + `<ui-menu-popup>`.
 */
import { connectLightDom } from "./lifecycle.ts";
import { isRTL } from "./direction.ts";
import type { UIMenu } from "./menu.ts";
import { roving, type Roving } from "./roving.ts";

export class UIMenubar extends HTMLElement {
  #wired = false;
  #roving: Roving | null = null;

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#wired = true;
    this.setAttribute("role", "menubar");
    // Closed-state trigger navigation (arrows, Home/End, RTL flip, wrap and the
    // single tab stop) is the shared roving helper. onMove fires as focus lands
    // on a trigger: when a menu is already open, browsing to a sibling opens it.
    this.#roving = roving(this, {
      items: () => this.#triggers(),
      orientation: "horizontal",
      loop: true,
      onMove: (_item, i) => {
        if (this.#menus().some((m) => m.open)) this.#openOnly(i);
      },
    });
    this.#roving.refresh(0);
    for (const trigger of this.#triggers()) {
      trigger.addEventListener("pointerenter", () => {
        const i = this.#triggers().indexOf(trigger);
        if (i >= 0 && this.#menus().some((m) => m.open)) this.#openOnly(i);
      });
    }
    this.addEventListener("keydown", this.#onPopupCrossKeydown);
    // A ui-menu's `open` event bubbles here; move the tab stop to follow it.
    this.addEventListener("open", this.#onMenuOpen);
  }

  #menus(): UIMenu[] {
    return [...this.querySelectorAll<UIMenu>(":scope > ui-menu")];
  }
  #triggers(): HTMLElement[] {
    return this.#menus()
      .map((m) => m.querySelector<HTMLElement>("[data-menu-trigger]"))
      .filter((el): el is HTMLElement => el != null);
  }

  #onMenuOpen = (e: Event) => {
    const menu = (e.target as Element)?.closest?.("ui-menu") as UIMenu | null;
    const idx = menu ? this.#menus().indexOf(menu) : -1;
    if (idx >= 0) this.#roving?.refresh(idx);
  };

  // Open-state cross-navigation: an ArrowLeft/ArrowRight bubbling from inside an
  // open menu's popup (focus is on a menu item, not a trigger, so roving ignores
  // it) closes the open menu and opens the adjacent one. A focused submenu
  // trigger stops propagation of its open key, so anything reaching here is
  // genuinely meant to cross menus.
  #onPopupCrossKeydown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const menus = this.#menus();
    const openIdx = menus.findIndex((m) => m.open);
    if (openIdx < 0) return; // closed — roving owns trigger navigation
    if (this.#triggers().includes(document.activeElement as HTMLElement)) return; // roving's job
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === (isRTL(this) ? "ArrowLeft" : "ArrowRight") ? 1 : -1;
    this.#openOnly((openIdx + dir + menus.length) % menus.length);
  };

  #openOnly(i: number) {
    const menus = this.#menus();
    menus.forEach((m, idx) => {
      if (idx !== i && m.open) m.hide();
    });
    this.#roving?.refresh(i);
    this.#triggers()[i]?.focus();
    menus[i]?.show();
    menus[i]?.focusFirst();
  }
}

if (!customElements.get("ui-menubar")) customElements.define("ui-menubar", UIMenubar);

declare global {
  interface HTMLElementTagNameMap {
    "ui-menubar": UIMenubar;
  }
}
