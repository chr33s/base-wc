// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { getFocusable, trapFocus } from "./focus-trap.ts";

const tab = (shiftKey = false) =>
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true }),
  );

function mount() {
  document.body.innerHTML = `
    <button id="before">before</button>
    <div id="trap">
      <button id="a">a</button>
      <button id="b">b</button>
      <button id="c">c</button>
    </div>`;
  const before = document.querySelector<HTMLButtonElement>("#before")!;
  const container = document.querySelector<HTMLElement>("#trap")!;
  const [a, , c] = [...container.querySelectorAll<HTMLButtonElement>("button")];
  return { before, container, a, c };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("focus trap", () => {
  it("lists tabbable descendants, skipping disabled/hidden/inert", () => {
    document.body.innerHTML = `
      <div id="r">
        <button>ok</button>
        <button disabled>no</button>
        <button hidden>no</button>
        <div inert><button>no</button></div>
        <input />
      </div>`;
    const labels = getFocusable(document.querySelector("#r")!).map((el) =>
      el.tagName.toLowerCase(),
    );
    expect(labels).toEqual(["button", "input"]);
  });

  it("moves initial focus into the container", () => {
    const { container, a } = mount();
    const release = trapFocus(container);
    expect(document.activeElement).toBe(a);
    release();
  });

  it("honours an explicit initialFocus", () => {
    const { container, c } = mount();
    const release = trapFocus(container, { initialFocus: c });
    expect(document.activeElement).toBe(c);
    release();
  });

  it("wraps forward Tab from the last element to the first", () => {
    const { container, a, c } = mount();
    const release = trapFocus(container);
    c.focus();
    tab();
    expect(document.activeElement).toBe(a);
    release();
  });

  it("wraps backward Shift+Tab from the first element to the last", () => {
    const { container, a, c } = mount();
    const release = trapFocus(container);
    a.focus();
    tab(true);
    expect(document.activeElement).toBe(c);
    release();
  });

  it("restores focus to the previously-focused element on release", () => {
    const { before, container } = mount();
    before.focus();
    const release = trapFocus(container);
    expect(document.activeElement).not.toBe(before);
    release();
    expect(document.activeElement).toBe(before);
  });

  it("release(false) detaches the trap without restoring focus", () => {
    const { before, container, a, c } = mount();
    before.focus();
    const release = trapFocus(container);
    expect(document.activeElement).toBe(a);
    release(false);
    // Focus is NOT pulled back to `before` (the caller owns focus here)…
    expect(document.activeElement).not.toBe(before);
    // …and the document-level keydown listener is gone, so Tab no longer wraps
    // (this is the leak that would otherwise hijack Tab page-wide).
    c.focus();
    const e = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
