/**
 * `ui-context-menu` — a menu opened at the pointer (Base UI's Context Menu).
 * Reuses `ui-menu` via its `openAt(x, y)` virtual-point anchor: right-click (or
 * a touch long-press) on the target opens the inner menu at the cursor. The
 * inner `<ui-menu>` needs no trigger; dismissal, roving and selection are the
 * menu's own.
 *
 * Markup: `<ui-context-menu>` wrapping a `[data-context-target]` region and a
 * triggerless `<ui-menu>` (just its `<ui-menu-popup>` of items).
 */
import { connectLightDom } from "./lifecycle.ts";
import type { UIMenu } from "./menu.ts";

export class UIContextMenu extends HTMLElement {
  #wired = false;
  #menu: UIMenu | null = null;
  #target: HTMLElement | null = null;
  #pressTimer = 0;

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#menu = this.querySelector<UIMenu>("ui-menu");
    this.#target = this.querySelector<HTMLElement>("[data-context-target]") ?? this;
    if (!this.#menu) return;
    this.#wired = true;
    this.#target.addEventListener("contextmenu", this.#onContextMenu);
    this.#target.addEventListener("pointerdown", this.#onPointerDown);
    this.#target.addEventListener("pointerup", this.#cancelPress);
    this.#target.addEventListener("pointermove", this.#cancelPress);
    this.#target.addEventListener("pointercancel", this.#cancelPress);
  }

  #onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    this.#menu?.openAt(e.clientX, e.clientY);
  };

  // Touch long-press → open at the press point.
  #onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const { clientX, clientY } = e;
    this.#pressTimer = window.setTimeout(() => this.#menu?.openAt(clientX, clientY), 500);
  };
  #cancelPress = () => clearTimeout(this.#pressTimer);
}

if (!customElements.get("ui-context-menu")) customElements.define("ui-context-menu", UIContextMenu);

declare global {
  interface HTMLElementTagNameMap {
    "ui-context-menu": UIContextMenu;
  }
}
