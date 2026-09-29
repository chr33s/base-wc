// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { flush, must } from "./test-utils.ts";

/** The value, or a failure naming the missing element. */
afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-date-field", () => {
  it("adopts a native date input and writes the pick back to it", async () => {
    document.body.innerHTML = `<ui-date-field><input type="date" name="due" value="2026-07-10" /></ui-date-field>`;
    await flush();
    const field = must(document.querySelector("ui-date-field"));
    const input = must(document.querySelector<HTMLInputElement>("input"));
    const trigger = must(field.querySelector<HTMLButtonElement>("[data-date-trigger]"));
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");

    let changed = false;
    input.addEventListener("change", () => (changed = true));
    trigger.click();
    await flush();
    must(field.querySelector<HTMLButtonElement>('[data-calendar-day="2026-07-20"]')).click();
    expect(input.value).toBe("2026-07-20");
    expect(changed).toBe(true);
  });
});
