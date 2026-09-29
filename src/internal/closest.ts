/**
 * Nearest ancestor of an event's target (inclusive) matching `selector`, or
 * `null` when the target is not an element or nothing matches.
 */
export function closestFrom<T extends Element = Element>(event: Event, selector: string): T | null {
  const target = event.target;
  return target instanceof Element ? target.closest<T>(selector) : null;
}
