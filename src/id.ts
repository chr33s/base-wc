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
export function nextId(prefix: string): string {
  return `${prefix}-${++counter}`;
}
