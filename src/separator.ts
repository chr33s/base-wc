/**
 * `ui-separator` — a semantic/visual divider (Base UI's Separator).
 *
 * `role=separator` with `aria-orientation` mirroring the `orientation`
 * attribute (`"horizontal"` — the default — or `"vertical"`). A purely
 * decorative rule can set the `decorative` attribute to drop itself from the
 * accessibility tree (`role=none`).
 */
export class UISeparator extends HTMLElement {
  static observedAttributes = ["orientation", "decorative"];

  connectedCallback() {
    this.#sync();
  }

  attributeChangedCallback() {
    this.#sync();
  }

  #sync() {
    if (this.hasAttribute("decorative")) {
      this.setAttribute("role", "none");
      this.removeAttribute("aria-orientation");
      return;
    }
    this.setAttribute("role", "separator");
    this.setAttribute(
      "aria-orientation",
      this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal",
    );
  }
}

if (!customElements.get("ui-separator")) customElements.define("ui-separator", UISeparator);

declare global {
  interface HTMLElementTagNameMap {
    "ui-separator": UISeparator;
  }
}
