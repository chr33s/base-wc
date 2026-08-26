// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount(attrs = "") {
  document.body.innerHTML = `
    <ui-toolbar ${attrs} aria-label="Formatting">
      <button id="b">B</button>
      <button id="i">I</button>
      <button id="d" disabled>D</button>
      <button id="u">U</button>
    </ui-toolbar>`;
  await Promise.resolve();
  const toolbar = document.querySelector("ui-toolbar")!;
  const b = document.querySelector<HTMLButtonElement>("#b")!;
  const i = document.querySelector<HTMLButtonElement>("#i")!;
  const u = document.querySelector<HTMLButtonElement>("#u")!;
  return { toolbar, b, i, u };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-toolbar", () => {
  it("is a horizontal toolbar with one roving tab stop", async () => {
    const { toolbar, b, i } = await mount();
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(toolbar.getAttribute("aria-orientation")).toBe("horizontal");
    expect(b.tabIndex).toBe(0);
    expect(i.tabIndex).toBe(-1);
  });

  it("moves the tab stop with ArrowRight, skipping disabled items", async () => {
    const { toolbar, b, i, u } = await mount();
    b.focus();
    key(toolbar, "ArrowRight");
    expect(document.activeElement).toBe(i);
    expect(i.tabIndex).toBe(0);
    expect(b.tabIndex).toBe(-1);
    key(toolbar, "ArrowRight"); // skips disabled D → U
    expect(document.activeElement).toBe(u);
  });

  it("keeps roving navigation after the toolbar is reparented", async () => {
    const { toolbar, b, i } = await mount();
    toolbar.remove();
    document.body.append(toolbar);
    await Promise.resolve();

    b.focus();
    key(toolbar, "ArrowRight");
    expect(document.activeElement).toBe(i);
  });

  it("wraps and supports Home/End", async () => {
    const { toolbar, b, u } = await mount();
    b.focus();
    key(toolbar, "End");
    expect(document.activeElement).toBe(u);
    key(toolbar, "ArrowRight"); // wrap → B
    expect(document.activeElement).toBe(b);
    key(toolbar, "Home");
    expect(document.activeElement).toBe(b);
  });

  it("navigates with the vertical arrows when orientation=vertical", async () => {
    const { toolbar, b, i } = await mount('orientation="vertical"');
    expect(toolbar.getAttribute("aria-orientation")).toBe("vertical");
    b.focus();
    key(toolbar, "ArrowDown");
    expect(document.activeElement).toBe(i);
  });

  it("flips the horizontal arrows under RTL", async () => {
    const { b, i, toolbar } = await mount('dir="rtl"');
    b.focus();
    key(toolbar, "ArrowLeft"); // RTL: ArrowLeft advances
    expect(document.activeElement).toBe(i);
    key(toolbar, "ArrowRight"); // RTL: ArrowRight goes back
    expect(document.activeElement).toBe(b);
  });

  it("wires items that arrive after the connect microtask", async () => {
    document.body.innerHTML = '<ui-toolbar aria-label="Late"></ui-toolbar>';
    const toolbar = document.querySelector("ui-toolbar")!;
    await Promise.resolve(); // wiring attempt runs against the empty host
    toolbar.innerHTML = '<button id="one">One</button><button id="two">Two</button>';
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver retry

    const one = document.querySelector<HTMLButtonElement>("#one")!;
    const two = document.querySelector<HTMLButtonElement>("#two")!;
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(one.tabIndex).toBe(0);
    expect(two.tabIndex).toBe(-1);
    one.focus();
    key(toolbar, "ArrowRight");
    expect(document.activeElement).toBe(two);
  });
});
