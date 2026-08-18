/**
 * Positioner primitive — the "Floating UI" slot of the Base UI → web-components
 * port.
 *
 * On browsers with native CSS Anchor Positioning (Safari/iOS 26+, Chrome 125+,
 * Firefox 132+) popups are placed entirely in CSS via the consumer's
 * `@supports (anchor-name: --a)` block and this module stays inert. Everywhere
 * else {@link anchor} is a small viewport-aware ponyfill standing in for
 * `@floating-ui/dom`: it prefers placing the floating element below the
 * reference, flips above when it will not fit, and clamps horizontally into the
 * viewport. It reads {@link window.visualViewport} so it stays correct on iOS
 * Safari, where the URL bar and pinch-zoom shift the layout viewport.
 */

/** True where CSS Anchor Positioning is natively supported. */
export const SUPPORTS_ANCHOR =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("anchor-name: --a");

/**
 * The minimal shape {@link anchor} needs from a reference — just its rect. A DOM
 * `Element` satisfies it, and so does a **virtual** reference (e.g. a pointer
 * position for a context menu, `{ getBoundingClientRect: () => rectAt(x, y) }`).
 */
export interface VirtualElement {
  getBoundingClientRect(): DOMRect;
}

export interface AnchorOptions {
  /** Gap between the reference and the floating element, in px. */
  offset?: number;
  /** Minimum distance kept from every viewport edge, in px. */
  padding?: number;
  /** Constrain the floating element to the available space and scroll overflow. */
  constrainHeight?: boolean;
  /**
   * Preferred side: `"bottom"` (menus/selects, flips above), `"right"` (LTR
   * submenus, flips left when it will not fit) or `"left"` (RTL submenus, flips
   * right). Default `"bottom"`.
   */
  placement?: "bottom" | "right" | "left";
  /**
   * A caret element to align to the reference's center along the floating
   * element's edge. Its cross-axis position is set inline and `data-side`
   * reflects which side of the reference the floating element landed on, so
   * consumer CSS can point it the right way.
   */
  arrow?: HTMLElement | null;
}

/** A DOMRect-like zero-size rect at a viewport point, for virtual anchoring. */
export function rectAt(x: number, y: number): DOMRect {
  return { x, y, top: y, left: x, right: x, bottom: y, width: 0, height: 0 } as DOMRect;
}

/**
 * Cross-axis offset (px) that centers an arrow of `arrowSize` on `refCenter`
 * along a floating element spanning `[floatStart, floatStart + floatSize]`,
 * clamped so the arrow stays `padding` inside both edges. Pure — unit-tested
 * independently of layout.
 */
export function arrowOffset(
  refCenter: number,
  floatStart: number,
  floatSize: number,
  arrowSize: number,
  padding: number,
): number {
  const ideal = refCenter - floatStart - arrowSize / 2;
  const max = Math.max(padding, floatSize - arrowSize - padding);
  return Math.max(padding, Math.min(ideal, max));
}

/**
 * Position `floating` against `reference` and keep it there while the page
 * scrolls or resizes. Call once when the popup opens; the returned function
 * detaches the listeners and must be called on close.
 */
export function anchor(
  reference: Element | VirtualElement,
  floating: HTMLElement,
  {
    offset = 6,
    padding = 8,
    constrainHeight = true,
    placement = "bottom",
    arrow,
  }: AnchorOptions = {},
): () => void {
  const vv = window.visualViewport;

  // Center a caret on the reference along the floating element's edge, marking
  // `data-side` so consumer CSS can point it toward the reference.
  const placeArrow = (
    side: "top" | "bottom" | "left" | "right",
    refCenter: number,
    start: number,
    size: number,
  ) => {
    if (!arrow) return;
    arrow.setAttribute("data-side", side);
    const cross = arrowOffset(
      refCenter,
      start,
      size,
      side === "top" || side === "bottom" ? arrow.offsetWidth : arrow.offsetHeight,
      padding,
    );
    if (side === "top" || side === "bottom") {
      arrow.style.left = `${Math.round(cross)}px`;
      arrow.style.top = "";
    } else {
      arrow.style.top = `${Math.round(cross)}px`;
      arrow.style.left = "";
    }
  };

  const update = () => {
    const r = reference.getBoundingClientRect();
    const fw = floating.offsetWidth;
    const fh = floating.offsetHeight;
    const vw = vv?.width ?? window.innerWidth;
    const vh = vv?.height ?? window.innerHeight;
    const vLeft = vv?.offsetLeft ?? 0;
    const vTop = vv?.offsetTop ?? 0;

    if (placement === "left" || placement === "right") {
      const leftRoom = r.left - vLeft - offset - padding;
      const rightRoom = vLeft + vw - r.right - offset - padding;
      // `left` prefers the left side (RTL submenu) and flips right; `right`
      // prefers the right side and flips left. No height constraint (list owns it).
      const goLeft =
        placement === "left"
          ? fw <= leftRoom || leftRoom >= rightRoom
          : !(fw <= rightRoom || rightRoom >= r.left - vLeft);
      const left = goLeft ? r.left - offset - fw : r.right + offset;
      const top = Math.min(Math.max(r.top, vTop + padding), vTop + vh - fh - padding);
      const finalLeft = Math.max(left, vLeft + padding);
      const finalTop = Math.max(top, vTop + padding);
      floating.style.left = `${Math.round(finalLeft)}px`;
      floating.style.top = `${Math.round(finalTop)}px`;
      placeArrow(goLeft ? "left" : "right", (r.top + r.bottom) / 2, finalTop, fh);
      return;
    }

    const below = vh + vTop - r.bottom - offset - padding;
    const above = r.top - vTop - offset - padding;

    let top: number;
    let maxH: number;
    let placedBelow: boolean;
    if (fh <= below || below >= above) {
      top = r.bottom + offset;
      maxH = below;
      placedBelow = true;
    } else {
      maxH = above;
      top = r.top - offset - Math.min(fh, above);
      placedBelow = false;
    }

    const left = Math.min(Math.max(r.left, vLeft + padding), vLeft + vw - fw - padding);
    floating.style.left = `${Math.round(left)}px`;
    floating.style.top = `${Math.round(Math.max(top, vTop + padding))}px`;
    if (constrainHeight) {
      floating.style.maxHeight = `${Math.round(Math.max(maxH, 96))}px`;
      floating.style.overflowY = "auto";
    }
    placeArrow(placedBelow ? "bottom" : "top", (r.left + r.right) / 2, left, fw);
  };

  // Coalesce reposition work to one run per frame: scroll/resize can fire many
  // times per frame (nested scrollers, iOS visualViewport), and each update()
  // reads layout after the previous one wrote styles — running it per event
  // forces a synchronous reflow every time. The first placement stays
  // synchronous so the popup is positioned before it paints.
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
  const caf = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null;
  let frame = 0;
  const schedule = raf
    ? () => {
        if (frame) return;
        frame = raf(() => {
          frame = 0;
          update();
        });
      }
    : update;

  update();
  const opts: AddEventListenerOptions = { passive: true, capture: true };
  window.addEventListener("scroll", schedule, opts);
  window.addEventListener("resize", schedule);
  vv?.addEventListener("resize", schedule);
  vv?.addEventListener("scroll", schedule);

  return () => {
    if (frame && caf) caf(frame);
    window.removeEventListener("scroll", schedule, opts);
    window.removeEventListener("resize", schedule);
    vv?.removeEventListener("resize", schedule);
    vv?.removeEventListener("scroll", schedule);
  };
}
