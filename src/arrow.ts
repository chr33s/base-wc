/**
 * `ui-arrow` — a caret that points a popup back at its anchor (Base UI's Arrow).
 * Decorative (`aria-hidden`), it is positioned by {@link anchor} in the JS
 * fallback: its cross-axis offset is centered on the reference and clamped to
 * the popup edge, and `data-side` reflects which side of the reference the popup
 * landed on so consumer CSS can rotate/place it. On browsers with native CSS
 * anchor positioning the consumer positions it in CSS (e.g. `anchor-center`).
 *
 * Markup: place `<ui-arrow>` inside any anchored popup (`ui-popover-popup`,
 * `ui-tooltip-content`, …).
 */
export class UIArrow extends HTMLElement {
  connectedCallback() {
    this.setAttribute("aria-hidden", "true");
    if (!this.hasAttribute("data-side")) this.setAttribute("data-side", "bottom");
  }
}

if (!customElements.get("ui-arrow")) customElements.define("ui-arrow", UIArrow);

declare global {
  interface HTMLElementTagNameMap {
    "ui-arrow": UIArrow;
  }
}
