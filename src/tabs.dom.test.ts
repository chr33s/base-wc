// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";
import { key, must } from "./test-utils.ts";

/** Narrow an indexed lookup the fixture guarantees is present. */
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
  const tabs = must(document.querySelector("ui-tabs"));
  const list = must(document.querySelector("ui-tab-list"));
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
    expect(must(tabEls[0]).getAttribute("role")).toBe("tab");
    expect(must(tabEls[0]).getAttribute("aria-controls")).toBe(must(panels[0]).id);
    expect(must(panels[0]).getAttribute("role")).toBe("tabpanel");
    expect(must(panels[0]).getAttribute("aria-labelledby")).toBe(must(tabEls[0]).id);
  });

  it("selects the preset tab and shows only its panel", async () => {
    const { tabs, tabEls, panels } = await mount('value="b"');
    expect(tabs.value).toBe("b");
    expect(must(tabEls[1]).getAttribute("aria-selected")).toBe("true");
    expect(must(panels[0]).hidden).toBe(true);
    expect(must(panels[1]).hidden).toBe(false);
    expect(must(tabEls[1]).tabIndex).toBe(0);
    expect(must(tabEls[0]).tabIndex).toBe(-1);
  });

  it("automatic activation: arrow keys move and select, skipping disabled", async () => {
    const { tabs, list, tabEls, panels } = await mount('value="b"');
    must(tabEls[1]).focus(); // B
    key(list, "ArrowRight"); // → D (skips disabled C)
    expect(document.activeElement).toBe(tabEls[3]);
    expect(tabs.value).toBe("d");
    expect(must(panels[3]).hidden).toBe(false);
  });

  it("manual activation only selects on Enter/Space", async () => {
    const { tabs, list, tabEls } = await mount('value="a" activation="manual"');
    must(tabEls[0]).focus();
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
    must(tabEls[3]).click();
    expect(tabs.value).toBe("d");
    expect(must(onChange.mock.calls[0])[0]).toEqual({ value: "d" });
  });

  it("leaves a nested ui-tabs' tabs and panels to the nested instance", async () => {
    document.body.innerHTML = `
      <ui-tabs id="outer" value="one">
        <ui-tab-list>
          <button data-tab value="one">One</button>
          <button data-tab value="two">Two</button>
        </ui-tab-list>
        <div data-tab-panel value="one">
          <ui-tabs id="inner" value="a">
            <ui-tab-list>
              <button data-tab value="a">A</button>
              <button data-tab value="b">B</button>
            </ui-tab-list>
            <div data-tab-panel value="a" id="inner-a">Inner A</div>
            <div data-tab-panel value="b" id="inner-b">Inner B</div>
          </ui-tabs>
        </div>
        <div data-tab-panel value="two">Outer two</div>
      </ui-tabs>`;
    await Promise.resolve();
    const outer = must(document.querySelector<HTMLElement & { value: string | null }>("#outer"));
    const inner = must(document.querySelector<HTMLElement & { value: string | null }>("#inner"));
    const outerTabs = [
      ...must(outer.querySelectorAll<HTMLButtonElement>("ui-tab-list")[0]).children,
    ];
    const innerA = must(document.querySelector<HTMLElement>("#inner-a"));
    const innerB = must(document.querySelector<HTMLElement>("#inner-b"));

    // Re-selecting on the outer tabs must not hide the nested panels whose
    // values don't match the outer selection.
    (outerTabs[1] as HTMLElement).click();
    (outerTabs[0] as HTMLElement).click();
    expect(outer.value).toBe("one");
    expect(innerA.hidden).toBe(false);
    expect(innerB.hidden).toBe(true);

    // Selecting inside the nested tabs stays inside it.
    must(inner.querySelector<HTMLButtonElement>("[data-tab][value='b']")).click();
    expect(inner.value).toBe("b");
    expect(innerB.hidden).toBe(false);
    expect(outer.value).toBe("one");
  });

  it("wires children that arrive after the connect microtask", async () => {
    document.body.innerHTML = "<ui-tabs></ui-tabs>";
    const tabs = must(document.querySelector("ui-tabs"));
    await Promise.resolve(); // wiring attempt runs against the empty host
    tabs.innerHTML = `
      <ui-tab-list>
        <button data-tab value="late">Late</button>
      </ui-tab-list>
      <div data-tab-panel value="late">Late panel</div>`;
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver retry

    expect(must(tabs.querySelector("ui-tab-list")).getAttribute("role")).toBe("tablist");
    expect(tabs.value).toBe("late");
    expect(must(tabs.querySelector<HTMLElement>("[data-tab-panel]")).hidden).toBe(false);
  });

  it("positions an indicator over the selected tab", async () => {
    document.body.innerHTML = `
      <ui-tabs value="a">
        <ui-tab-list>
          <button data-tab value="a">A</button>
          <button data-tab value="b">B</button>
          <ui-tab-indicator></ui-tab-indicator>
        </ui-tab-list>
        <div data-tab-panel value="a">A</div>
        <div data-tab-panel value="b">B</div>
      </ui-tabs>`;
    await Promise.resolve();
    const indicator = must(document.querySelector<HTMLElement>("ui-tab-indicator"));

    // Decorative: the tab list already announces which tab is selected.
    expect(indicator.getAttribute("role")).toBe("presentation");
    expect(indicator.getAttribute("aria-hidden")).toBe("true");
    expect(indicator.getAttribute("data-orientation")).toBe("horizontal");
    // Every geometry variable is published, even at zero size.
    expect(indicator.style.getPropertyValue("--active-tab-left")).toBe("0px");
    expect(indicator.style.getPropertyValue("--active-tab-width")).toBe("0px");
    // Nothing measurable yet, so it stays out of sight rather than flashing
    // collapsed at the list's origin.
    expect(indicator.hidden).toBe(true);
  });

  it("reports which way the selection travelled", async () => {
    document.body.innerHTML = `
      <ui-tabs value="a">
        <ui-tab-list>
          <button data-tab value="a">A</button>
          <button data-tab value="b">B</button>
          <ui-tab-indicator></ui-tab-indicator>
        </ui-tab-list>
        <div data-tab-panel value="a">A</div>
        <div data-tab-panel value="b">B</div>
      </ui-tabs>`;
    await Promise.resolve();
    const tabs = must(document.querySelector("ui-tabs"));
    const indicator = must(document.querySelector<HTMLElement>("ui-tab-indicator"));
    // The first selection has no predecessor to have travelled from.
    expect(indicator.getAttribute("data-activation-direction")).toBe("none");

    tabs.value = "b";
    expect(indicator.getAttribute("data-activation-direction")).toBe("right");
    tabs.value = "a";
    expect(indicator.getAttribute("data-activation-direction")).toBe("left");
  });

  it("swaps the indicator direction axis when vertical", async () => {
    document.body.innerHTML = `
      <ui-tabs value="a" orientation="vertical">
        <ui-tab-list>
          <button data-tab value="a">A</button>
          <button data-tab value="b">B</button>
          <ui-tab-indicator></ui-tab-indicator>
        </ui-tab-list>
        <div data-tab-panel value="a">A</div>
        <div data-tab-panel value="b">B</div>
      </ui-tabs>`;
    await Promise.resolve();
    const tabs = must(document.querySelector("ui-tabs"));
    const indicator = must(document.querySelector<HTMLElement>("ui-tab-indicator"));
    expect(indicator.getAttribute("data-orientation")).toBe("vertical");

    tabs.value = "b";
    expect(indicator.getAttribute("data-activation-direction")).toBe("down");
  });
});
