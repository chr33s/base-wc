/**
 * Generated-part helpers. Several components carry an "adopt an authored
 * element, or generate a sensible default" affordance for a small action
 * button — chip remove, banner dismiss, search clear, the date/color field
 * triggers. {@link ensureButton} is the one copy of that dance: adoption is
 * scoped (a nested same-tag instance's button is never stolen), and a
 * generated button is a real `type="button"` with the marker attribute, an
 * `aria-label`, and an optional glyph. An authored element is returned as-is —
 * its label, content, and tag are the consumer's business.
 */
import { scopedFirst } from "./query.ts";

export interface EnsureButtonOptions {
  /** Marker attribute identifying the button; set on a generated one. */
  marker: string;
  /** `aria-label` for a generated button. */
  label: string;
  /** Text content (glyph) for a generated button. */
  text?: string;
  /** Extra attribute set only on a generated button (e.g. so it can be removed later). */
  generatedMarker?: string;
  /** Where a generated button is inserted; defaults to appending to `host`. */
  insert?: (button: HTMLButtonElement) => void;
}

/** Adopt the authored `[marker]` element owned by `host`, or generate a button. */
export function ensureButton(host: HTMLElement, options: EnsureButtonOptions) {
  const authored = scopedFirst<HTMLElement>(host, `[${options.marker}]`);
  if (authored) return authored;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(options.marker, "");
  if (options.generatedMarker) btn.setAttribute(options.generatedMarker, "");
  btn.setAttribute("aria-label", options.label);
  if (options.text) btn.textContent = options.text;
  if (options.insert) options.insert(btn);
  else host.append(btn);
  return btn;
}
