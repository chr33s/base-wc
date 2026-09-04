/**
 * The top-layer popup shell — the base for every `ui-*-popup` /
 * `ui-*-content` element.
 *
 * Nine of these elements exist only to announce themselves on connect:
 * `popover="manual"` (so the Popover API lifts them into the top layer while
 * {@link overlay} keeps control of dismissal), an ARIA role, and — where the
 * surface is a programmatic focus target rather than a labelled region — a
 * `tabindex="-1"`. They each hand-wrote that `connectedCallback`. The base
 * spells it once and reads the per-element differences off two statics, so a
 * shell that needs nothing beyond the defaults is an empty subclass.
 *
 * The two statics are read through `this.constructor`, so they inherit: a
 * subclass overrides only what differs, and an element with more to do (a
 * modal's `aria-modal`, `ui-chart-tooltip`'s container registration) calls
 * `super.connectedCallback()` and adds to it.
 */

export class UIPopupElement extends HTMLElement {
  /** ARIA role announced on connect; `null` leaves the role to the consumer. */
  static role: string | null = null;
  /**
   * Whether the surface itself is a programmatic focus target. Modal and
   * menu-shaped popups take focus when they open (so the focus trap and the
   * roving items have somewhere to land); labelled regions — a listbox, a
   * tooltip, a preview card — never do.
   */
  static focusable = false;

  connectedCallback() {
    const ctor = this.constructor as typeof UIPopupElement;
    this.setAttribute("popover", "manual");
    if (ctor.role) this.setAttribute("role", ctor.role);
    if (ctor.focusable) this.tabIndex = -1;
  }
}

/**
 * A **modal** popup surface: `role="dialog"`, `aria-modal`, and focusable so
 * the focus trap has somewhere to land. `ui-dialog-popup` and `ui-drawer-popup`
 * are both exactly this — the drawer used to apply the same four attributes
 * imperatively from its own `wire`, which meant they landed later than the
 * dialog's and had to be kept in step by hand.
 */
export class UIModalPopupElement extends UIPopupElement {
  static override role = "dialog";
  static override focusable = true;

  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute("aria-modal", "true");
  }
}
