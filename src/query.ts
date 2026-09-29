/**
 * Scoped light-DOM child queries. Because these components render in light DOM,
 * a bare `querySelectorAll` on a host also matches descendants of a **nested**
 * instance of the same component (an accordion inside an accordion panel, tabs
 * inside a tab panel) — so the outer component would wire, style, or hide the
 * inner one's parts. These helpers keep only the elements whose nearest
 * same-tag ancestor is `host` itself.
 *
 * {@link isOwnedBy} is the single copy of that ownership rule. `native.ts`'s
 * `adoptedControl` (authored native controls) and `parts.ts`'s `ensureButton`
 * (adopted action buttons) are the same question asked of a different selector,
 * and both route through {@link scopedFirst}.
 */

/** Whether `el` belongs to `host` rather than to a nested `host.localName` instance. */
export function isOwnedBy(host: Element, el: Element): boolean {
  return el.closest(host.localName) === host;
}

/** The descendants of `host` matching `selector` that are not owned by a nested `host.localName` instance. */
export function scopedQuery<T extends Element = HTMLElement>(host: Element, selector: string): T[] {
  return [...host.querySelectorAll<T>(selector)].filter((el) => isOwnedBy(host, el));
}

/**
 * The first descendant of `host` matching `selector` that `host` owns, or
 * `null`. Short-circuits on the first match rather than materialising the whole
 * list the way `scopedQuery(...)[0]` would — the adoption paths run this on
 * every upgrade.
 */
export function scopedFirst<T extends Element = HTMLElement>(
  host: Element,
  selector: string,
): T | null {
  for (const el of host.querySelectorAll<T>(selector)) {
    if (isOwnedBy(host, el)) return el;
  }
  return null;
}

/**
 * The first descendant of `host` matching each selector, as a `[first, second]`
 * pair, or `null` unless both exist — the trigger + surface lookup shared by the
 * hover-card family.
 */
export function queryPair(
  host: Element,
  firstSelector: string,
  secondSelector: string,
): readonly [HTMLElement, HTMLElement] | null {
  const first = host.querySelector<HTMLElement>(firstSelector);
  const second = host.querySelector<HTMLElement>(secondSelector);
  return first && second ? [first, second] : null;
}
