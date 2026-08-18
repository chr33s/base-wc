// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-checkbox (enhances a native checkbox)", () => {
  async function mount(inputAttrs = "") {
    document.body.innerHTML = `<form><ui-checkbox><input type="checkbox" name="tos" value="agreed" ${inputAttrs} /></ui-checkbox></form>`;
    await Promise.resolve();
    const form = document.querySelector("form")!;
    const el = document.querySelector("ui-checkbox")!;
    const input = document.querySelector<HTMLInputElement>("input")!;
    return { form, el, input };
  }

  it("mirrors the native checked state and is not itself a form control", async () => {
    const { el, input } = await mount("checked");
    expect(el.checked).toBe(true);
    expect(el.getAttribute("data-state")).toBe("checked");
    expect(el.getAttribute("role")).toBe(null);
    expect(input.getAttribute("role")).toBe(null); // stays a plain checkbox
  });

  it("the native checkbox is the form value, with or without JS", async () => {
    const { form, input } = await mount();
    expect(new FormData(form).get("tos")).toBe(null);
    input.checked = true;
    expect(new FormData(form).get("tos")).toBe("agreed");
  });

  it("mirrors the indeterminate state from the native control", async () => {
    const { el, input } = await mount();
    input.indeterminate = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(el.getAttribute("data-state")).toBe("indeterminate");
    expect(el.indeterminate).toBe(true);
  });

  it("reflects a programmatic change signalled via an input event", async () => {
    // Property setters (and `indeterminate`) fire no event; a host that mutates
    // the control programmatically signals it with a dispatched `input` event.
    const { el, input } = await mount();
    input.checked = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(el.getAttribute("data-state")).toBe("checked");
    input.checked = false;
    input.indeterminate = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(el.getAttribute("data-state")).toBe("indeterminate");
  });

  it("no-ops without an authored native control", async () => {
    document.body.innerHTML = `<ui-checkbox></ui-checkbox>`;
    await Promise.resolve();
    const el = document.querySelector("ui-checkbox")!;
    expect(el.checked).toBe(false);
    expect(el.getAttribute("data-state")).toBe(null);
  });
});

describe("ui-checkbox-group (select-all master over native children)", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-checkbox-group>
        <ui-checkbox data-checkbox-all><input type="checkbox" /></ui-checkbox>
        <ui-checkbox><input type="checkbox" name="scope" value="a" /></ui-checkbox>
        <ui-checkbox><input type="checkbox" name="scope" value="b" /></ui-checkbox>
        <ui-checkbox><input type="checkbox" name="scope" value="c" /></ui-checkbox>
      </ui-checkbox-group>`;
    await Promise.resolve();
    const boxes = [...document.querySelectorAll("ui-checkbox")];
    const master = boxes[0];
    const children = boxes.slice(1);
    const inputOf = (box: Element) => box.querySelector<HTMLInputElement>("input")!;
    return { master, children, inputOf };
  }

  it("starts with the master unchecked when no child is checked", async () => {
    const { master } = await mount();
    expect(master.getAttribute("data-state")).toBe("unchecked");
  });

  it("derives an indeterminate master when only some children are checked", async () => {
    const { master, children, inputOf } = await mount();
    inputOf(children[0]).click();
    expect(master.getAttribute("data-state")).toBe("indeterminate");
  });

  it("derives a checked master when every child is checked", async () => {
    const { master, children, inputOf } = await mount();
    for (const child of children) inputOf(child).click();
    expect(master.getAttribute("data-state")).toBe("checked");
  });

  it("pushing the master checks and unchecks every child", async () => {
    const { master, children, inputOf } = await mount();
    inputOf(master).click(); // was unchecked → check all
    expect(children.every((c) => inputOf(c).checked)).toBe(true);
    expect(master.getAttribute("data-state")).toBe("checked");
    inputOf(master).click(); // → uncheck all
    expect(children.every((c) => inputOf(c).checked)).toBe(false);
    expect(master.getAttribute("data-state")).toBe("unchecked");
  });

  it("clicking a partial master reached from all-checked selects all (not clears)", async () => {
    const { master, children, inputOf } = await mount();
    for (const child of children) inputOf(child).click(); // all checked → master checked
    inputOf(children[0]).click(); // uncheck one → master indeterminate
    expect(master.getAttribute("data-state")).toBe("indeterminate");
    // A native indeterminate checkbox toggles from its underlying `checked`; the
    // master must have normalized `checked` to false so this click selects all.
    inputOf(master).click();
    expect(children.every((c) => inputOf(c).checked)).toBe(true);
    expect(master.getAttribute("data-state")).toBe("checked");
  });
});
