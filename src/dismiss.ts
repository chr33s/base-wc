/**
 * Dismissal primitive — light-dismiss for every popup in the library.
 *
 * Listens for a pointer press anywhere outside the given elements, in the
 * **capture** phase so it runs before the press can be swallowed by other
 * handlers, and invokes `onDismiss`. The event's composed path is checked so a
 * press inside a top-layer popover (or any shadow tree) still counts as
 * "inside". A press inside any layer marked `[data-dismiss-ignore]` (a
 * transient surface that floats above popups but must not dismiss them, e.g. a
 * toast viewport) is likewise treated as inside. Returns a cleanup function to
 * detach the listener on close.
 */
export function onOutsidePress(
  inside: ReadonlyArray<Element | null | undefined>,
  onDismiss: (event: PointerEvent) => void,
): () => void {
  const handler = (event: PointerEvent) => {
    const path = event.composedPath();
    if (inside.some((el) => el != null && path.includes(el))) return;
    if (path.some((n) => n instanceof Element && n.hasAttribute("data-dismiss-ignore"))) return;
    onDismiss(event);
  };
  document.addEventListener("pointerdown", handler, true);
  return () => document.removeEventListener("pointerdown", handler, true);
}
