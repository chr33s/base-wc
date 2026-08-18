/**
 * `ui-banner` — a persistent, inline status message (the non-transient sibling of
 * `ui-toast`). Unlike a toast it lives in normal document flow, never auto-
 * dismisses, and stays until the user closes it.
 *
 * It announces itself from `data-type`: `error`/`warning` become `role="alert"`
 * (`aria-live=assertive`), everything else `role="status"` (`polite`), and it is
 * labelled/described from `[data-banner-title]` / `[data-banner-description]`.
 * Add `dismissible` to adopt (or generate) a `[data-banner-dismiss]` button whose
 * click fires a bubbling `dismiss` event, plays the `[data-state]` exit animation
 * (via {@link runExit}), and removes the host.
 */
import { nextId } from "./id.ts";
import { connectLightDom } from "./lifecycle.ts";
import { runExit, setOpenState } from "./transitions.ts";

export class UIBanner extends HTMLElement {
  #wired = false;

  get dismissible(): boolean {
    return this.hasAttribute("dismissible");
  }

  connectedCallback() {
    const assertive = this.dataset.type === "error" || this.dataset.type === "warning";
    if (!this.getAttribute("role")) this.setAttribute("role", assertive ? "alert" : "status");
    if (!this.hasAttribute("aria-live")) {
      this.setAttribute("aria-live", assertive ? "assertive" : "polite");
    }
    this.setAttribute("data-open", "");
    setOpenState(this, true);
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#wired = true;
    const title = this.querySelector("[data-banner-title]");
    if (title) {
      if (!title.id) title.id = nextId("ui-banner-title");
      this.setAttribute("aria-labelledby", title.id);
    }
    const description = this.querySelector("[data-banner-description]");
    if (description) {
      if (!description.id) description.id = nextId("ui-banner-description");
      this.setAttribute("aria-describedby", description.id);
    }

    if (this.dismissible) {
      let btn = this.querySelector<HTMLElement>("[data-banner-dismiss]");
      if (!btn) {
        btn = document.createElement("button");
        (btn as HTMLButtonElement).type = "button";
        btn.setAttribute("data-banner-dismiss", "");
        btn.setAttribute("aria-label", "Dismiss");
        btn.textContent = "✕";
        this.append(btn);
      }
      btn.addEventListener("click", () => this.close());
    }
  }

  /** Dismiss the banner, playing its exit animation before removal. */
  close() {
    if (!this.hasAttribute("data-open")) return;
    this.removeAttribute("data-open");
    this.dispatchEvent(new CustomEvent("dismiss", { bubbles: true }));
    runExit(this, () => this.remove());
  }
}

if (!customElements.get("ui-banner")) customElements.define("ui-banner", UIBanner);

declare global {
  interface HTMLElementTagNameMap {
    "ui-banner": UIBanner;
  }
}
