// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-banner", () => {
  it("announces politely as status by default and labels from its title", async () => {
    document.body.innerHTML = `<ui-banner><strong data-banner-title>Heads up</strong></ui-banner>`;
    await flush();
    const el = document.querySelector("ui-banner")!;
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
    const title = el.querySelector("[data-banner-title]")!;
    expect(el.getAttribute("aria-labelledby")).toBe(title.id);
  });

  it("announces assertively as alert for error/warning types", async () => {
    document.body.innerHTML = `<ui-banner data-type="error">Boom</ui-banner>`;
    await flush();
    const el = document.querySelector("ui-banner")!;
    expect(el.getAttribute("role")).toBe("alert");
    expect(el.getAttribute("aria-live")).toBe("assertive");
  });

  it("dismissible generates a close button that fires `dismiss` and removes it", async () => {
    document.body.innerHTML = `<ui-banner dismissible>Bye</ui-banner>`;
    await flush();
    const el = document.querySelector("ui-banner")!;
    let dismissed = false;
    el.addEventListener("dismiss", () => (dismissed = true));
    el.querySelector<HTMLButtonElement>("[data-banner-dismiss]")!.click();
    expect(dismissed).toBe(true);
    expect(document.querySelector("ui-banner")).toBe(null); // removed (no CSS exit)
  });

  it("is not dismissible without the attribute", async () => {
    document.body.innerHTML = `<ui-banner>Static</ui-banner>`;
    await flush();
    const el = document.querySelector("ui-banner")!;
    expect(el.querySelector("[data-banner-dismiss]")).toBe(null);
  });
});
