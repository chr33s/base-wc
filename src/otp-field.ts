/**
 * `ui-otp-field` — a one-time-code input split into single-character cells
 * (Base UI's OTP Field). It generates `length` cells, moves the caret forward as
 * you type and back on Backspace, supports Arrow navigation, distributes a
 * pasted (or autofilled) code across the cells, and normalizes input to the
 * allowed character set (`numeric` by default, or `alphanumeric`). The
 * concatenated value is **form-associated** under `name`; `mask` renders the
 * cells as password fields.
 *
 * Markup: an empty `<ui-otp-field length="6">` (cells are generated), or a
 * `[data-otp-cells]` container to generate them into.
 */
import { connectLightDom } from "./lifecycle.ts";

export class UIOtpField extends HTMLElement {
  static formAssociated = true;

  #internals: ElementInternals | null = this.attachInternals?.() ?? null;
  #cells: HTMLInputElement[] = [];
  #wired = false;

  get name(): string | null {
    return this.getAttribute("name");
  }
  get form(): HTMLFormElement | null {
    return this.#internals?.form ?? null;
  }
  get length(): number {
    return Math.max(1, Number(this.getAttribute("length") ?? 6));
  }
  get value(): string {
    return this.#cells.map((c) => c.value).join("");
  }
  set value(next: string) {
    const normalized = this.#normalize(next);
    this.#cells.forEach((cell, i) => {
      cell.value = normalized[i] ?? "";
    });
    this.#syncFormValue();
  }
  get #alphanumeric(): boolean {
    return this.getAttribute("mode") === "alphanumeric";
  }
  get #mask(): boolean {
    return this.hasAttribute("mask");
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#wired = true;
    this.setAttribute("role", "group");
    const container = this.querySelector<HTMLElement>("[data-otp-cells]") ?? this;

    const existing = [...this.querySelectorAll<HTMLInputElement>("input")];
    for (let i = existing.length; i < this.length; i++) {
      container.appendChild(document.createElement("input"));
    }
    this.#cells = [...this.querySelectorAll<HTMLInputElement>("input")].slice(0, this.length);

    this.#cells.forEach((cell, i) => {
      cell.setAttribute("maxlength", "1");
      cell.setAttribute("inputmode", this.#alphanumeric ? "text" : "numeric");
      cell.setAttribute("autocomplete", i === 0 ? "one-time-code" : "off");
      cell.setAttribute("aria-label", `Character ${i + 1} of ${this.length}`);
      if (this.#mask) cell.type = "password";
      cell.addEventListener("input", () => this.#onInput(i));
      cell.addEventListener("keydown", (e) => this.#onKeydown(i, e));
      cell.addEventListener("paste", (e) => this.#onPaste(i, e));
      cell.addEventListener("focus", () => cell.select?.());
    });
    this.#syncFormValue();
  }

  #allowed(char: string): boolean {
    return this.#alphanumeric ? /[a-z0-9]/i.test(char) : /[0-9]/.test(char);
  }
  #normalize(text: string): string {
    return Array.from(text)
      .filter((c) => this.#allowed(c))
      .join("");
  }

  #onInput(index: number) {
    const cell = this.#cells[index];
    const normalized = this.#normalize(cell.value);
    if (normalized.length <= 1) {
      cell.value = normalized;
      if (normalized && index < this.length - 1) this.#cells[index + 1].focus();
    } else {
      this.#distribute(index, normalized); // fast typing / autofill of multiple chars
    }
    this.#commit();
  }

  #distribute(start: number, chars: string) {
    let i = start;
    for (const char of chars) {
      if (i >= this.length) break;
      this.#cells[i].value = char;
      i += 1;
    }
    this.#cells[Math.min(i, this.length - 1)].focus();
  }

  #onKeydown(index: number, e: KeyboardEvent) {
    const cell = this.#cells[index];
    if (e.key === "Backspace" && cell.value === "" && index > 0) {
      e.preventDefault();
      const prev = this.#cells[index - 1];
      prev.value = "";
      prev.focus();
      this.#commit();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      this.#cells[index - 1].focus();
    } else if (e.key === "ArrowRight" && index < this.length - 1) {
      e.preventDefault();
      this.#cells[index + 1].focus();
    }
  }

  #onPaste(index: number, e: ClipboardEvent) {
    e.preventDefault();
    const text = this.#normalize(e.clipboardData?.getData("text") ?? "");
    if (text) {
      // A full-length code fills the whole field from the start, even when a
      // later cell is focused; a shorter paste fills from the focused cell
      // (completing the remaining ones).
      this.#distribute(text.length >= this.length ? 0 : index, text);
      this.#commit();
    }
  }

  #commit() {
    this.#syncFormValue();
    const value = this.value;
    this.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { value } }));
    if (value.length === this.length) {
      this.dispatchEvent(new CustomEvent("complete", { bubbles: true, detail: { value } }));
    }
  }

  #syncFormValue() {
    this.#internals?.setFormValue(this.value);
  }
}

if (!customElements.get("ui-otp-field")) customElements.define("ui-otp-field", UIOtpField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-otp-field": UIOtpField;
  }
}
