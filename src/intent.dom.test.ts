// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  closeGroup,
  hoverIntent,
  isGroupWarm,
  onPointerMoved,
  openGroup,
  type HoverIntentOptions,
} from "./intent.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function surface(overrides: Partial<HoverIntentOptions> = {}) {
  const state = { open: false };
  const options: HoverIntentOptions = {
    isOpen: () => state.open,
    open: () => {
      state.open = true;
    },
    close: () => {
      state.open = false;
    },
    openDelay: () => 100,
    closeDelay: () => 50,
    ...overrides,
  };
  return { state, intent: hoverIntent(options) };
}

describe("hoverIntent", () => {
  it("opens after the open delay, not before", () => {
    const { state, intent } = surface();
    intent.scheduleOpen();
    vi.advanceTimersByTime(99);
    expect(state.open).toBe(false);
    vi.advanceTimersByTime(1);
    expect(state.open).toBe(true);
  });

  it("skips the open delay when the delay group is warm", () => {
    const { state, intent } = surface({ warm: () => true });
    intent.scheduleOpen();
    vi.advanceTimersByTime(0);
    expect(state.open).toBe(true);
  });

  it("closes after the close delay and only while open", () => {
    const { state, intent } = surface();
    intent.scheduleClose();
    vi.advanceTimersByTime(1000);
    expect(state.open).toBe(false);

    intent.openNow();
    intent.scheduleClose();
    vi.advanceTimersByTime(49);
    expect(state.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(state.open).toBe(false);
  });

  it("leaving cancels a pending open", () => {
    const { state, intent } = surface();
    intent.scheduleOpen();
    intent.scheduleClose();
    vi.advanceTimersByTime(1000);
    expect(state.open).toBe(false);
  });

  it("cancelClose keeps an open surface open", () => {
    const { state, intent } = surface();
    intent.openNow();
    intent.scheduleClose();
    intent.cancelClose();
    vi.advanceTimersByTime(1000);
    expect(state.open).toBe(true);
  });

  it("cancelOpen drops a pending open", () => {
    const { state, intent } = surface();
    intent.scheduleOpen();
    intent.cancelOpen();
    vi.advanceTimersByTime(1000);
    expect(state.open).toBe(false);
  });

  it("openNow and closeNow act immediately and cancel the opposite timer", () => {
    const { state, intent } = surface();
    intent.scheduleOpen();
    intent.closeNow();
    expect(state.open).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(state.open).toBe(false);

    intent.openNow();
    expect(state.open).toBe(true);
  });

  it("cancel clears both timers", () => {
    const { state, intent } = surface();
    intent.scheduleOpen();
    intent.cancel();
    vi.advanceTimersByTime(1000);
    expect(state.open).toBe(false);
  });

  it("ignores an enter while disarmed until the pointer leaves", () => {
    const { state, intent } = surface({ armed: false });
    intent.scheduleOpen();
    vi.advanceTimersByTime(1000);
    expect(state.open).toBe(false);

    intent.scheduleClose(); // pointer left: re-arm
    intent.scheduleOpen();
    vi.advanceTimersByTime(100);
    expect(state.open).toBe(true);
  });

  it("reads delays per schedule so live attributes apply", () => {
    let delay = 100;
    const { state, intent } = surface({ openDelay: () => delay });
    delay = 10;
    intent.scheduleOpen();
    vi.advanceTimersByTime(10);
    expect(state.open).toBe(true);
  });
});

describe("delay groups", () => {
  it("is cold for unknown and ungrouped names", () => {
    expect(isGroupWarm(null)).toBe(false);
    expect(isGroupWarm("intent-cold")).toBe(false);
  });

  it("warms on open and stays warm through the cooldown after close", () => {
    openGroup("intent-a");
    expect(isGroupWarm("intent-a")).toBe(true);

    closeGroup("intent-a", 300);
    vi.advanceTimersByTime(299);
    expect(isGroupWarm("intent-a")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isGroupWarm("intent-a")).toBe(false);
  });

  it("reopening during the cooldown cancels the cool-down", () => {
    openGroup("intent-b");
    closeGroup("intent-b", 100);
    openGroup("intent-b");
    vi.advanceTimersByTime(1000);
    expect(isGroupWarm("intent-b")).toBe(true);
  });

  it("treats null names as a no-op", () => {
    openGroup(null);
    closeGroup(null, 10);
    expect(isGroupWarm(null)).toBe(false);
  });
});

describe("onPointerMoved", () => {
  const move = (target: EventTarget, x: number, y: number) =>
    target.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y }));

  it("reports moves that change coordinates and drops repeats", () => {
    const target = document.createElement("div");
    const handler = vi.fn();
    onPointerMoved(target, handler);
    move(target, 5, 5);
    move(target, 5, 5);
    move(target, 6, 5);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("stops listening after the returned dispose", () => {
    const target = document.createElement("div");
    const handler = vi.fn();
    const dispose = onPointerMoved(target, handler);
    dispose();
    move(target, 1, 1);
    expect(handler).not.toHaveBeenCalled();
  });
});
