// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-toggle (standalone)", () => {
  function mount(attrs = "") {
    document.body.innerHTML = `<ui-toggle value="bold" ${attrs}>B</ui-toggle>`;
    return document.querySelector("ui-toggle")!;
  }

  it("is an aria-pressed button, unpressed and focusable", () => {
    const el = mount();
    expect(el.getAttribute("role")).toBe("button");
    expect(el.getAttribute("aria-pressed")).toBe("false");
    expect(el.tabIndex).toBe(0);
  });

  it("flips on click and Space and emits change", () => {
    const el = mount();
    const onChange = vi.fn<(detail: { pressed: boolean }) => void>();
    el.addEventListener("change", (e) => onChange((e as CustomEvent<{ pressed: boolean }>).detail));
    el.click();
    expect(el.pressed).toBe(true);
    expect(el.getAttribute("aria-pressed")).toBe("true");
    expect(el.getAttribute("data-state")).toBe("on");
    key(el, " ");
    expect(el.pressed).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does nothing when disabled", () => {
    const el = mount("disabled");
    el.click();
    expect(el.pressed).toBe(false);
    expect(el.tabIndex).toBe(-1);
  });
});

describe("ui-toggle-group", () => {
  async function mount(attrs = "") {
    document.body.innerHTML = `
      <ui-toggle-group ${attrs}>
        <ui-toggle value="bold">B</ui-toggle>
        <ui-toggle value="italic">I</ui-toggle>
        <ui-toggle value="underline">U</ui-toggle>
      </ui-toggle-group>`;
    await Promise.resolve();
    const group = document.querySelector("ui-toggle-group")!;
    const toggles = [...document.querySelectorAll("ui-toggle")];
    return { group, toggles };
  }

  it("keeps a single roving tab stop", async () => {
    const { toggles } = await mount();
    expect(toggles[0].tabIndex).toBe(0);
    expect(toggles[1].tabIndex).toBe(-1);
  });

  it("single-select: pressing one releases the others", async () => {
    const { group, toggles } = await mount();
    toggles[0].click();
    expect(toggles[0].pressed).toBe(true);
    expect(group.value).toBe("bold");
    toggles[1].click();
    expect(toggles[0].pressed).toBe(false);
    expect(toggles[1].pressed).toBe(true);
    expect(group.value).toBe("italic");
    toggles[1].click(); // deselect
    expect(toggles[1].pressed).toBe(false);
    expect(group.value).toBe(null);
  });

  it("arrow keys move focus without activating; Space activates", async () => {
    const { group, toggles } = await mount();
    toggles[0].focus();
    key(group, "ArrowRight");
    expect(document.activeElement).toBe(toggles[1]);
    expect(toggles[1].pressed).toBe(false); // navigation ≠ activation
    key(group, " ");
    expect(toggles[1].pressed).toBe(true);
    expect(group.value).toBe("italic");
  });

  it("prevents Space's default action on activate so the page doesn't scroll", async () => {
    const { group, toggles } = await mount();
    toggles[0].focus();
    const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    group.dispatchEvent(e);
    // The grouped toggle defers keys to the group's roving; roving must suppress
    // the default Space action (page scroll) itself.
    expect(e.defaultPrevented).toBe(true);
    expect(toggles[0].pressed).toBe(true);
  });

  it("multiple-select keeps several pressed and reports an array", async () => {
    const { group, toggles } = await mount("multiple");
    toggles[0].click();
    toggles[2].click();
    expect(toggles[0].pressed).toBe(true);
    expect(toggles[2].pressed).toBe(true);
    expect(group.value).toEqual(["bold", "underline"]);
  });
});
