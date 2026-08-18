// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-calendar", () => {
  async function mount(attrs = 'value="2026-07-15"') {
    document.body.innerHTML = `<ui-calendar ${attrs}></ui-calendar>`;
    await flush();
    return document.querySelector("ui-calendar")!;
  }

  it("renders a labelled month grid with weekday headers and day buttons", async () => {
    const el = await mount();
    expect(el.querySelector("[data-calendar-grid]")?.getAttribute("role")).toBe("grid");
    expect(el.querySelectorAll('[role="columnheader"]').length).toBe(7);
    expect(el.querySelector("[data-calendar-label]")?.textContent).toContain("2026");
    // July has 31 day buttons.
    expect(el.querySelectorAll("[data-calendar-day]").length).toBe(31);
  });

  it("marks the value as selected and exposes it via .value", async () => {
    const el = await mount();
    expect(el.value).toBe("2026-07-15");
    const selected = el.querySelector('[data-calendar-day="2026-07-15"]')!;
    expect(selected.getAttribute("aria-selected")).toBe("true");
    // Only the selected/focused day is tabbable (roving).
    expect(selected.getAttribute("tabindex")).toBe("0");
  });

  it("selecting a day fires change with the ISO value", async () => {
    const el = await mount();
    let detail: string | null = "unset";
    el.addEventListener("change", (e) => (detail = (e as CustomEvent).detail.value));
    el.querySelector<HTMLButtonElement>('[data-calendar-day="2026-07-20"]')!.click();
    expect(detail).toBe("2026-07-20");
    expect(el.value).toBe("2026-07-20");
  });

  it("syncs selection, focus, and form value when the value attribute changes", async () => {
    const setFormValue = vi.fn<ElementInternals["setFormValue"]>();
    const internals = { setFormValue, form: null } as unknown as ElementInternals;
    const attachInternals = vi.fn<() => ElementInternals>(() => internals);
    const originalAttachInternals = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "attachInternals",
    );
    Object.defineProperty(HTMLElement.prototype, "attachInternals", {
      configurable: true,
      value: attachInternals,
    });
    const form = document.createElement("form");
    try {
      form.innerHTML = `<ui-calendar name="date" value="2026-07-15"></ui-calendar>`;
      document.body.append(form);
      await flush();
      const el = form.querySelector("ui-calendar")!;

      el.setAttribute("value", "2026-08-03");
      expect(el.value).toBe("2026-08-03");
      expect(el.querySelector("[data-calendar-label]")?.textContent).toContain("August");
      expect(el.querySelector('[data-calendar-day="2026-08-03"]')?.getAttribute("tabindex")).toBe(
        "0",
      );
      expect(setFormValue).toHaveBeenLastCalledWith("2026-08-03");

      el.removeAttribute("value");
      expect(el.value).toBe(null);
      expect(setFormValue).toHaveBeenLastCalledWith(null);
    } finally {
      if (originalAttachInternals) {
        Object.defineProperty(HTMLElement.prototype, "attachInternals", originalAttachInternals);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).attachInternals;
      }
    }
  });

  it("ArrowRight moves the roving tab stop to the next day", async () => {
    const el = await mount();
    const day15 = el.querySelector<HTMLButtonElement>('[data-calendar-day="2026-07-15"]')!;
    day15.focus();
    day15.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(el.querySelector('[data-calendar-day="2026-07-16"]')!.getAttribute("tabindex")).toBe(
      "0",
    );
  });

  it("disables days outside [min, max]", async () => {
    const el = await mount('value="2026-07-15" min="2026-07-10" max="2026-07-20"');
    expect(el.querySelector<HTMLButtonElement>('[data-calendar-day="2026-07-05"]')!.disabled).toBe(
      true,
    );
    expect(el.querySelector<HTMLButtonElement>('[data-calendar-day="2026-07-15"]')!.disabled).toBe(
      false,
    );
  });
});
