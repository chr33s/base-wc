// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount(attrs = 'value="b"') {
  document.body.innerHTML = `
    <ui-tabs ${attrs}>
      <ui-tab-list>
        <button data-tab value="a">A</button>
        <button data-tab value="b">B</button>
        <button data-tab value="c" disabled>C</button>
        <button data-tab value="d">D</button>
      </ui-tab-list>
      <div data-tab-panel value="a">Panel A</div>
      <div data-tab-panel value="b">Panel B</div>
      <div data-tab-panel value="c">Panel C</div>
      <div data-tab-panel value="d">Panel D</div>
    </ui-tabs>`;
  await Promise.resolve();
  const tabs = document.querySelector("ui-tabs")!;
  const list = document.querySelector("ui-tab-list")!;
  const tabEls = [...document.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const panels = [...document.querySelectorAll<HTMLElement>("[data-tab-panel]")];
  return { tabs, list, tabEls, panels };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-tabs", () => {
  it("wires tablist/tab/tabpanel roles and cross-references", async () => {
    const { list, tabEls, panels } = await mount();
    expect(list.getAttribute("role")).toBe("tablist");
    expect(tabEls[0].getAttribute("role")).toBe("tab");
    expect(tabEls[0].getAttribute("aria-controls")).toBe(panels[0].id);
    expect(panels[0].getAttribute("role")).toBe("tabpanel");
    expect(panels[0].getAttribute("aria-labelledby")).toBe(tabEls[0].id);
  });

  it("selects the preset tab and shows only its panel", async () => {
    const { tabs, tabEls, panels } = await mount('value="b"');
    expect(tabs.value).toBe("b");
    expect(tabEls[1].getAttribute("aria-selected")).toBe("true");
    expect(panels[0].hidden).toBe(true);
    expect(panels[1].hidden).toBe(false);
    expect(tabEls[1].tabIndex).toBe(0);
    expect(tabEls[0].tabIndex).toBe(-1);
  });

  it("automatic activation: arrow keys move and select, skipping disabled", async () => {
    const { tabs, list, tabEls, panels } = await mount('value="b"');
    tabEls[1].focus(); // B
    key(list, "ArrowRight"); // → D (skips disabled C)
    expect(document.activeElement).toBe(tabEls[3]);
    expect(tabs.value).toBe("d");
    expect(panels[3].hidden).toBe(false);
  });

  it("manual activation only selects on Enter/Space", async () => {
    const { tabs, list, tabEls } = await mount('value="a" activation="manual"');
    tabEls[0].focus();
    key(list, "ArrowRight"); // moves focus to B but does not select
    expect(document.activeElement).toBe(tabEls[1]);
    expect(tabs.value).toBe("a");
    key(list, "Enter");
    expect(tabs.value).toBe("b");
  });

  it("selects on click and emits change", async () => {
    const { tabs, tabEls } = await mount('value="a"');
    const onChange = vi.fn<(detail: { value: string }) => void>();
    tabs.addEventListener("change", (e) => onChange((e as CustomEvent<{ value: string }>).detail));
    tabEls[3].click();
    expect(tabs.value).toBe("d");
    expect(onChange.mock.calls[0][0]).toEqual({ value: "d" });
  });
});
