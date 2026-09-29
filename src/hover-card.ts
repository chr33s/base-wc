/**
 * Hover-intent surface — the shared shape of `ui-tooltip` and
 * `ui-preview-card` (the same role `popover-field.ts` plays for the two
 * native-first fields).
 *
 * Both are "a trigger that reveals an anchored surface after a hover-intent
 * delay", and both spelled out the same forty-odd lines to say so: the `group` /
 * `delay` / `close-delay` / `skip-delay` attribute surface, the {@link
 * hoverIntent} construction, an `open` getter over the overlay, `Escape` to
 * dismiss, the delay-group cooldown bookkeeping ({@link openGroup} /
 * {@link closeGroup}), and a `disconnectedCallback` that cancels the pending
 * timer and closes. That drifted in practice — the two grew different spellings
 * of the same numeric-attribute read — which is the argument for one copy.
 *
 * What stays with the component is only what actually differs: which elements
 * it looks for, one-time ARIA preparation, which listeners open and close it
 * (a tooltip closes when the pointer leaves the trigger; a card stays open
 * while the pointer moves into it), and how the surface is anchored.
 */
import { closeGroup, type HoverIntent, hoverIntent, isGroupWarm, openGroup } from "./intent.ts";
import { LightDomElement } from "./lifecycle.ts";
import { numberAttribute } from "./math.ts";
import type { Overlay } from "./overlay.ts";
import type { ChangeReason } from "./reasons.ts";

export abstract class HoverCardElement extends LightDomElement {
  #overlay: Overlay | null = null;
  #intent: HoverIntent | null = null;

  get open() {
    return this.#overlay?.open ?? false;
  }

  /** Delay group this surface shares its warm-up with; `null` = ungrouped. */
  protected get group() {
    return this.getAttribute("group");
  }
  /** Hover dwell before opening, in ms. */
  protected get openDelay() {
    return numberAttribute(this, "delay", 600);
  }
  /** Grace period before closing once the pointer leaves, in ms. */
  protected get closeDelay() {
    return numberAttribute(this, "close-delay", 300);
  }
  /** How long the group stays warm after this closes, in ms. */
  protected get skipDelay() {
    return numberAttribute(this, "skip-delay", 300);
  }

  /** The intent timer, for the subclass's own listeners. */
  protected get intent() {
    return this.#intent;
  }

  /** `[trigger, surface]`, or `null` while either is still missing. */
  protected abstract parts(): readonly [HTMLElement, HTMLElement] | null;
  /** One-time ARIA setup (`ui-tooltip` points `aria-describedby` at its content). */
  protected prepare(_trigger: HTMLElement, _surface: HTMLElement) {}
  /** Attach the pointer/focus listeners that drive {@link intent}. */
  protected abstract listen(trigger: HTMLElement, surface: HTMLElement): void;
  /** Build the anchored overlay for the surface. */
  protected abstract createOverlay(trigger: HTMLElement, surface: HTMLElement): Overlay;

  protected override initialize() {
    const parts = this.parts();
    if (!parts) return false;
    const [trigger, surface] = parts;
    this.prepare(trigger, surface);
    this.#intent = hoverIntent({
      isOpen: () => this.open,
      open: () => this.show("trigger-hover"),
      close: () => this.hide("focus-out"),
      openDelay: () => this.openDelay,
      closeDelay: () => this.closeDelay,
      warm: () => isGroupWarm(this.group),
      // If the trigger mounts under a resting cursor, ignore opens until it leaves.
      armed: !trigger.matches(":hover"),
    });
    this.listen(trigger, surface);
    this.#overlay = this.createOverlay(trigger, surface);
    return true;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#intent?.cancel();
    this.hide();
  }

  /** Open the surface and warm the delay group. */
  protected show(reason: ChangeReason = "none") {
    if (!this.#overlay?.show(reason)) return;
    openGroup(this.group);
  }

  /** Close the surface and start the group's cooldown. */
  protected hide(reason: ChangeReason = "none") {
    if (!this.#overlay?.hide({ reason })) return;
    closeGroup(this.group, this.skipDelay);
  }

  /** `Escape` dismisses; share it with whatever elements should honour it. */
  protected onEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.hide("escape-key");
  };
}
