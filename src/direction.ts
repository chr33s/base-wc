/**
 * Direction helper — reads the effective text direction of an element so
 * composites can flip horizontal arrow-key semantics (and side positioning)
 * under RTL. Prefers the nearest `[dir]` attribute, falling back to the computed
 * `direction` style.
 */
export function isRTL(el: Element): boolean {
  const dir = el.closest("[dir]")?.getAttribute("dir");
  if (dir) return dir.toLowerCase() === "rtl";
  return typeof getComputedStyle === "function" && getComputedStyle(el).direction === "rtl";
}
