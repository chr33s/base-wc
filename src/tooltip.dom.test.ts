// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const pointer = (el: EventTarget, type: "pointerenter" | "pointerleave") =>
  el.dispatchEvent(new Event(type));
const fire = (el: EventTarget, type: string) => el.dispatchEvent(new Event(type));

async function mount(attrs = "") {
  document.body.innerHTML = `
    <ui-tooltip ${attrs}>
      <button data-tooltip-trigger>Help</button>
      <ui-tooltip-content>Explanation</ui-tooltip-content>
    </ui-tooltip>`;
  await Promise.resolve();
  const tooltip = document.querySelector("ui-tooltip")!;
  const trigger = document.querySelector<HTMLButtonElement>("[data-tooltip-trigger]")!;
  const content = document.querySelector("ui-tooltip-content")!;
  return { tooltip, trigger, content };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("ui-tooltip", () => {
  it("wires role=tooltip and aria-describedby", async () => {
    const { trigger, content } = await mount();
    expect(content.getAttribute("role")).toBe("tooltip");
    expect(trigger.getAttribute("aria-describedby")).toBe(content.id);
  });

  it("opens on hover only after the intent delay", async () => {
    const { tooltip, trigger, content } = await mount('delay="600"');
    pointer(trigger, "pointerenter");
    expect(tooltip.open).toBe(false);
    vi.advanceTimersByTime(599);
    expect(tooltip.open).toBe(false);
    vi.advanceTimersByTime(1);
    expect(tooltip.open).toBe(true);
    expect(content.hasAttribute("data-open")).toBe(true);
  });

  it("closes after the close delay on pointer leave", async () => {
    const { tooltip, trigger } = await mount('delay="600" close-delay="300"');
    pointer(trigger, "pointerenter");
    vi.advanceTimersByTime(600);
    expect(tooltip.open).toBe(true);
    pointer(trigger, "pointerleave");
    vi.advanceTimersByTime(299);
    expect(tooltip.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tooltip.open).toBe(false);
  });

  it("opens instantly on keyboard focus and closes on blur", async () => {
    const { tooltip, trigger } = await mount('delay="600"');
    fire(trigger, "focus");
    expect(tooltip.open).toBe(true); // no delay for focus
    fire(trigger, "blur");
    expect(tooltip.open).toBe(false);
  });

  it("dismisses on Escape", async () => {
    const { tooltip, trigger } = await mount();
    fire(trigger, "focus");
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(tooltip.open).toBe(false);
  });

  it("skips the delay for a warm delay-group sibling", async () => {
    document.body.innerHTML = `
      <ui-tooltip group="tips" delay="600" skip-delay="300">
        <button id="ta" data-tooltip-trigger>A</button>
        <ui-tooltip-content>Aa</ui-tooltip-content>
      </ui-tooltip>
      <ui-tooltip group="tips" delay="600" skip-delay="300">
        <button id="tb" data-tooltip-trigger>B</button>
        <ui-tooltip-content>Bb</ui-tooltip-content>
      </ui-tooltip>`;
    await Promise.resolve();
    const [a, b] = [...document.querySelectorAll("ui-tooltip")];
    const ta = document.querySelector<HTMLElement>("#ta")!;
    const tb = document.querySelector<HTMLElement>("#tb")!;

    pointer(ta, "pointerenter");
    vi.advanceTimersByTime(600); // A opens the full delay → group warms
    expect(a.open).toBe(true);
    pointer(ta, "pointerleave");
    vi.advanceTimersByTime(300); // A closes; group stays warm for skip-delay

    pointer(tb, "pointerenter"); // warm → no delay
    vi.advanceTimersByTime(1);
    expect(b.open).toBe(true);
  });
});
