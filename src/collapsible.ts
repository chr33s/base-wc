/**
 * `ui-collapsible` — a single show/hide disclosure (Base UI's Collapsible). The
 * trigger carries `aria-expanded` + `aria-controls`; the content is hidden when
 * closed and exposes a `data-state` (`open` / `closed`) hook (on both the
 * content and the host) for height animation. Toggle via click, or drive the
 * `open` attribute directly.
 *
 * Markup: a `[data-collapsible-trigger]` and a `[data-collapsible-content]`.
 */
import { connectLightDom } from "./lifecycle.ts";
import { nextId } from "./id.ts";

export class UICollapsible extends HTMLElement {
  static observedAttributes = ["open"];

  #trigger: HTMLElement | null = null;
  #content: HTMLElement | null = null;
  #wired = false;

  get open(): boolean {
    return this.hasAttribute("open");
  }
  set open(next: boolean) {
    this.toggleAttribute("open", next);
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#trigger = this.querySelector<HTMLElement>("[data-collapsible-trigger]");
    this.#content = this.querySelector<HTMLElement>("[data-collapsible-content]");
    if (!this.#trigger || !this.#content) return;
    this.#wired = true;
    if (!this.#content.id) this.#content.id = nextId("ui-collapsible-content");
    this.#trigger.setAttribute("aria-controls", this.#content.id);
    this.#trigger.addEventListener("click", this.#toggle);
    this.#sync();
  }

  attributeChangedCallback() {
    if (this.#wired) this.#sync();
  }

  #sync() {
    this.#trigger?.setAttribute("aria-expanded", String(this.open));
    const state = this.open ? "open" : "closed";
    this.setAttribute("data-state", state);
    if (this.#content) {
      this.#content.toggleAttribute("hidden", !this.open);
      this.#content.setAttribute("data-state", state);
    }
  }

  #toggle = () => {
    this.open = !this.open;
    this.dispatchEvent(new CustomEvent("toggle", { bubbles: true, detail: { open: this.open } }));
  };
}

if (!customElements.get("ui-collapsible")) customElements.define("ui-collapsible", UICollapsible);

declare global {
  interface HTMLElementTagNameMap {
    "ui-collapsible": UICollapsible;
  }
}
