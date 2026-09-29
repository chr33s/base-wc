// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";
import { must } from "./test-utils.ts";

/** The value, or a failure naming the missing element. */
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function mount() {
  document.body.innerHTML = `
    <ui-context-menu>
      <div data-context-target>Right-click me</div>
      <ui-menu>
        <ui-menu-popup>
          <ui-menu-item value="cut">Cut</ui-menu-item>
          <ui-menu-item value="copy">Copy</ui-menu-item>
        </ui-menu-popup>
      </ui-menu>
    </ui-context-menu>`;
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
  return {
    host: must(document.querySelector("ui-context-menu")),
    target: must(document.querySelector<HTMLElement>("[data-context-target]")),
    menu: must(document.querySelector("ui-menu")),
  };
}

const touch = (type: string, target: EventTarget) =>
  target.dispatchEvent(
    new PointerEvent(type, { pointerType: "touch", clientX: 10, clientY: 20, bubbles: true }),
  );

describe("ui-context-menu", () => {
  it("opens the inner menu on contextmenu and blocks the native one", async () => {
    const { target, menu } = await mount();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(menu.open).toBe(true);
  });

  it("opens on a touch long-press after 500ms", async () => {
    const { target, menu } = await mount();
    touch("pointerdown", target);
    vi.advanceTimersByTime(499);
    expect(menu.open).toBe(false);
    vi.advanceTimersByTime(1);
    expect(menu.open).toBe(true);
  });

  it("cancels the long-press when the finger lifts or moves", async () => {
    const { target, menu } = await mount();
    touch("pointerdown", target);
    touch("pointerup", target);
    vi.advanceTimersByTime(1000);
    expect(menu.open).toBe(false);

    touch("pointerdown", target);
    touch("pointermove", target);
    vi.advanceTimersByTime(1000);
    expect(menu.open).toBe(false);
  });

  it("does not long-press for a mouse pointer", async () => {
    const { target, menu } = await mount();
    target.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(menu.open).toBe(false);
  });

  it("drops a long-press in flight when removed from the document", async () => {
    const { host, target, menu } = await mount();
    touch("pointerdown", target);
    host.remove();
    vi.advanceTimersByTime(1000);
    expect(menu.open).toBe(false);
  });

  it("falls back to the host itself when there is no [data-context-target]", async () => {
    document.body.innerHTML = `
      <ui-context-menu>
        <ui-menu><ui-menu-popup><ui-menu-item value="a">A</ui-menu-item></ui-menu-popup></ui-menu>
      </ui-context-menu>`;
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    const host = must(document.querySelector("ui-context-menu"));
    host.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(must(document.querySelector("ui-menu")).open).toBe(true);
  });
});
