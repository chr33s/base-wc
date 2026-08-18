/**
 * `ui-scroll-area` — a scroll container with custom, overlay scrollbars (Base
 * UI's Scroll Area). The native scrollbar is hidden by consumer CSS; this
 * element sizes and positions a `<ui-scroll-thumb>` from the viewport/content
 * ratio, keeps it in sync on scroll and resize (via `ResizeObserver`), lets you
 * drag the thumb to scroll, and reflects overflow as `data-overflow-x` /
 * `data-overflow-y` so scrollbars can show only when needed.
 *
 * Markup: a `<ui-scroll-viewport>` (the scroller) plus one or two
 * `<ui-scroll-scrollbar data-orientation="vertical|horizontal">` each wrapping a
 * `<ui-scroll-thumb>`.
 */
type Orientation = "vertical" | "horizontal";

import { connectLightDom } from "./lifecycle.ts";

export class UIScrollArea extends HTMLElement {
  #viewport: HTMLElement | null = null;
  #bars: HTMLElement[] = [];
  #wired = false;
  #observer: ResizeObserver | null = null;
  #stopDrag: (() => void) | null = null;

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
    // Tear down an in-flight thumb drag so its window listeners don't leak if
    // the element is removed mid-drag (pointerup would otherwise never fire).
    this.#stopDrag?.();
    this.#stopDrag = null;
  }

  #wire() {
    this.#viewport = this.querySelector<HTMLElement>("ui-scroll-viewport");
    if (!this.#viewport) return;
    this.#wired = true;
    this.#viewport.addEventListener("scroll", this.#update, { passive: true });

    this.#bars = [...this.querySelectorAll<HTMLElement>("ui-scroll-scrollbar")];
    for (const bar of this.#bars) {
      const orientation: Orientation =
        bar.getAttribute("data-orientation") === "horizontal" ? "horizontal" : "vertical";
      bar.setAttribute("data-orientation", orientation);
      bar
        .querySelector<HTMLElement>("ui-scroll-thumb")
        ?.addEventListener("pointerdown", (e) => this.#onThumbDown(e, orientation, bar));
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
      const trackLen = vertical ? bar.clientHeight : bar.clientWidth;
      const contentLen = vertical ? vp.scrollHeight : vp.scrollWidth;
      const viewLen = vertical ? vp.clientHeight : vp.clientWidth;
      const scroll = vertical ? vp.scrollTop : vp.scrollLeft;
      const ratio = contentLen > 0 ? viewLen / contentLen : 1;
      const thumbLen = Math.max(ratio * trackLen, 20);
      const maxScroll = contentLen - viewLen;
      const pos = maxScroll > 0 ? (scroll / maxScroll) * (trackLen - thumbLen) : 0;
      if (vertical) {
        thumb.style.height = `${thumbLen}px`;
        thumb.style.transform = `translateY(${Math.round(pos)}px)`;
      } else {
        thumb.style.width = `${thumbLen}px`;
        thumb.style.transform = `translateX(${Math.round(pos)}px)`;
      }
    }
  };

  #onThumbDown(e: PointerEvent, orientation: Orientation, bar: HTMLElement) {
    e.preventDefault();
    const vp = this.#viewport;
    if (!vp) return;
    const vertical = orientation === "vertical";
    const start = vertical ? e.clientY : e.clientX;
    const startScroll = vertical ? vp.scrollTop : vp.scrollLeft;
    const trackLen = vertical ? bar.clientHeight : bar.clientWidth;
    const contentLen = vertical ? vp.scrollHeight : vp.scrollWidth;
    const viewLen = vertical ? vp.clientHeight : vp.clientWidth;
    // Map pointer travel to scroll using the inverse of #update's thumb
    // placement: the thumb moves across (trackLen - thumbLen) to cover the
    // (contentLen - viewLen) scroll range, and thumbLen has the same 20px floor.
    const thumbLen = Math.max((contentLen > 0 ? viewLen / contentLen : 1) * trackLen, 20);
    const dragRange = trackLen - thumbLen;
    const maxScroll = contentLen - viewLen;

    const move = (ev: PointerEvent) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - start;
      const scrollDelta = dragRange > 0 ? delta * (maxScroll / dragRange) : 0;
      if (vertical) vp.scrollTop = startScroll + scrollDelta;
      else vp.scrollLeft = startScroll + scrollDelta;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.#stopDrag = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    this.#stopDrag = up;
  }
}

export class UIScrollViewport extends HTMLElement {}
export class UIScrollScrollbar extends HTMLElement {}
export class UIScrollThumb extends HTMLElement {}

if (!customElements.get("ui-scroll-area")) customElements.define("ui-scroll-area", UIScrollArea);
if (!customElements.get("ui-scroll-viewport"))
  customElements.define("ui-scroll-viewport", UIScrollViewport);
if (!customElements.get("ui-scroll-scrollbar"))
  customElements.define("ui-scroll-scrollbar", UIScrollScrollbar);
if (!customElements.get("ui-scroll-thumb")) customElements.define("ui-scroll-thumb", UIScrollThumb);

declare global {
  interface HTMLElementTagNameMap {
    "ui-scroll-area": UIScrollArea;
    "ui-scroll-viewport": UIScrollViewport;
    "ui-scroll-scrollbar": UIScrollScrollbar;
    "ui-scroll-thumb": UIScrollThumb;
  }
}
