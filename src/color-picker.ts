/**
 * `ui-color-picker` — a saturation/brightness plane + hue slider + hex input, and
 * `ui-color-field` — a native-first field that opens one in a popover.
 *
 * No Base UI counterpart; it follows the same headless conventions (light DOM,
 * {@link ElementInternals} form-association, the shared {@link overlay} stack).
 *
 * **`ui-color-picker`** builds a 2D `[data-color-area]` (x = saturation, y =
 * brightness, drag or arrow keys — `role="slider"`, `aria-valuetext` = hex), a
 * native `[data-color-hue]` range, and a `[data-color-hex]` text input. Any of
 * the three that the consumer authors is adopted; the rest are generated. It is
 * form-associated (submits the `#rrggbb` value under `name`) and fires `change`
 * with `{ value }`.
 *
 * **`ui-color-field`** is native-first: author `<input type="color" name="brand">`
 * and it works with no JavaScript (the browser's swatch + picker). On upgrade it
 * {@link retireNative | retires} the input to the hidden submitting value and
 * shows a swatch trigger that opens a `<ui-color-picker>`; picking writes the hex
 * back and fires the native change.
 */
import { connectLightDom } from "./lifecycle.ts";
import { SUPPORTS_ANCHOR } from "./anchor.ts";
import { nextId } from "./id.ts";
import { adoptedControl, fireNativeChange, retireNative } from "./native.ts";
import { type Overlay, overlay } from "./overlay.ts";

interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pad2 = (n: number) => n.toString(16).padStart(2, "0");

function hsvToRgb({ h, s, v }: HSV): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = (
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  ) as [number, number, number];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

const hsvToHex = (hsv: HSV) => `#${hsvToRgb(hsv).map(pad2).join("")}`;

function parseHex(input: string | null | undefined): [number, number, number] | null {
  let s = (input ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c); // expand shorthand
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export interface ColorChangeDetail {
  /** The selected color as `#rrggbb`. */
  readonly value: string;
}

export class UIColorPicker extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["value", "disabled"];

  #internals: ElementInternals | null = this.attachInternals?.() ?? null;
  #wired = false;
  #hsv: HSV = { h: 0, s: 0, v: 0 };
  #area!: HTMLElement;
  #thumb!: HTMLElement;
  #hue!: HTMLInputElement;
  #hex!: HTMLInputElement;

  get form(): HTMLFormElement | null {
    return this.#internals?.form ?? null;
  }
  get name(): string | null {
    return this.getAttribute("name");
  }
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  get value(): string {
    return hsvToHex(this.#hsv);
  }
  set value(next: string) {
    const rgb = parseHex(next);
    if (rgb) this.#setHsv(rgbToHsv(...rgb), false);
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  attributeChangedCallback(name: string) {
    if (!this.#wired) return;
    if (name === "value") this.value = this.getAttribute("value") ?? "#000000";
    if (name === "disabled") this.#reflectDisabled();
  }

  #wire() {
    this.#wired = true;
    const rgb = parseHex(this.getAttribute("value")) ?? [0, 0, 0];
    this.#hsv = rgbToHsv(...rgb);

    this.#area = this.querySelector<HTMLElement>("[data-color-area]") ?? this.#buildArea();
    this.#thumb = this.#area.querySelector<HTMLElement>("[data-color-thumb]") ?? this.#buildThumb();
    this.#hue = this.querySelector<HTMLInputElement>("[data-color-hue]") ?? this.#buildHue();
    this.#hex = this.querySelector<HTMLInputElement>("[data-color-hex]") ?? this.#buildHex();

    this.#area.setAttribute("role", "slider");
    this.#area.setAttribute(
      "aria-label",
      this.#area.getAttribute("aria-label") ?? "Saturation and brightness",
    );
    this.#area.tabIndex = this.disabled ? -1 : 0;
    this.#area.addEventListener("pointerdown", this.#onAreaPointer);
    this.#area.addEventListener("keydown", this.#onAreaKeydown);
    this.#hue.addEventListener("input", this.#onHueInput);
    this.#hex.addEventListener("change", this.#onHexChange);
    // The inner controls' native input/change events must not bubble out as the
    // component's own — its only public change is the CustomEvent from `#setHsv`.
    const swallow = (e: Event) => e.stopPropagation();
    this.#hue.addEventListener("change", swallow);
    this.#hex.addEventListener("input", swallow);

    this.#internals?.setFormValue(this.value);
    this.#render();
  }

  #buildArea() {
    const el = document.createElement("div");
    el.setAttribute("data-color-area", "");
    this.prepend(el);
    return el;
  }
  #buildThumb() {
    const el = document.createElement("div");
    el.setAttribute("data-color-thumb", "");
    this.#area.append(el);
    return el;
  }
  #buildHue() {
    const el = document.createElement("input");
    el.type = "range";
    el.min = "0";
    el.max = "360";
    el.setAttribute("data-color-hue", "");
    el.setAttribute("aria-label", "Hue");
    this.append(el);
    return el;
  }
  #buildHex() {
    const el = document.createElement("input");
    el.type = "text";
    el.setAttribute("data-color-hex", "");
    el.setAttribute("aria-label", "Hex color");
    el.autocomplete = "off";
    el.spellcheck = false;
    this.append(el);
    return el;
  }

  #reflectDisabled() {
    const d = this.disabled;
    this.#area.tabIndex = d ? -1 : 0;
    this.#hue.disabled = d;
    this.#hex.disabled = d;
    this.toggleAttribute("data-disabled", d);
  }

  #setHsv(next: HSV, emit: boolean) {
    this.#hsv = { h: clamp(next.h, 0, 360), s: clamp(next.s, 0, 1), v: clamp(next.v, 0, 1) };
    this.#internals?.setFormValue(this.value);
    if (this.#wired) this.#render();
    if (emit) {
      this.dispatchEvent(
        new CustomEvent<ColorChangeDetail>("change", {
          bubbles: true,
          detail: { value: this.value },
        }),
      );
    }
  }

  #render() {
    const hex = this.value;
    this.#area.style.setProperty("--hue", String(Math.round(this.#hsv.h)));
    this.#area.style.setProperty("--color", hex);
    this.#area.setAttribute("aria-valuetext", hex);
    this.#thumb.style.left = `${this.#hsv.s * 100}%`;
    this.#thumb.style.top = `${(1 - this.#hsv.v) * 100}%`;
    this.#thumb.style.background = hex;
    if (this.#hue.value !== String(Math.round(this.#hsv.h))) {
      this.#hue.value = String(Math.round(this.#hsv.h));
    }
    if (document.activeElement !== this.#hex) this.#hex.value = hex;
    this.#reflectDisabled();
  }

  #setFromArea(clientX: number, clientY: number) {
    const rect = this.#area.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const s = clamp((clientX - rect.left) / rect.width, 0, 1);
    const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    this.#setHsv({ ...this.#hsv, s, v }, true);
  }

  #onAreaPointer = (e: PointerEvent) => {
    if (this.disabled) return;
    e.preventDefault();
    this.#area.focus();
    this.#area.setPointerCapture?.(e.pointerId);
    this.#setFromArea(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => this.#setFromArea(ev.clientX, ev.clientY);
    const up = () => {
      this.#area.removeEventListener("pointermove", move);
      this.#area.removeEventListener("pointerup", up);
    };
    this.#area.addEventListener("pointermove", move);
    this.#area.addEventListener("pointerup", up);
  };

  #onAreaKeydown = (e: KeyboardEvent) => {
    if (this.disabled) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    let { s, v } = this.#hsv;
    switch (e.key) {
      case "ArrowLeft":
        s -= step;
        break;
      case "ArrowRight":
        s += step;
        break;
      case "ArrowUp":
        v += step;
        break;
      case "ArrowDown":
        v -= step;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.#setHsv({ ...this.#hsv, s: clamp(s, 0, 1), v: clamp(v, 0, 1) }, true);
  };

  #onHueInput = (e: Event) => {
    e.stopPropagation();
    this.#setHsv({ ...this.#hsv, h: Number(this.#hue.value) }, true);
  };

  #onHexChange = (e: Event) => {
    e.stopPropagation();
    const rgb = parseHex(this.#hex.value);
    if (rgb) this.#setHsv(rgbToHsv(...rgb), true);
    else this.#hex.value = this.value; // reject invalid, restore
  };
}

/** The popover shell around a `<ui-color-picker>` (top layer). */
export class UIColorPickerPopup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("popover", "manual");
  }
}

export class UIColorField extends HTMLElement {
  #wired = false;
  #input!: HTMLInputElement;
  #trigger!: HTMLElement;
  #popup!: UIColorPickerPopup;
  #picker!: UIColorPicker;
  #overlay: Overlay | null = null;
  #isOpen = false;

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    const input = adoptedControl<HTMLInputElement>(this, 'input[type="color"]');
    if (!input) return;
    this.#wired = true;
    this.#input = input;

    this.#trigger = document.createElement("button");
    this.#trigger.setAttribute("data-color-trigger", "");
    (this.#trigger as HTMLButtonElement).type = "button";
    const label = input.getAttribute("aria-label");
    this.#trigger.setAttribute("aria-label", label ?? "Choose color");

    this.#picker = document.createElement("ui-color-picker") as UIColorPicker;
    this.#picker.value = input.value || "#000000";
    this.#popup = document.createElement("ui-color-picker-popup") as UIColorPickerPopup;
    this.#popup.append(this.#picker);
    if (!this.#popup.id) this.#popup.id = nextId("ui-color-popup");

    this.#trigger.setAttribute("aria-haspopup", "dialog");
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#trigger.setAttribute("aria-controls", this.#popup.id);
    this.#trigger.addEventListener("click", this.#onTriggerClick);
    this.#picker.addEventListener("change", this.#onPick as EventListener);

    input.after(this.#trigger);
    this.append(this.#popup);
    retireNative(input);
    this.#syncSwatch();

    if (SUPPORTS_ANCHOR) {
      const name = `--color-${nextId("anchor")}`;
      this.#trigger.style.setProperty("anchor-name", name);
      this.#popup.style.setProperty("position-anchor", name);
    }
    this.#overlay = overlay(this.#popup, {
      anchor: { ref: () => this.#trigger, options: { offset: 6, padding: 8 } },
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close(false),
      },
    });
  }

  #syncSwatch() {
    this.#trigger.style.setProperty("--color", this.#input.value || "#000000");
  }

  #onTriggerClick = () => (this.#isOpen ? this.#close(true) : this.#open());

  #open() {
    if (this.#isOpen) return;
    this.#isOpen = true;
    this.#picker.value = this.#input.value || "#000000";
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#overlay?.show();
    this.#picker.querySelector<HTMLElement>("[data-color-area]")?.focus();
  }

  #close(restoreFocus: boolean) {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#overlay?.hide();
    if (restoreFocus) this.#trigger.focus();
  }

  #onPick = (e: CustomEvent<ColorChangeDetail>) => {
    e.stopPropagation(); // the field's public change is the native input's, below
    this.#input.value = e.detail.value;
    fireNativeChange(this.#input);
    this.#syncSwatch();
  };

  disconnectedCallback() {
    this.#close(false);
  }
}

if (!customElements.get("ui-color-picker")) customElements.define("ui-color-picker", UIColorPicker);
if (!customElements.get("ui-color-picker-popup"))
  customElements.define("ui-color-picker-popup", UIColorPickerPopup);
if (!customElements.get("ui-color-field")) customElements.define("ui-color-field", UIColorField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-color-picker": UIColorPicker;
    "ui-color-picker-popup": UIColorPickerPopup;
    "ui-color-field": UIColorField;
  }
}
