/**
 * `ui-color-picker` — a saturation/brightness plane + hue slider + hex input, and
 * `ui-color-field` — a native-first field that opens one in a popover.
 *
 * No Base UI counterpart; it follows the same headless conventions (light DOM,
 * form association via the shared {@link formControl} layer, the shared
 * {@link popoverField} popover dance).
 *
 * **`ui-color-picker`** builds a 2D `[data-color-area]` (x = saturation, y =
 * brightness, drag or arrow keys — `role="slider"`, `aria-valuetext` = hex), a
 * native `[data-color-hue]` range, and a `[data-color-hex]` text input. Any of
 * the three that the consumer authors is adopted; the rest are generated. It is
 * form-associated (submits the `#rrggbb` value under `name`; `form.reset()`
 * restores the initial value) and fires `change` with `{ value }`.
 *
 * **`ui-color-field`** is native-first: author `<input type="color" name="brand">`
 * and it works with no JavaScript (the browser's swatch + picker). On upgrade it
 * {@link retireNative | retires} the input to the hidden submitting value and
 * shows a swatch trigger — an authored `[data-color-trigger]` is adopted, else
 * one is generated — that opens a `<ui-color-picker>`; picking writes the hex
 * back and fires the native change.
 */
import { define } from "./define.ts";
import { UIPopupElement } from "./popup.ts";
import { FormAssociatedElement, type FormControlOptions } from "./form-control.ts";
import { LightDomElement } from "./lifecycle.ts";
import { clamp } from "./math.ts";
import { adoptedControl, fireNativeChange } from "./native.ts";
import { trackPointerDrag } from "./pointer-drag.ts";
import { type PopoverField, popoverField } from "./popover-field.ts";

interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

const pad2 = (n: number) => n.toString(16).padStart(2, "0");

function hsvToRgb({ h, s, v }: HSV) {
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

function rgbToHsv(r: number, g: number, b: number) {
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

export class UIColorPicker extends FormAssociatedElement {
  static observedAttributes = ["value", "disabled"];

  protected override formControlOptions(): FormControlOptions {
    return {
      value: () => this.value, // always a full hex — never empty
      onReset: () => {
        if (!this.wired) return;
        this.#setHsv(rgbToHsv(...(parseHex(this.getAttribute("value")) ?? [0, 0, 0])), false);
      },
    };
  }
  protected override onFormDisabled() {
    if (this.wired) this.#reflectDisabled();
  }
  #hsv: HSV = { h: 0, s: 0, v: 0 };
  #area!: HTMLElement;
  #thumb!: HTMLElement;
  #hue!: HTMLInputElement;
  #hex!: HTMLInputElement;
  #disposeDrag: (() => void) | null = null;

  get value() {
    return hsvToHex(this.#hsv);
  }
  set value(next: string) {
    const rgb = parseHex(next);
    if (rgb) this.#setHsv(rgbToHsv(...rgb), false);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#disposeDrag?.();
  }

  attributeChangedCallback(name: string) {
    if (!this.wired) return;
    if (name === "value") this.value = this.getAttribute("value") ?? "#000000";
    if (name === "disabled") this.#reflectDisabled();
  }

  protected override initialize() {
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
    this.#disposeDrag = trackPointerDrag(this.#area, {
      onStart: (e) => {
        if (this.disabled) return false;
        e.preventDefault();
        this.#area.focus();
        this.#setFromArea(e.clientX, e.clientY);
      },
      onMove: (e) => this.#setFromArea(e.clientX, e.clientY),
    });
    this.#area.addEventListener("keydown", this.#onAreaKeydown);
    this.#hue.addEventListener("input", this.#onHueInput);
    this.#hex.addEventListener("change", this.#onHexChange);
    // The inner controls' native input/change events must not bubble out as the
    // component's own — its only public change is the CustomEvent from `#setHsv`.
    const swallow = (e: Event) => e.stopPropagation();
    this.#hue.addEventListener("change", swallow);
    this.#hex.addEventListener("input", swallow);

    this.formControl.setValue(this.value);
    this.#render();
    return true;
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
    this.formControl.setValue(this.value);
    if (this.wired) this.#render();
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
export class UIColorPickerPopup extends UIPopupElement {}

export class UIColorField extends LightDomElement {
  #input!: HTMLInputElement;
  #field: PopoverField | null = null;

  protected override initialize() {
    const input = adoptedControl<HTMLInputElement>(this, 'input[type="color"]');
    if (!input) return false;
    this.#input = input;

    const picker = document.createElement("ui-color-picker") as UIColorPicker;
    picker.value = input.value || "#000000";
    const popup = document.createElement("ui-color-picker-popup") as UIColorPickerPopup;
    popup.append(picker);

    this.#field = popoverField(this, {
      input,
      prefix: "color",
      trigger: {
        marker: "data-color-trigger",
        label: input.getAttribute("aria-label") ?? "Choose color",
      },
      build: () => ({ popup, widget: picker }),
      retireInput: true,
      onOpen: () => {
        picker.value = input.value || "#000000";
      },
      initialFocus: () => picker.querySelector<HTMLElement>("[data-color-area]"),
    });
    picker.addEventListener("change", this.#onPick as EventListener);
    this.#syncSwatch();
    return true;
  }

  #syncSwatch() {
    this.#field?.trigger.style.setProperty("--color", this.#input.value || "#000000");
  }

  #onPick = (e: CustomEvent<ColorChangeDetail>) => {
    e.stopPropagation(); // the field's public change is the native input's, below
    this.#input.value = e.detail.value;
    fireNativeChange(this.#input);
    this.#syncSwatch();
  };

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#field?.close(false);
  }
}

define("ui-color-picker", UIColorPicker);
define("ui-color-picker-popup", UIColorPickerPopup);
define("ui-color-field", UIColorField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-color-picker": UIColorPicker;
    "ui-color-picker-popup": UIColorPickerPopup;
    "ui-color-field": UIColorField;
  }
}
