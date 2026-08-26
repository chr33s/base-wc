/**
 * Scoped light-DOM child queries. Because these components render in light DOM,
 * a bare `querySelectorAll` on a host also matches descendants of a **nested**
 * instance of the same component (an accordion inside an accordion panel, tabs
 * inside a tab panel) — so the outer component would wire, style, or hide the
 * inner one's parts. {@link scopedQuery} keeps only the elements whose nearest
 * same-tag ancestor is `host` itself, the same ownership rule
 * `adoptedControl` (native.ts) applies to authored native controls.
 */

/** The descendants of `host` matching `selector` that are not owned by a nested `host.localName` instance. */
export function scopedQuery<T extends Element = HTMLElement>(host: Element, selector: string) {
  return [...host.querySelectorAll<T>(selector)].filter(
    (el) => el.closest(host.localName) === host,
  );
}
