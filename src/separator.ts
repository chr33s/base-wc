/**
 * `ui-separator` — a semantic/visual divider (Base UI's Separator).
 *
 * `role=separator` with `aria-orientation` mirroring the `orientation`
 * attribute (`"horizontal"` — the default — or `"vertical"`). A purely
 * decorative rule can set the `decorative` attribute to drop itself from the
 * accessibility tree (`role=none`).
 *
 * One context overrides all of that: a `role="listbox"` (a select or combobox
 * popup) admits only `option` and `group` children, so a `separator` there is
 * an invalid child that can make the whole listbox unreadable. Inside one the
 * divider always demotes itself to `role="none"` — the visual rule stays, the
 * invalid semantics go.
 *
 * The demotion deliberately lives here rather than in the listbox owner. This
 * is a plain ARIA fact about being a listbox's child, not knowledge of
 * `ui-select`, and the child is the only party that learns about it for free:
 * it re-runs on connect, so a separator authored later, moved into a popup, or
 * rendered per route demotes itself with no owner involved. Pushing it up to
 * `ui-select` would buy nothing and cost every listbox — including a
 * third-party one — a `MutationObserver` to notice separators arriving.
 */
import { define } from "./define.ts";

/** Roles whose children are constrained to a fixed set excluding `separator`. */
const ROLE_CONSTRAINED = '[role="listbox"]';

export class UISeparator extends HTMLElement {
  static observedAttributes = ["orientation", "decorative"];

  connectedCallback() {
    this.#sync();
    // The listbox role belongs to an ancestor that assigns it during its own
    // deferred wiring, which is queued before this element even connects — so
    // re-read it once the microtask queue has drained rather than settling on
    // the answer from a half-built tree.
    queueMicrotask(() => {
      if (this.isConnected) this.#sync();
    });
  }

  attributeChangedCallback() {
    this.#sync();
  }

  #sync() {
    if (this.hasAttribute("decorative") || this.closest(ROLE_CONSTRAINED)) {
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

define("ui-separator", UISeparator);

declare global {
  interface HTMLElementTagNameMap {
    "ui-separator": UISeparator;
  }
}
