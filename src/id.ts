/**
 * Monotonic id generator shared by the UI primitives. Because these components
 * render in **light DOM** (no shadow root), their ids share the page's single
 * id namespace — so cross-referencing ARIA relationships
 * (`aria-controls`, `aria-activedescendant`, `aria-labelledby`) resolve against
 * elements the consumer owns. A per-document counter keeps every generated id
 * unique.
 */

let counter = 0;

/** Returns a document-unique id of the form `${prefix}-${n}`. */
export function nextId(prefix: string) {
  return `${prefix}-${++counter}`;
}

/**
 * Wire an ARIA cross-reference from a labelled part: ensure `part` has an id
 * (generated with `prefix` when missing) and point `attr` on `surface` at it.
 * No-op when the part is absent — the ritual behind every
 * `aria-labelledby`/`aria-describedby` in the library (dialog titles, popover
 * descriptions, toast headings, menu/select group labels).
 */
export function labelFrom(
  surface: Element,
  attr: "aria-labelledby" | "aria-describedby",
  part: Element | null,
  prefix: string,
) {
  if (!part) return;
  if (!part.id) part.id = nextId(prefix);
  surface.setAttribute(attr, part.id);
}
