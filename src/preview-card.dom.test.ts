// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const pointer = (el: EventTarget, type: "pointerenter" | "pointerleave") =>
  el.dispatchEvent(new Event(type));

async function mount() {
  document.body.innerHTML = `
    <ui-preview-card delay="600" close-delay="300">
      <a href="#" data-preview-trigger>@ada</a>
      <ui-preview-card-content><a href="#" id="follow">Follow</a></ui-preview-card-content>
    </ui-preview-card>`;
  await Promise.resolve();
  const card = document.querySelector("ui-preview-card")!;
  const trigger = document.querySelector<HTMLElement>("[data-preview-trigger]")!;
  const content = document.querySelector("ui-preview-card-content")!;
  return { card, trigger, content };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("ui-preview-card", () => {
  it("wires aria-controls/expanded on the trigger", async () => {
    const { trigger, content } = await mount();
    expect(trigger.getAttribute("aria-controls")).toBe(content.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on hover after the delay", async () => {
    const { card, trigger } = await mount();
    pointer(trigger, "pointerenter");
    vi.advanceTimersByTime(600);
    expect(card.open).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("stays open when the pointer moves from trigger into the card", async () => {
    const { card, trigger, content } = await mount();
    pointer(trigger, "pointerenter");
    vi.advanceTimersByTime(600);
    pointer(trigger, "pointerleave"); // would close…
    pointer(content, "pointerenter"); // …but entering the card cancels it
    vi.advanceTimersByTime(300);
    expect(card.open).toBe(true);
    pointer(content, "pointerleave"); // now leave the card
    vi.advanceTimersByTime(300);
    expect(card.open).toBe(false);
  });

  it("dismisses on Escape from within the card", async () => {
    const { card, trigger, content } = await mount();
    pointer(trigger, "pointerenter");
    vi.advanceTimersByTime(600);
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(card.open).toBe(false);
  });
});
