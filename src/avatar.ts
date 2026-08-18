/**
 * `ui-avatar` — an image with a fallback (Base UI's Avatar). A small load/error
 * state machine reflected as `data-state` on the host (`loading` → `loaded`, or
 * `error` when the image fails / is absent) so the consumer can cross-fade the
 * `[data-avatar-image]` and `[data-avatar-fallback]` slots purely in CSS. A
 * `statechange` event fires on each transition.
 */
import { connectLightDom } from "./lifecycle.ts";

export type AvatarState = "loading" | "loaded" | "error";

export class UIAvatar extends HTMLElement {
  #wired = false;

  get state(): AvatarState {
    return (this.getAttribute("data-state") as AvatarState | null) ?? "loading";
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
    const img = this.querySelector<HTMLImageElement>("[data-avatar-image]");
    if (!img || !img.getAttribute("src")) {
      this.#setState("error");
      return;
    }
    // Fast-path an already-decoded image; otherwise wait for load/error. We do
    // NOT treat `complete && naturalWidth === 0` as an immediate error — that
    // state is ambiguous (some engines report `complete` before the fetch even
    // starts), so the `error` listener is the source of truth for failure.
    if (img.complete && img.naturalWidth > 0) {
      this.#setState("loaded");
      return;
    }
    this.#setState("loading");
    img.addEventListener("load", () => this.#setState("loaded"), { once: true });
    img.addEventListener("error", () => this.#setState("error"), { once: true });
  }

  #setState(state: AvatarState) {
    if (this.getAttribute("data-state") === state) return;
    this.setAttribute("data-state", state);
    this.dispatchEvent(new CustomEvent("statechange", { bubbles: true, detail: { state } }));
  }
}

if (!customElements.get("ui-avatar")) customElements.define("ui-avatar", UIAvatar);

declare global {
  interface HTMLElementTagNameMap {
    "ui-avatar": UIAvatar;
  }
}
