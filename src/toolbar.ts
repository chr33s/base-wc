/**
 * `ui-toolbar` — a composite toolbar (Base UI's Toolbar). `role="toolbar"` with
 * a single roving tab stop across its mixed controls (buttons, links, toggles,
 * inputs…), so the whole toolbar is one Tab stop and arrow keys move between
 * items. Activation stays with each control. Navigation is the shared
 * {@link roving} helper; `orientation` picks the arrow axis.
 */
import { define } from "./define.ts";
import { scopedQuery } from "./query.ts";
import { RovingElement, type RovingOptions } from "./roving.ts";

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

/** Custom element `ui-toolbar`: one roving tab stop across its mixed controls. */
export class UIToolbar extends RovingElement {
  /** Arrow-key axis from the `orientation` attribute. */
  get orientation(): "horizontal" | "vertical" {
    return this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
  }

  protected override initialize() {
    // Only wire once at least one item exists (disabled ones count — they still
    // prove the children are parsed), so a wiring pass that beats the parser
    // sees connectLightDom retry on the next light-DOM mutation instead of
    // silently claiming an empty host.
    if (scopedQuery(this, TOOLBAR_ITEMS).length === 0) return false;
    this.setAttribute("role", "toolbar");
    this.setAttribute("aria-orientation", this.orientation);
    this.attachRoving();
    this.roving?.refresh(0);
    return true;
  }

  protected override rovingOptions(): RovingOptions {
    return { items: () => this.#items(), orientation: this.orientation, loop: true };
  }

  // Stable membership regardless of the roving tab stop — do NOT filter on
  // tabindex here, or items parked at -1 would drop out of navigation. Scoped
  // so a nested ui-toolbar keeps ownership of its own controls.
  #items(): HTMLElement[] {
    return scopedQuery(this, TOOLBAR_ITEMS).filter(
      (el) => !el.hasAttribute("disabled") && !el.closest("[inert]"),
    );
  }
}

define("ui-toolbar", UIToolbar);

declare global {
  interface HTMLElementTagNameMap {
    "ui-toolbar": UIToolbar;
  }
}
