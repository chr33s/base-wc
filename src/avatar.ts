/**
 * `ui-avatar` — an image with a fallback (Base UI's Avatar). A small load/error
 * state machine reflected as `data-state` on the host (`loading` → `loaded`, or
 * `error` when the image fails / is absent) so the consumer can cross-fade the
 * `[data-avatar-image]` and `[data-avatar-fallback]` slots purely in CSS. A
 * `statechange` event fires on each transition.
 */
import { LightDomElement } from "./lifecycle.ts";
import { define } from "./define.ts";

export type AvatarState = "loading" | "loaded" | "error";

export class UIAvatar extends LightDomElement {
  get state() {
    return (this.getAttribute("data-state") as AvatarState | null) ?? "loading";
  }

  protected override initialize() {
    // Only wire once one of the authored slots exists, so a wiring pass that
    // beats the parser sees connectLightDom retry on the next light-DOM
    // mutation instead of settling on `error` against an empty host.
    if (!this.querySelector("[data-avatar-image], [data-avatar-fallback]")) return false;
    const img = this.querySelector<HTMLImageElement>("[data-avatar-image]");
    if (!img || !img.getAttribute("src")) {
      this.#setState("error");
      return true;
    }
    // Fast-path an already-decoded image; otherwise wait for load/error. We do
    // NOT treat `complete && naturalWidth === 0` as an immediate error — that
    // state is ambiguous (some engines report `complete` before the fetch even
    // starts), so the `error` listener is the source of truth for failure.
    if (img.complete && img.naturalWidth > 0) {
      this.#setState("loaded");
      return true;
    }
    this.#setState("loading");
    img.addEventListener("load", () => this.#setState("loaded"), { once: true });
    img.addEventListener("error", () => this.#setState("error"), { once: true });
    return true;
  }

  #setState(state: AvatarState) {
    if (this.getAttribute("data-state") === state) return;
    this.setAttribute("data-state", state);
    this.dispatchEvent(new CustomEvent("statechange", { bubbles: true, detail: { state } }));
  }
}

define("ui-avatar", UIAvatar);

declare global {
  interface HTMLElementTagNameMap {
    "ui-avatar": UIAvatar;
  }
}
