// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { listNav, type ListNavOptions } from "./list-nav.ts";

const LABELS = ["Apple", "Banana", "Blueberry", "Cherry"];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function keydown(key: string) {
  return new KeyboardEvent("keydown", { key, cancelable: true });
}

function setup(overrides: Partial<ListNavOptions> = {}, start = -1) {
  const state = { active: start };
  const onActive = vi.fn((index: number) => {
    state.active = index;
  });
  const nav = listNav({
    count: () => LABELS.length,
    activeIndex: () => state.active,
    onActive,
    ...overrides,
  });
  return { state, onActive, nav };
}

describe("listNav arrows", () => {
  it("enters the list at its ends when nothing is active", () => {
    const down = setup();
    down.nav.handle(keydown("ArrowDown"));
    expect(down.state.active).toBe(0);

    const up = setup();
    up.nav.handle(keydown("ArrowUp"));
    expect(up.state.active).toBe(LABELS.length - 1);
  });

  it("steps and prevents the default scroll", () => {
    const { state, nav } = setup({}, 1);
    const event = keydown("ArrowDown");
    expect(nav.handle(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(state.active).toBe(2);
  });

  it("loops by default and clamps when loop is false", () => {
    const looping = setup({}, LABELS.length - 1);
    looping.nav.handle(keydown("ArrowDown"));
    expect(looping.state.active).toBe(0);

    const clamped = setup({ loop: false }, LABELS.length - 1);
    clamped.nav.handle(keydown("ArrowDown"));
    expect(clamped.state.active).toBe(LABELS.length - 1);
  });

  it("uses the horizontal axis and swaps arrows under rtl", () => {
    const ltr = setup({ orientation: () => "horizontal" }, 0);
    ltr.nav.handle(keydown("ArrowRight"));
    expect(ltr.state.active).toBe(1);

    const rtl = setup({ orientation: () => "horizontal", rtl: () => true }, 1);
    rtl.nav.handle(keydown("ArrowLeft"));
    expect(rtl.state.active).toBe(2);
  });

  it("ignores vertical arrows on a horizontal list", () => {
    const { nav, onActive } = setup({ orientation: () => "horizontal" }, 0);
    expect(nav.handle(keydown("ArrowDown"))).toBe(false);
    expect(onActive).not.toHaveBeenCalled();
  });

  it("does nothing on an empty list", () => {
    const { nav, onActive } = setup({ count: () => 0 });
    expect(nav.handle(keydown("ArrowDown"))).toBe(false);
    expect(onActive).not.toHaveBeenCalled();
  });
});

describe("listNav Home, End and paging", () => {
  it("jumps to the ends", () => {
    const { state, nav } = setup({}, 1);
    nav.handle(keydown("End"));
    expect(state.active).toBe(LABELS.length - 1);
    nav.handle(keydown("Home"));
    expect(state.active).toBe(0);
  });

  it("leaves Home/End alone when homeEnd is false", () => {
    const { nav, onActive } = setup({ homeEnd: false }, 1);
    expect(nav.handle(keydown("Home"))).toBe(false);
    expect(onActive).not.toHaveBeenCalled();
  });

  it("pages by the requested rows, clamped to the list", () => {
    const { state, nav } = setup({ page: () => 3 }, 0);
    nav.handle(keydown("PageDown"));
    expect(state.active).toBe(3);
    nav.handle(keydown("PageDown"));
    expect(state.active).toBe(3);
    nav.handle(keydown("PageUp"));
    expect(state.active).toBe(0);
  });
});

describe("listNav commit, cancel and tab", () => {
  it("commits the active item on Enter, but not when none is active", () => {
    const onCommit = vi.fn();
    const active = setup({ onCommit }, 2);
    const event = keydown("Enter");
    expect(active.nav.handle(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(onCommit).toHaveBeenCalledWith(2);

    const none = setup({ onCommit }, -1);
    expect(none.nav.handle(keydown("Enter"))).toBe(false);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape with the default prevented", () => {
    const onCancel = vi.fn();
    const { nav } = setup({ onCancel });
    const event = keydown("Escape");
    expect(nav.handle(event)).toBe(true);
    expect(onCancel).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reports Tab without preventing it", () => {
    const onTab = vi.fn();
    const { nav } = setup({ onTab });
    const event = keydown("Tab");
    expect(nav.handle(event)).toBe(true);
    expect(onTab).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("listNav typeahead", () => {
  const label = (index: number) => LABELS[index] ?? "";

  it("jumps to the next item whose label starts with the typed text", () => {
    const { state, nav } = setup({ label }, 0);
    nav.handle(keydown("b"));
    expect(state.active).toBe(1);
    nav.handle(keydown("l"));
    expect(state.active).toBe(2);
  });

  it("forgets the search after the timeout", () => {
    const { state, nav } = setup({ label }, 0);
    nav.handle(keydown("b"));
    vi.advanceTimersByTime(600);
    nav.handle(keydown("c"));
    expect(state.active).toBe(3);
  });

  it("is case-insensitive", () => {
    const { state, nav } = setup({ label }, 0);
    nav.handle(keydown("C"));
    expect(state.active).toBe(3);
  });

  it("uses Space to commit when idle and to extend a search otherwise", () => {
    const onCommit = vi.fn();
    const idle = setup({ label, onCommit }, 1);
    idle.nav.handle(keydown(" "));
    expect(onCommit).toHaveBeenCalledWith(1);

    const searching = setup({ label: (i) => ["a b", "a c"][i] ?? "", count: () => 2, onCommit }, 0);
    searching.nav.handle(keydown("a"));
    searching.nav.handle(keydown(" "));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
