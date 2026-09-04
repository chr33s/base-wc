/**
 * `ui-collapsible` — a single show/hide disclosure (Base UI's Collapsible). The
 * trigger carries `aria-expanded` + `aria-controls`; the content is hidden when
 * closed and exposes a `data-state` (`open` / `closed`) hook (on both the
 * content and the host) for height animation. Toggle via click, or drive the
 * `open` attribute directly.
 *
 * Markup: a `[data-collapsible-trigger]` and a `[data-collapsible-content]`.
 */
import { LightDomElement } from "./lifecycle.ts";
import { define } from "./define.ts";
import { nextId } from "./id.ts";

/**
 * Reflect one disclosure's open state onto its parts — `aria-expanded` on the
 * trigger, `data-state` (`open` / `closed`) on both the host and the content,
 * and the content's `hidden` flag. The one copy of the sync shared by
 * `ui-collapsible` and `ui-accordion`'s items.
 */
export function syncDisclosure(
  trigger: HTMLElement | null,
  content: HTMLElement | null,
  host: HTMLElement,
  open: boolean,
) {
  const state = open ? "open" : "closed";
  trigger?.setAttribute("aria-expanded", String(open));
  host.setAttribute("data-state", state);
  if (content) {
    content.toggleAttribute("hidden", !open);
    content.setAttribute("data-state", state);
  }
}

export class UICollapsible extends LightDomElement {
  static observedAttributes = ["open"];

  #trigger: HTMLElement | null = null;
  #content: HTMLElement | null = null;

  get open() {
    return this.hasAttribute("open");
  }
  set open(next: boolean) {
    this.toggleAttribute("open", next);
  }

  protected override wire() {
    this.#trigger = this.querySelector<HTMLElement>("[data-collapsible-trigger]");
    this.#content = this.querySelector<HTMLElement>("[data-collapsible-content]");
    if (!this.#trigger || !this.#content) return;
    this.wired = true;
    if (!this.#content.id) this.#content.id = nextId("ui-collapsible-content");
    this.#trigger.setAttribute("aria-controls", this.#content.id);
    this.#trigger.addEventListener("click", this.#toggle);
    this.#sync();
  }

  attributeChangedCallback() {
    if (this.wired) this.#sync();
  }

  #sync() {
    syncDisclosure(this.#trigger, this.#content, this, this.open);
  }

  #toggle = () => {
    this.open = !this.open;
    this.dispatchEvent(new CustomEvent("toggle", { bubbles: true, detail: { open: this.open } }));
  };
}

define("ui-collapsible", UICollapsible);

declare global {
  interface HTMLElementTagNameMap {
    "ui-collapsible": UICollapsible;
  }
}
