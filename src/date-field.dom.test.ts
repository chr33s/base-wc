// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-date-field", () => {
  it("adopts a native date input and writes the pick back to it", async () => {
    document.body.innerHTML = `<ui-date-field><input type="date" name="due" value="2026-07-10" /></ui-date-field>`;
    await flush();
    const field = document.querySelector("ui-date-field")!;
    const input = document.querySelector<HTMLInputElement>("input")!;
    const trigger = field.querySelector<HTMLButtonElement>("[data-date-trigger]")!;
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");

    let changed = false;
    input.addEventListener("change", () => (changed = true));
    trigger.click();
    await flush();
    field.querySelector<HTMLButtonElement>('[data-calendar-day="2026-07-20"]')!.click();
    expect(input.value).toBe("2026-07-20");
    expect(changed).toBe(true);
  });
});
