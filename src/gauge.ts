/**
 * `ui-gauge` — a scalar value within a known range, drawn as an arc (ported
 * from `@mui/x-charts`'s `Gauge`). A standalone, container-less element: it
 * does not register with `ui-chart`, it owns a tiny `<svg>` of its own — the
 * SVG-arc sibling of `ui-meter`'s bar-fill fraction (same conceptual role,
 * different rendering).
 *
 * Attributes: `value` (number, required), `min` (default `0`), `max`
 * (default `100`), `start-angle`/`end-angle` (degrees, 0 = 12 o'clock,
 * increasing clockwise; default `-120`/`120` — a 240° sweep across the
 * bottom), `thickness` (px, the ring's radial thickness, default `12`).
 *
 * Renders a fixed `viewBox="0 0 200 200"`, unless the host carries explicit
 * `width`/`height` attributes, in which case those size the viewBox instead
 * — sizing is otherwise left to consumer CSS (`width`/`height` on the
 * element), there is no `ResizeObserver`. Produces two `<path>` children:
 * `data-part="track"` (the full `start-angle`→`end-angle` arc, always drawn
 * as the background ring) and `data-part="value"` (the same arc from
 * `start-angle` to the angle for the current value's fraction). Neither
 * path sets `fill` — an unstyled gauge renders as solid `currentColor`
 * (black) arc sectors.
 *
 * `role="meter"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`
 * mirroring `value`/`min`/`max` (clamped to `[min, max]`), plus a `--gauge`
 * custom property (0–1 fraction) on the host for any consumer styling that
 * wants the raw fraction rather than the generated arc paths.
 */
import { arcPath } from "./chart-shape.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEG2RAD = Math.PI / 180;

export class UIGauge extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "start-angle", "end-angle", "thickness"];

  #svg: SVGSVGElement | null = null;
  #track: SVGPathElement | null = null;
  #value: SVGPathElement | null = null;
  #viewBoxWidth = 200;
  #viewBoxHeight = 200;

  get min(): number {
    return Number(this.getAttribute("min") ?? 0);
  }
  get max(): number {
    return Number(this.getAttribute("max") ?? 100);
  }
  get value(): number {
    return Number(this.getAttribute("value") ?? 0);
  }
  get startAngle(): number {
    return Number(this.getAttribute("start-angle") ?? -120);
  }
  get endAngle(): number {
    return Number(this.getAttribute("end-angle") ?? 120);
  }
  get thickness(): number {
    return Number(this.getAttribute("thickness") ?? 12);
  }

  connectedCallback() {
    this.setAttribute("role", "meter");
    if (!this.#svg) this.#build();
    this.#sync();
  }

  attributeChangedCallback() {
    if (this.#svg) this.#sync();
  }

  #build() {
    this.#viewBoxWidth = this.hasAttribute("width") ? Number(this.getAttribute("width")) : 200;
    this.#viewBoxHeight = this.hasAttribute("height") ? Number(this.getAttribute("height")) : 200;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", `0 0 ${this.#viewBoxWidth} ${this.#viewBoxHeight}`);

    const track = document.createElementNS(SVG_NS, "path");
    track.setAttribute("data-part", "track");
    const value = document.createElementNS(SVG_NS, "path");
    value.setAttribute("data-part", "value");

    svg.append(track, value);
    this.append(svg);

    this.#svg = svg;
    this.#track = track;
    this.#value = value;
  }

  #sync() {
    const { min, max } = this;
    const value = Math.max(min, Math.min(this.value, max));
    const fraction = max > min ? (value - min) / (max - min) : 0;

    const startAngle = this.startAngle * DEG2RAD;
    const endAngle = this.endAngle * DEG2RAD;
    const valueAngle = startAngle + fraction * (endAngle - startAngle);

    const outerRadius = Math.min(this.#viewBoxWidth, this.#viewBoxHeight) / 2 - 4;
    // Clamp: a `thickness` authored larger than the available radius would
    // otherwise drive `innerRadius` negative, producing a malformed arc.
    const innerRadius = Math.max(0, outerRadius - this.thickness);
    const cx = this.#viewBoxWidth / 2;
    const cy = this.#viewBoxHeight / 2;

    this.#track?.setAttribute(
      "d",
      arcPath({ innerRadius, outerRadius, startAngle, endAngle, cx, cy }),
    );
    this.#value?.setAttribute(
      "d",
      arcPath({ innerRadius, outerRadius, startAngle, endAngle: valueAngle, cx, cy }),
    );

    this.setAttribute("aria-valuemin", String(min));
    this.setAttribute("aria-valuemax", String(max));
    this.setAttribute("aria-valuenow", String(value));
    this.style.setProperty("--gauge", String(fraction));
  }
}

if (!customElements.get("ui-gauge")) customElements.define("ui-gauge", UIGauge);

declare global {
  interface HTMLElementTagNameMap {
    "ui-gauge": UIGauge;
  }
}
