// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-progress", () => {
  it("exposes a determinate progressbar with a fill fraction", () => {
    document.body.innerHTML = `<ui-progress value="25" max="50"></ui-progress>`;
    const el = document.querySelector("ui-progress")!;
    expect(el.getAttribute("role")).toBe("progressbar");
    expect(el.getAttribute("aria-valuenow")).toBe("25");
    expect(el.getAttribute("aria-valuemax")).toBe("50");
    expect(el.style.getPropertyValue("--progress")).toBe("0.5");
    expect(el.getAttribute("data-state")).toBe("loading");
  });

  it("marks completion", () => {
    document.body.innerHTML = `<ui-progress value="100"></ui-progress>`;
    expect(document.querySelector("ui-progress")!.getAttribute("data-state")).toBe("complete");
  });

  it("drops aria-valuenow when indeterminate", () => {
    document.body.innerHTML = `<ui-progress></ui-progress>`;
    const el = document.querySelector("ui-progress")!;
    expect(el.hasAttribute("aria-valuenow")).toBe(false);
    expect(el.getAttribute("data-state")).toBe("indeterminate");
  });

  it("clamps out-of-range values", () => {
    document.body.innerHTML = `<ui-progress value="250"></ui-progress>`;
    expect(document.querySelector("ui-progress")!.getAttribute("aria-valuenow")).toBe("100");
  });
});

describe("ui-meter", () => {
  it("exposes a meter with value + fraction", () => {
    document.body.innerHTML = `<ui-meter value="30" min="0" max="60"></ui-meter>`;
    const el = document.querySelector("ui-meter")!;
    expect(el.getAttribute("role")).toBe("meter");
    expect(el.getAttribute("aria-valuenow")).toBe("30");
    expect(el.style.getPropertyValue("--meter")).toBe("0.5");
  });

  it("classifies value against low/high/optimum regions", () => {
    // optimum in the high region (higher is better); value in the low region → poor.
    document.body.innerHTML = `<ui-meter value="10" min="0" max="100" low="30" high="70" optimum="90"></ui-meter>`;
    expect(document.querySelector("ui-meter")!.getAttribute("data-state")).toBe("poor");
  });

  it("reports optimal when the value sits in the optimum region", () => {
    document.body.innerHTML = `<ui-meter value="85" min="0" max="100" low="30" high="70" optimum="90"></ui-meter>`;
    expect(document.querySelector("ui-meter")!.getAttribute("data-state")).toBe("optimal");
  });
});

describe("ui-avatar", () => {
  async function mount(inner: string) {
    document.body.innerHTML = `<ui-avatar>${inner}</ui-avatar>`;
    await Promise.resolve();
    return document.querySelector("ui-avatar")!;
  }

  it("falls back to error when there is no image", async () => {
    const el = await mount(`<span data-avatar-fallback>AB</span>`);
    expect(el.state).toBe("error");
  });

  it("transitions loading → loaded on image load", async () => {
    const el = await mount(
      `<img data-avatar-image src="/a.png" alt="" /><span data-avatar-fallback>AB</span>`,
    );
    expect(el.state).toBe("loading");
    const onState = vi.fn<(detail: { state: string }) => void>();
    el.addEventListener("statechange", (e) =>
      onState((e as CustomEvent<{ state: string }>).detail),
    );
    el.querySelector("img")!.dispatchEvent(new Event("load"));
    expect(el.state).toBe("loaded");
    expect(onState.mock.calls.at(-1)?.[0]).toEqual({ state: "loaded" });
  });

  it("transitions to error when the image fails", async () => {
    const el = await mount(
      `<img data-avatar-image src="/bad.png" alt="" /><span data-avatar-fallback>AB</span>`,
    );
    el.querySelector("img")!.dispatchEvent(new Event("error"));
    expect(el.state).toBe("error");
  });
});
