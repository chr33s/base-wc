/**
 * `ui-scroll-area` — a scroll container with custom, overlay scrollbars (Base
 * UI's Scroll Area). The native scrollbar is hidden by consumer CSS; this
 * element sizes and positions a `<ui-scroll-thumb>` from the viewport/content
 * ratio, keeps it in sync on scroll and resize (via `ResizeObserver`), lets you
 * drag the thumb to scroll (through the shared {@link trackPointerDrag}, so an
 * interrupted touch ends the drag too), and reflects overflow as
 * `data-overflow-x` / `data-overflow-y` so scrollbars can show only when needed.
 *
 * Two details borrowed from real scrollbars: pressing one never moves focus, and
 * scrolling past an end (WebKit's rubber band) shrinks the thumb against the
 * edge it is pinned to instead of letting it run off the track.
 *
 * Markup: a `<ui-scroll-viewport>` (the scroller) plus one or two
 * `<ui-scroll-scrollbar data-orientation="vertical|horizontal">` each wrapping a
 * `<ui-scroll-thumb>`.
 */
type Orientation = "vertical" | "horizontal";

import { isRTL } from "./direction.ts";
import { LightDomElement } from "./lifecycle.ts";
import { define } from "./define.ts";
import { clamp } from "./math.ts";
import { trackPointerDrag } from "./pointer-drag.ts";
import { scopedQuery } from "./query.ts";

/** Shortest a thumb may get, so it stays grabbable in a very long scroller. */
const MIN_THUMB_SIZE = 20;

export class UIScrollArea extends LightDomElement {
  #viewport: HTMLElement | null = null;
  #bars: HTMLElement[] = [];
  #observer: ResizeObserver | null = null;
  #disposeDrags: (() => void)[] = [];
  /** The viewport's authored `scroll-snap-type`, saved while a thumb drag runs. */
  #savedSnapType = "";
  /** Thumb drags in flight — the two thumbs can be held at once on touch. */
  #snapSuspended = 0;

  override connectedCallback() {
    if (this.wired) this.#observeResize();
    super.connectedCallback();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#observer?.disconnect();
    // End an in-flight thumb drag so its window listeners don't leak if the
    // element is removed mid-drag (pointerup would otherwise never fire). The
    // thumbs stay armed, so a re-inserted scroll area keeps working.
    for (const dispose of this.#disposeDrags) dispose();
  }

  // Child queries are scoped so a scroll area nested inside another's viewport
  // keeps ownership of its own viewport, scrollbars and thumbs — an unscoped
  // search would let the outer one drive the inner one's scroller.
  protected override initialize() {
    this.#viewport = scopedQuery<HTMLElement>(this, "ui-scroll-viewport")[0] ?? null;
    if (!this.#viewport) return false;
    this.#viewport.addEventListener("scroll", this.#update, { passive: true });

    this.#bars = scopedQuery<HTMLElement>(this, "ui-scroll-scrollbar");
    for (const bar of this.#bars) {
      const orientation: Orientation =
        bar.getAttribute("data-orientation") === "horizontal" ? "horizontal" : "vertical";
      bar.setAttribute("data-orientation", orientation);
      // Native scrollbars never move focus when pressed, whichever button was
      // used. Bound on the bar rather than the thumb so the bubbled press covers
      // both, and on `mousedown` because that is the event whose default action
      // is the focus shift.
      bar.addEventListener("mousedown", preventDefault);
      const thumb = scopedQuery<HTMLElement>(bar, "ui-scroll-thumb")[0];
      if (thumb) this.#armThumb(thumb, bar, orientation === "vertical");
    }

    if (typeof ResizeObserver !== "undefined") {
      this.#observer = new ResizeObserver(() => this.#update());
      this.#observeResize();
    }
    this.#update();
    return true;
  }

  #observeResize() {
    if (!this.#observer || !this.#viewport) return;
    this.#observer.observe(this.#viewport);
    if (this.#viewport.firstElementChild) this.#observer.observe(this.#viewport.firstElementChild);
  }

  /**
   * The shared thumb geometry for one scrollbar on the current axis: the thumb
   * length (with its 20px minimum), the track range it travels
   * (`trackLen - thumbLen`), and the viewport's scrollable range
   * (`contentLen - viewLen`). One copy, used by both the thumb placement in
   * `#update` and its inverse, the drag mapping in `#onThumbDown`.
   */
  #metrics(bar: HTMLElement, vertical: boolean) {
    const vp = this.#viewport!;
    const trackLen = vertical ? bar.clientHeight : bar.clientWidth;
    const contentLen = vertical ? vp.scrollHeight : vp.scrollWidth;
    const viewLen = vertical ? vp.clientHeight : vp.clientWidth;
    const thumbLen = Math.max(
      (contentLen > 0 ? viewLen / contentLen : 1) * trackLen,
      MIN_THUMB_SIZE,
    );
    return {
      thumbLen,
      dragRange: trackLen - thumbLen,
      maxScroll: contentLen - viewLen,
      contentLen,
    };
  }

  #update = () => {
    const vp = this.#viewport;
    if (!vp) return;
    const overflowY = vp.scrollHeight > vp.clientHeight + 1;
    const overflowX = vp.scrollWidth > vp.clientWidth + 1;
    this.toggleAttribute("data-overflow-y", overflowY);
    this.toggleAttribute("data-overflow-x", overflowX);

    for (const bar of this.#bars) {
      const vertical = bar.getAttribute("data-orientation") !== "horizontal";
      bar.toggleAttribute("hidden", !(vertical ? overflowY : overflowX));
      const thumb = bar.querySelector<HTMLElement>("ui-scroll-thumb");
      if (!thumb) continue;
      const { thumbLen, dragRange, maxScroll, contentLen } = this.#metrics(bar, vertical);
      // RTL scrolls from 0 down to `-maxScroll`. Measure from the inline start
      // edge so the overscroll arithmetic is direction-agnostic, then flip the
      // resulting offset back when placing the thumb.
      const rtl = !vertical && isRTL(this);
      const raw = vertical ? vp.scrollTop : vp.scrollLeft;
      const scroll = rtl ? -raw : raw;
      const { size, pos } = overscrollThumb(scroll, maxScroll, contentLen, thumbLen, dragRange);
      if (vertical) {
        thumb.style.height = `${size}px`;
        thumb.style.transform = `translateY(${Math.round(pos)}px)`;
      } else {
        thumb.style.width = `${size}px`;
        thumb.style.transform = `translateX(${Math.round(rtl ? -pos : pos)}px)`;
      }
    }
  };

  /**
   * Arm a thumb for drag-scrolling. Pointer travel maps to scroll through the
   * inverse of `#update`'s thumb placement — the thumb crosses `dragRange` to
   * cover `maxScroll` — sampled once per drag, at the press. The press / move /
   * release dance itself is {@link trackPointerDrag}, which also ends the drag
   * on the `pointercancel` a touch interrupted by a system gesture fires
   * instead of `pointerup`.
   */
  #armThumb(thumb: HTMLElement, bar: HTMLElement, vertical: boolean) {
    let start = 0;
    let startScroll = 0;
    let scale = 0; // scroll px per pointer px
    this.#disposeDrags.push(
      trackPointerDrag(thumb, {
        onStart: (e) => {
          const vp = this.#viewport;
          if (!vp) return false;
          e.preventDefault();
          start = vertical ? e.clientY : e.clientX;
          startScroll = vertical ? vp.scrollTop : vp.scrollLeft;
          const { dragRange, maxScroll } = this.#metrics(bar, vertical);
          scale = dragRange > 0 ? maxScroll / dragRange : 0;
          this.#suspendSnap();
        },
        onMove: (e) => {
          const vp = this.#viewport;
          if (!vp) return;
          const delta = ((vertical ? e.clientY : e.clientX) - start) * scale;
          if (vertical) vp.scrollTop = startScroll + delta;
          else vp.scrollLeft = startScroll + delta;
        },
        onEnd: () => this.#restoreSnap(),
      }),
    );
  }

  /**
   * CSS scroll snapping forces every programmatic scroll to land on a snap
   * point, so a thumb drag would jump between them instead of tracking the
   * pointer. Native scrollbars suppress snapping for the duration of a drag;
   * do the same, and re-snap on release by restoring the authored value.
   * Refcounted: each thumb has its own drag, so a second thumb grabbed
   * mid-drag must neither overwrite the saved value with the `none` we just
   * wrote nor, on the first release, re-snap under the drag still running.
   */
  #suspendSnap() {
    const vp = this.#viewport;
    if (!vp) return;
    if (this.#snapSuspended++ === 0) {
      this.#savedSnapType = vp.style.scrollSnapType;
      vp.style.scrollSnapType = "none";
    }
  }

  #restoreSnap() {
    if (this.#snapSuspended === 0) return;
    if (--this.#snapSuspended === 0 && this.#viewport) {
      this.#viewport.style.scrollSnapType = this.#savedSnapType;
    }
  }
}

function preventDefault(event: Event) {
  event.preventDefault();
}

/**
 * Thumb size and offset for one axis, including WebKit's rubber-band overscroll.
 *
 * Inside the scrollable range this is the plain proportional placement. Past
 * either end — where Safari lets `scrollTop`/`scrollLeft` run beyond the limits
 * — the thumb shrinks against the edge it is pinned to, damped by
 * `content / (content + overscroll)` so it eases rather than collapses, which is
 * the feedback a native overlay scrollbar gives. At the far end the offset is
 * pushed down by however much the thumb shrank, keeping it welded to the edge;
 * at the near end it simply stays at 0.
 */
function overscrollThumb(
  scroll: number,
  maxScroll: number,
  contentLen: number,
  thumbLen: number,
  dragRange: number,
) {
  const clamped = clamp(scroll, 0, Math.max(maxScroll, 0));
  const overscroll = scroll - clamped;
  const size = overscroll
    ? Math.max(MIN_THUMB_SIZE, (thumbLen * contentLen) / (contentLen + Math.abs(overscroll)))
    : thumbLen;
  const pos = maxScroll > 0 ? (clamped / maxScroll) * dragRange : 0;
  return { size, pos: pos + (overscroll > 0 ? thumbLen - size : 0) };
}

export class UIScrollViewport extends HTMLElement {}

/**
 * The scrollbar track and its thumb are pure pointer affordances — a screen
 * reader user scrolls the viewport with the caret or virtual cursor and never
 * needs them, so leaving them in the accessibility tree only adds two unlabeled
 * generic nodes per axis. Hide both; the viewport itself stays exposed.
 */
class DecorativeElement extends HTMLElement {
  connectedCallback() {
    this.setAttribute("aria-hidden", "true");
  }
}
export class UIScrollScrollbar extends DecorativeElement {}
export class UIScrollThumb extends DecorativeElement {}

define("ui-scroll-area", UIScrollArea);
define("ui-scroll-viewport", UIScrollViewport);
define("ui-scroll-scrollbar", UIScrollScrollbar);
define("ui-scroll-thumb", UIScrollThumb);

declare global {
  interface HTMLElementTagNameMap {
    "ui-scroll-area": UIScrollArea;
    "ui-scroll-viewport": UIScrollViewport;
    "ui-scroll-scrollbar": UIScrollScrollbar;
    "ui-scroll-thumb": UIScrollThumb;
  }
}
