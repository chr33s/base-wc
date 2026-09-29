// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { define } from "./define.ts";
import { HoverCardElement } from "./hover-card.ts";
import { overlay, type Overlay } from "./overlay.ts";
import { UIPopupElement } from "./popup.ts";
import "./elements.ts";
import { must } from "./test-utils.ts";

/** Minimal concrete card: hover the trigger to open, leave to close. */
class TestHoverCard extends HoverCardElement {
  protected override parts(): readonly [HTMLElement, HTMLElement] | null {
    const trigger = this.querySelector<HTMLElement>("button");
    const surface = this.querySelector<HTMLElement>("test-hover-card-surface");
    return trigger && surface ? [trigger, surface] : null;
  }

  protected override listen(trigger: HTMLElement) {
    trigger.addEventListener("pointerenter", () => this.intent?.scheduleOpen());
    trigger.addEventListener("pointerleave", () => this.intent?.scheduleClose());
  }

  protected override createOverlay(trigger: HTMLElement, surface: HTMLElement): Overlay {
    return overlay(surface, { anchor: { ref: () => trigger, pair: "test" }, events: this });
  }
}
class TestHoverCardSurface extends UIPopupElement {}
define("test-hover-card", TestHoverCard);
define("test-hover-card-surface", TestHoverCardSurface);

/** The value, or a failure naming the missing element. */
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function mount(attrs = "", id = "one") {
  const host = document.createElement("test-hover-card");
  host.id = id;
  for (const pair of attrs.split(" ").filter(Boolean)) {
    const [name = "", value = ""] = pair.split("=");
    host.setAttribute(name, value);
  }
  host.innerHTML = `<button>trigger</button><test-hover-card-surface>body</test-hover-card-surface>`;
  document.body.append(host);
  await vi.advanceTimersByTimeAsync(0);
  return { host: host as TestHoverCard, trigger: must(host.querySelector("button")) };
}

const enter = (el: Element) => el.dispatchEvent(new PointerEvent("pointerenter"));
const leave = (el: Element) => el.dispatchEvent(new PointerEvent("pointerleave"));

describe("HoverCardElement", () => {
  it("is closed until the intent delay elapses (default 600ms)", async () => {
    const { host, trigger } = await mount();
    expect(host.open).toBe(false);
    enter(trigger);
    vi.advanceTimersByTime(599);
    expect(host.open).toBe(false);
    vi.advanceTimersByTime(1);
    expect(host.open).toBe(true);
  });

  it("honours the delay and close-delay attributes", async () => {
    const { host, trigger } = await mount("delay=10 close-delay=20");
    enter(trigger);
    vi.advanceTimersByTime(10);
    expect(host.open).toBe(true);
    leave(trigger);
    vi.advanceTimersByTime(19);
    expect(host.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(host.open).toBe(false);
  });

  it("falls back to defaults for an unparsable delay", async () => {
    const { host, trigger } = await mount("delay=soon");
    enter(trigger);
    vi.advanceTimersByTime(599);
    expect(host.open).toBe(false);
    vi.advanceTimersByTime(1);
    expect(host.open).toBe(true);
  });

  it("opens instantly for a sibling in a warm delay group, then cools down", async () => {
    const a = await mount("group=hc delay=100 skip-delay=50", "a");
    enter(a.trigger);
    vi.advanceTimersByTime(100);
    expect(a.host.open).toBe(true);
    leave(a.trigger);
    vi.advanceTimersByTime(300);
    expect(a.host.open).toBe(false);

    const b = await mount("group=hc delay=100 skip-delay=50", "b");
    enter(b.trigger);
    vi.advanceTimersByTime(0);
    expect(b.host.open).toBe(true);

    leave(b.trigger);
    vi.advanceTimersByTime(300 + 50);
    const c = await mount("group=hc delay=100", "c");
    enter(c.trigger);
    vi.advanceTimersByTime(99);
    expect(c.host.open).toBe(false);
  });

  it("cancels pending work and closes when removed from the document", async () => {
    const { host, trigger } = await mount("delay=10");
    enter(trigger);
    host.remove();
    vi.advanceTimersByTime(1000);
    expect(host.open).toBe(false);
  });
});
