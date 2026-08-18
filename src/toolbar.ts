/**
 * `ui-toolbar` — a composite toolbar (Base UI's Toolbar). `role="toolbar"` with
 * a single roving tab stop across its mixed controls (buttons, links, toggles,
 * inputs…), so the whole toolbar is one Tab stop and arrow keys move between
 * items. Activation stays with each control. Navigation is the shared
 * {@link roving} helper; `orientation` picks the arrow axis.
 */
import { connectLightDom } from "./lifecycle.ts";
import { roving, type Roving } from "./roving.ts";

// `ui-switch` / `ui-checkbox` are not listed: they enhance a native checkbox,
// so their inner `input` is the real focus target (already matched below).
const TOOLBAR_ITEMS = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "ui-toggle",
  "[data-toolbar-item]",
].join(",");

export class UIToolbar extends HTMLElement {
  #roving: Roving | null = null;
  #wired = false;

  get orientation(): "horizontal" | "vertical" {
    return this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#wired = true;
    this.setAttribute("role", "toolbar");
    this.setAttribute("aria-orientation", this.orientation);
    this.#roving = roving(this, {
      items: () => this.#items(),
      orientation: this.orientation,
      loop: true,
    });
    this.#roving.refresh(0);
  }

  // Stable membership regardless of the roving tab stop — do NOT filter on
  // tabindex here, or items parked at -1 would drop out of navigation.
  #items(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>(TOOLBAR_ITEMS)].filter(
      (el) => !el.hasAttribute("disabled") && !el.closest("[inert]"),
    );
  }
}

if (!customElements.get("ui-toolbar")) customElements.define("ui-toolbar", UIToolbar);

declare global {
  interface HTMLElementTagNameMap {
    "ui-toolbar": UIToolbar;
  }
}
