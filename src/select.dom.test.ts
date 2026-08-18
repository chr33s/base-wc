// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { SelectChangeDetail } from "./select.ts";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount(attrs = "") {
  document.body.innerHTML = `
    <ui-select name="fruit" ${attrs}>
      <button data-select-trigger><span data-select-value>Choose…</span></button>
      <ui-select-popup>
        <ui-select-option value="apple">Apple</ui-select-option>
        <ui-select-option value="banana">Banana</ui-select-option>
        <ui-select-option value="cherry" disabled>Cherry</ui-select-option>
        <ui-select-option value="date">Date</ui-select-option>
      </ui-select-popup>
    </ui-select>`;
  await Promise.resolve();
  const select = document.querySelector("ui-select")!;
  const trigger = document.querySelector<HTMLButtonElement>("[data-select-trigger]")!;
  const valueEl = document.querySelector<HTMLElement>("[data-select-value]")!;
  const popup = document.querySelector("ui-select-popup")!;
  const options = [...document.querySelectorAll("ui-select-option")];
  return { select, trigger, valueEl, popup, options };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-select", () => {
  it("wires trigger + listbox ARIA on connect", async () => {
    const { trigger, popup, options } = await mount();
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe(popup.id);
    expect(popup.getAttribute("role")).toBe("listbox");
    expect(options.every((o) => o.getAttribute("role") === "option")).toBe(true);
  });

  it("opens on trigger click and activates the first option", async () => {
    const { trigger, popup, options } = await mount();
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(document.activeElement).toBe(popup);
    expect(popup.getAttribute("aria-activedescendant")).toBe(options[0].id);
  });

  it("navigates with arrows, skipping disabled options, and commits on Enter", async () => {
    const { select, trigger, valueEl, popup, options } = await mount();
    const onChange = vi.fn<(detail: SelectChangeDetail) => void>();
    select.addEventListener("change", (e) =>
      onChange((e as CustomEvent<SelectChangeDetail>).detail),
    );
    trigger.click(); // active = Apple
    key(popup, "ArrowDown"); // → Banana
    key(popup, "ArrowDown"); // → Date (skips disabled Cherry)
    expect(popup.getAttribute("aria-activedescendant")).toBe(options[3].id);
    key(popup, "Enter");
    expect(select.value).toBe("date");
    expect(valueEl.textContent).toBe("Date");
    expect(options[3].getAttribute("aria-selected")).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("false"); // closed
    expect(onChange.mock.calls[0][0]).toMatchObject({ value: "date", label: "Date" });
  });

  it("commits on option click", async () => {
    const { select, trigger, valueEl, options } = await mount();
    trigger.click();
    options[1].click(); // Banana
    expect(select.value).toBe("banana");
    expect(valueEl.textContent).toBe("Banana");
  });

  it("jumps with typeahead", async () => {
    const { trigger, popup, options } = await mount();
    trigger.click();
    key(popup, "d"); // → Date
    expect(popup.getAttribute("aria-activedescendant")).toBe(options[3].id);
  });

  it("reflects a preselected option and the value setter", async () => {
    const { select, valueEl, options } = await mount();
    expect(select.value).toBe(null);
    select.value = "banana";
    expect(options[1].getAttribute("aria-selected")).toBe("true");
    expect(valueEl.textContent).toBe("Banana");
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const { trigger, popup } = await mount();
    trigger.click();
    key(popup, "Escape");
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});

describe("ui-select — groups and item indicator", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-select name="city">
        <button data-select-trigger><span data-select-value>Choose…</span></button>
        <ui-select-popup>
          <ui-select-group>
            <ui-select-group-label>Europe</ui-select-group-label>
            <ui-select-option value="lon">London</ui-select-option>
            <ui-select-option value="par">Paris</ui-select-option>
          </ui-select-group>
          <ui-select-group>
            <ui-select-group-label>Asia</ui-select-group-label>
            <ui-select-option value="tyo">Tokyo</ui-select-option>
          </ui-select-group>
        </ui-select-popup>
      </ui-select>`;
    await Promise.resolve();
    const select = document.querySelector<HTMLElement & { value: string | null }>("ui-select")!;
    const trigger = document.querySelector<HTMLButtonElement>("[data-select-trigger]")!;
    const groups = [...document.querySelectorAll("ui-select-group")];
    const options = [...document.querySelectorAll("ui-select-option")];
    return { select, trigger, groups, options };
  }

  it("labels each group from its group-label", async () => {
    const { groups } = await mount();
    for (const g of groups) {
      const label = g.querySelector("ui-select-group-label")!;
      expect(g.getAttribute("role")).toBe("group");
      expect(label.getAttribute("role")).toBe("presentation");
      expect(g.getAttribute("aria-labelledby")).toBe(label.id);
      expect(label.id).toBeTruthy();
    }
  });

  it("navigates options across groups and marks the selected one with data-selected", async () => {
    const { select, trigger, options } = await mount();
    trigger.click();
    const popup = document.querySelector("ui-select-popup")!;
    key(popup, "ArrowDown"); // London → Paris
    key(popup, "ArrowDown"); // Paris → Tokyo (crosses group boundary)
    expect(popup.getAttribute("aria-activedescendant")).toBe(options[2].id);
    key(popup, "Enter");
    expect(select.value).toBe("tyo");
    expect(options[2].hasAttribute("data-selected")).toBe(true);
    expect(options[0].hasAttribute("data-selected")).toBe(false);
  });
});

describe("ui-select — adopts an authored native <select> (no-JS fallback)", () => {
  async function mount(selectAttrs = "") {
    document.body.innerHTML = `
      <form>
        <ui-select name="fruit">
          <select name="fruit" ${selectAttrs}>
            <option value="apple">Apple</option>
            <option value="banana" selected>Banana</option>
            <option value="cherry" disabled>Cherry</option>
          </select>
        </ui-select>
      </form>`;
    await Promise.resolve();
    const form = document.querySelector("form")!;
    const host = document.querySelector<HTMLElement & { value: string | string[] | null }>(
      "ui-select",
    )!;
    const native = document.querySelector<HTMLSelectElement>("select")!;
    return { form, host, native };
  }

  it("the native <select> is the form value, whether or not JS ran", async () => {
    // The submitting control is the authored <select> — present and functional
    // before any upgrade, so a no-JS submit carries its value.
    const { form } = await mount();
    expect(new FormData(form).get("fruit")).toBe("banana");
  });

  it("generates the trigger + listbox from the options and retires the native control", async () => {
    const { host, native } = await mount();
    const trigger = host.querySelector<HTMLButtonElement>("[data-select-trigger]");
    const options = host.querySelectorAll("ui-select-option");
    expect(trigger).toBeTruthy();
    expect(trigger?.type).toBe("button");
    expect(options.length).toBe(3);
    // The native control stays in the DOM (still submits) but is hidden + out of
    // the a11y tree + tab order.
    expect(native.hidden).toBe(true);
    expect(native.getAttribute("aria-hidden")).toBe("true");
    expect(native.tabIndex).toBe(-1);
    // Seeded from the native selection.
    expect(host.value).toBe("banana");
  });

  it("writes a new choice back to the native control so the form submits it", async () => {
    const { form, host } = await mount();
    const trigger = host.querySelector<HTMLButtonElement>("[data-select-trigger]")!;
    const valueEl = host.querySelector<HTMLElement>("[data-select-value]")!;
    trigger.click();
    const apple = [...host.querySelectorAll<HTMLElement>("ui-select-option")].find(
      (o) => o.getAttribute("value") === "apple",
    )!;
    apple.click();
    expect(host.value).toBe("apple");
    expect(valueEl.textContent).toBe("Apple");
    expect(new FormData(form).get("fruit")).toBe("apple"); // submission reflects the choice
  });

  it("fires `change` on the adopted <select> when the user picks (like a real select)", async () => {
    const { host, native } = await mount();
    const onChange = vi.fn<() => void>();
    native.addEventListener("change", onChange);
    const trigger = host.querySelector<HTMLButtonElement>("[data-select-trigger]")!;
    trigger.click();
    const apple = [...host.querySelectorAll<HTMLElement>("ui-select-option")].find(
      (o) => o.getAttribute("value") === "apple",
    )!;
    apple.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(native.value).toBe("apple");
  });

  it("carries the native <select>'s aria-label onto the generated trigger", async () => {
    const { host } = await mount('aria-label="Favourite fruit"');
    const trigger = host.querySelector<HTMLButtonElement>("[data-select-trigger]")!;
    expect(trigger.getAttribute("aria-label")).toBe("Favourite fruit");
  });

  it("redirects a wrapping <label> from the retired <select> to the trigger", async () => {
    document.body.innerHTML = `
      <label>Fruit
        <ui-select name="fruit">
          <select name="fruit"><option value="apple" selected>Apple</option></select>
        </ui-select>
      </label>`;
    await Promise.resolve();
    const host = document.querySelector("ui-select")!;
    const label = document.querySelector("label")!;
    const trigger = host.querySelector<HTMLButtonElement>("[data-select-trigger]")!;
    expect(trigger.id).toBeTruthy();
    expect(label.htmlFor).toBe(trigger.id); // clicking the label now targets the trigger
  });

  it("carries <optgroup> labels into groups", async () => {
    document.body.innerHTML = `
      <ui-select name="city">
        <select name="city">
          <optgroup label="Europe">
            <option value="lon">London</option>
          </optgroup>
          <optgroup label="Asia">
            <option value="tyo" selected>Tokyo</option>
          </optgroup>
        </select>
      </ui-select>`;
    await Promise.resolve();
    const host = document.querySelector("ui-select")!;
    const groups = host.querySelectorAll("ui-select-group");
    expect(groups.length).toBe(2);
    expect(groups[0].querySelector("ui-select-group-label")?.textContent).toBe("Europe");
    expect(groups[0].getAttribute("aria-labelledby")).toBe(
      groups[0].querySelector("ui-select-group-label")?.id,
    );
  });

  it("adopts <select multiple> and writes every choice back to the native control", async () => {
    const { host, native } = await mount("multiple");
    const trigger = host.querySelector<HTMLButtonElement>("[data-select-trigger]")!;
    trigger.click();
    const byValue = (v: string) =>
      [...host.querySelectorAll<HTMLElement>("ui-select-option")].find(
        (o) => o.getAttribute("value") === v,
      )!;
    byValue("apple").click(); // add apple (banana already selected from markup)
    expect(host.value).toEqual(["apple", "banana"]);
    // Both choices are written back to the native control, so submission carries
    // them. (Asserted via `selectedOptions`: happy-dom's FormData only returns the
    // first option of a `<select multiple>` — a test-env limitation, not the DOM.)
    expect([...native.selectedOptions].map((o) => o.value)).toEqual(["apple", "banana"]);
  });
});

describe("ui-select — multiple", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-select name="langs" multiple>
        <button data-select-trigger><span data-select-value>Choose…</span></button>
        <ui-select-popup>
          <ui-select-option value="ts">TypeScript</ui-select-option>
          <ui-select-option value="go">Go</ui-select-option>
          <ui-select-option value="rs">Rust</ui-select-option>
        </ui-select-popup>
      </ui-select>`;
    await Promise.resolve();
    const select = document.querySelector<
      HTMLElement & { value: string | string[] | null; multiple: boolean }
    >("ui-select")!;
    const trigger = document.querySelector<HTMLButtonElement>("[data-select-trigger]")!;
    const valueEl = document.querySelector<HTMLElement>("[data-select-value]")!;
    const popup = document.querySelector("ui-select-popup")!;
    const options = [...document.querySelectorAll<HTMLElement>("ui-select-option")];
    return { select, trigger, valueEl, popup, options };
  }

  it("is a multiselectable listbox", async () => {
    const { popup } = await mount();
    expect(popup.getAttribute("aria-multiselectable")).toBe("true");
  });

  it("forces the trigger to type=button so it never submits a form", async () => {
    const { trigger } = await mount();
    expect((trigger as HTMLButtonElement).type).toBe("button");
  });

  it("toggles options without closing and reports an array value", async () => {
    const { select, trigger, popup, options } = await mount();
    const onChange = vi.fn<(d: SelectChangeDetail) => void>();
    select.addEventListener("change", (e) =>
      onChange((e as CustomEvent<SelectChangeDetail>).detail),
    );
    trigger.click();
    options[0].click(); // TS
    expect(popup.hasAttribute("data-open")).toBe(true); // stays open
    options[2].click(); // Rust
    expect(select.value).toEqual(["ts", "rs"]);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[2].hasAttribute("data-selected")).toBe(true);
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ value: "rs", values: ["ts", "rs"] });
  });

  it("summarizes the selection in the trigger and restores the placeholder", async () => {
    const { trigger, valueEl, options } = await mount();
    trigger.click();
    options[0].click();
    options[1].click();
    expect(valueEl.textContent).toBe("TypeScript, Go"); // DOM order
    options[0].click(); // remove TS
    expect(valueEl.textContent).toBe("Go");
    options[1].click(); // remove Go → empty
    expect(valueEl.textContent).toBe("Choose…"); // placeholder restored
  });

  it("accepts an array via the value setter", async () => {
    const { select, valueEl, options } = await mount();
    select.value = ["go", "rs"];
    expect(options[1].getAttribute("aria-selected")).toBe("true");
    expect(options[2].getAttribute("aria-selected")).toBe("true");
    expect(options[0].getAttribute("aria-selected")).toBe("false");
    expect(valueEl.textContent).toBe("Go, Rust");
  });
});
