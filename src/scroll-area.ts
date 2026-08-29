/**
 * `ui-scroll-area` — a scroll container with custom, overlay scrollbars (Base
 * UI's Scroll Area). The native scrollbar is hidden by consumer CSS; this
 * element sizes and positions a `<ui-scroll-thumb>` from the viewport/content
 * ratio, keeps it in sync on scroll and resize (via `ResizeObserver`), lets you
 * drag the thumb to scroll (through the shared {@link trackPointerDrag}, so an
 * interrupted touch ends the drag too), and reflects overflow as
 * `data-overflow-x` / `data-overflow-y` so scrollbars can show only when needed.
 *
 * Markup: a `<ui-scroll-viewport>` (the scroller) plus one or two
 * `<ui-scroll-scrollbar data-orientation="vertical|horizontal">` each wrapping a
 * `<ui-scroll-thumb>`.
 */
type Orientation = "vertical" | "horizontal";

import { connectLightDom } from "./lifecycle.ts";
import { define } from "./define.ts";
import { trackPointerDrag } from "./pointer-drag.ts";
import { scopedQuery } from "./query.ts";

export class UIScrollArea extends HTMLElement {
  #viewport: HTMLElement | null = null;
  #bars: HTMLElement[] = [];
  #wired = false;
  #observer: ResizeObserver | null = null;
  #disposeDrags: (() => void)[] = [];

  connectedCallback() {
    if (this.#wired) this.#observeResize();
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    // End an in-flight thumb drag so its window listeners don't leak if the
    // element is removed mid-drag (pointerup would otherwise never fire). The
    // thumbs stay armed, so a re-inserted scroll area keeps working.
    for (const dispose of this.#disposeDrags) dispose();
  }

  // Child queries are scoped so a scroll area nested inside another's viewport
  // keeps ownership of its own viewport, scrollbars and thumbs — an unscoped
  // search would let the outer one drive the inner one's scroller.
  #wire() {
    this.#viewport = scopedQuery<HTMLElement>(this, "ui-scroll-viewport")[0] ?? null;
    if (!this.#viewport) return;
    this.#wired = true;
    this.#viewport.addEventListener("scroll", this.#update, { passive: true });

    this.#bars = scopedQuery<HTMLElement>(this, "ui-scroll-scrollbar");
    for (const bar of this.#bars) {
      const orientation: Orientation =
        bar.getAttribute("data-orientation") === "horizontal" ? "horizontal" : "vertical";
      bar.setAttribute("data-orientation", orientation);
      const thumb = scopedQuery<HTMLElement>(bar, "ui-scroll-thumb")[0];
      if (thumb) this.#armThumb(thumb, bar, orientation === "vertical");
    }

    if (typeof ResizeObserver !== "undefined") {
      this.#observer = new ResizeObserver(() => this.#update());
      this.#observeResize();
    }
    this.#update();
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
    const thumbLen = Math.max((contentLen > 0 ? viewLen / contentLen : 1) * trackLen, 20);
    return { thumbLen, dragRange: trackLen - thumbLen, maxScroll: contentLen - viewLen };
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
      const { thumbLen, dragRange, maxScroll } = this.#metrics(bar, vertical);
      const scroll = vertical ? vp.scrollTop : vp.scrollLeft;
      const pos = maxScroll > 0 ? (scroll / maxScroll) * dragRange : 0;
      if (vertical) {
        thumb.style.height = `${thumbLen}px`;
        thumb.style.transform = `translateY(${Math.round(pos)}px)`;
      } else {
        thumb.style.width = `${thumbLen}px`;
        thumb.style.transform = `translateX(${Math.round(pos)}px)`;
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
        },
        onMove: (e) => {
          const vp = this.#viewport;
          if (!vp) return;
          const delta = ((vertical ? e.clientY : e.clientX) - start) * scale;
          if (vertical) vp.scrollTop = startScroll + delta;
          else vp.scrollLeft = startScroll + delta;
        },
      }),
    );
  }
}

export class UIScrollViewport extends HTMLElement {}
export class UIScrollScrollbar extends HTMLElement {}
export class UIScrollThumb extends HTMLElement {}

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
