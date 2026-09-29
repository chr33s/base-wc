// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AriaCombobox, type AriaComboboxOptions } from "./combobox-core.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

function setup(overrides: Partial<AriaComboboxOptions> = {}) {
  const host = document.createElement("div");
  const input = document.createElement("input");
  const popup = document.createElement("div");
  const listbox = document.createElement("div");
  listbox.innerHTML = `<div data-index="0" id="opt-0">Zero</div><div data-index="1" id="opt-1">One</div>`;
  popup.append(listbox);
  host.append(input, popup);
  document.body.append(host);
  const handlers = {
    onInput: vi.fn(),
    onClose: vi.fn(),
    onArrowOpen: vi.fn(),
    onNavigate: vi.fn(),
    onOptionCommit: vi.fn(),
  };
  const combobox = new AriaCombobox({
    input,
    popup,
    listbox,
    host,
    idPrefix: "cbt",
    ...handlers,
    ...overrides,
  });
  return { combobox, host, input, popup, listbox, ...handlers };
}

const key = (target: EventTarget, k: string) => {
  const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("AriaCombobox semantics", () => {
  it("puts combobox semantics on the input and an id + role on the listbox", () => {
    const { input, listbox } = setup();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-haspopup")).toBe("listbox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(listbox.id).toMatch(/^cbt-listbox-\d+$/);
    expect(listbox.getAttribute("role")).toBe("listbox");
  });

  it("supports a grid listbox role and keeps an authored listbox id", () => {
    const listbox = document.createElement("div");
    listbox.id = "mine";
    const { input } = setup({ listbox, listboxRole: "grid" });
    expect(listbox.id).toBe("mine");
    expect(listbox.getAttribute("role")).toBe("grid");
    expect(input.getAttribute("aria-haspopup")).toBe("grid");
  });
});

describe("AriaCombobox state", () => {
  it("opens once and closes once, mirroring aria-expanded", () => {
    const { combobox, input } = setup();
    expect(combobox.open).toBe(false);
    expect(combobox.show()).toBe(true);
    expect(combobox.show()).toBe(false);
    expect(combobox.open).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(combobox.hide()).toBe(true);
    expect(combobox.hide()).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("tracks the active option and points aria-activedescendant at it", () => {
    const { combobox, input } = setup();
    combobox.setActive(1, "opt-1");
    expect(combobox.activeIndex).toBe(1);
    expect(input.getAttribute("aria-activedescendant")).toBe("opt-1");
    combobox.setActive(1, null);
    expect(combobox.activeIndex).toBe(-1);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("clears the active option when it closes", () => {
    const { combobox, input } = setup();
    combobox.show();
    combobox.setActive(0, "opt-0");
    combobox.hide();
    expect(combobox.activeIndex).toBe(-1);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });
});

describe("AriaCombobox input policy", () => {
  it("asks to open on an arrow while closed, and leaves other keys alone", () => {
    const { input, onArrowOpen, onNavigate } = setup();
    expect(key(input, "ArrowDown").defaultPrevented).toBe(true);
    expect(onArrowOpen).toHaveBeenCalledWith("list-navigation");
    expect(key(input, "a").defaultPrevented).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("ignores closed-state arrows when onArrowOpen is omitted", () => {
    const { input } = setup({ onArrowOpen: undefined });
    expect(key(input, "ArrowDown").defaultPrevented).toBe(false);
  });

  it("closes on Escape while open and forwards other keys to navigation", () => {
    const { combobox, input, onClose, onNavigate } = setup();
    combobox.show();
    expect(key(input, "Escape").defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledWith("escape-key");
    key(input, "ArrowDown");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("does not let native input/change escape the host", () => {
    const { host, input } = setup();
    const seen = vi.fn();
    host.addEventListener("input", seen);
    host.addEventListener("change", seen);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(seen).not.toHaveBeenCalled();
  });

  it("reports input events to onInput", () => {
    const { input, onInput } = setup();
    input.dispatchEvent(new Event("input"));
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it("closes when focus leaves the host but not when it moves within it", () => {
    const { host, input, onClose } = setup();
    const chip = document.createElement("button");
    host.append(chip);
    input.dispatchEvent(new FocusEvent("blur", { relatedTarget: chip }));
    expect(onClose).not.toHaveBeenCalled();
    input.dispatchEvent(new FocusEvent("blur", { relatedTarget: null }));
    expect(onClose).toHaveBeenCalledWith("focus-out");
  });
});

describe("AriaCombobox listbox", () => {
  it("commits the clicked row by its data-index", () => {
    const { listbox, onOptionCommit } = setup();
    listbox.querySelector<HTMLElement>("#opt-1")?.click();
    expect(onOptionCommit).toHaveBeenCalledWith(1);
    listbox.click();
    expect(onOptionCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps input focus by cancelling mousedown on a row only", () => {
    const { listbox } = setup();
    const row = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    listbox.querySelector("#opt-0")?.dispatchEvent(row);
    expect(row.defaultPrevented).toBe(true);
    const other = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    listbox.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });
});
