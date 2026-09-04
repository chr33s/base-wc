// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount() {
  document.body.innerHTML = `
    <ui-navigation-menu delay="200">
      <ui-nav-list>
        <ui-nav-item>
          <button data-nav-trigger id="products">Products</button>
          <ui-nav-content><a href="#a" id="pa">Analytics</a></ui-nav-content>
        </ui-nav-item>
        <ui-nav-item>
          <button data-nav-trigger id="company">Company</button>
          <ui-nav-content><a href="#b" id="cb">About</a></ui-nav-content>
        </ui-nav-item>
      </ui-nav-list>
    </ui-navigation-menu>`;
  await Promise.resolve();
  const menu = document.querySelector("ui-navigation-menu")!;
  const products = document.querySelector<HTMLButtonElement>("#products")!;
  const company = document.querySelector<HTMLButtonElement>("#company")!;
  const contents = [...document.querySelectorAll("ui-nav-content")];
  return { menu, products, company, contents };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("ui-navigation-menu", () => {
  it("wires trigger/content ARIA and starts closed", async () => {
    const { products, contents } = await mount();
    expect(products.getAttribute("aria-expanded")).toBe("false");
    expect(products.getAttribute("aria-controls")).toBe(contents[0].id);
    expect(contents[0].getAttribute("role")).toBe("region");
    expect(contents[0].getAttribute("aria-labelledby")).toBe(products.id);
    expect(contents[0].hidden).toBe(true);
  });

  it("keeps a single roving tab stop across the triggers", async () => {
    const { products, company } = await mount();
    expect(products.tabIndex).toBe(0);
    expect(company.tabIndex).toBe(-1);
  });

  it("opens a panel on click and toggles it closed", async () => {
    const { products, contents } = await mount();
    products.click();
    expect(products.getAttribute("aria-expanded")).toBe("true");
    expect(contents[0].hidden).toBe(false);
    products.click();
    expect(products.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on hover after the intent delay and switches instantly", async () => {
    const { menu, products, company, contents } = await mount();
    const onChange = vi.fn<(detail: { index: number }) => void>();
    menu.addEventListener("change", (e) => onChange((e as CustomEvent<{ index: number }>).detail));

    products.dispatchEvent(new Event("pointerenter"));
    expect(contents[0].hidden).toBe(true); // not yet
    vi.advanceTimersByTime(200);
    expect(contents[0].hidden).toBe(false);

    // Already browsing → the second trigger opens immediately (no delay).
    company.dispatchEvent(new Event("pointerenter"));
    expect(contents[1].hidden).toBe(false);
    expect(contents[0].hidden).toBe(true); // previous closed
    expect(onChange.mock.calls.at(-1)?.[0].index).toBe(1);
  });

  it("cancels a pending open when another trigger is hovered before the delay", async () => {
    const { products, company, contents } = await mount();
    products.dispatchEvent(new Event("pointerenter")); // schedules panel 0
    vi.advanceTimersByTime(100); // …but not long enough to open
    company.dispatchEvent(new Event("pointerenter")); // must cancel panel 0's open
    vi.advanceTimersByTime(200);
    expect(contents[0].hidden).toBe(true); // panel 0 never flashed open
    expect(contents[1].hidden).toBe(false); // only the last-hovered panel opened
  });

  it("closes after leaving the menu", async () => {
    const { menu, products, contents } = await mount();
    products.click();
    expect(contents[0].hidden).toBe(false);
    menu.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(200);
    expect(contents[0].hidden).toBe(true);
  });

  it("moves into the panel with ArrowDown and closes on Escape", async () => {
    const { products, contents } = await mount();
    products.focus();
    key(products, "ArrowDown");
    expect(contents[0].hidden).toBe(false);
    expect(document.activeElement).toBe(document.querySelector("#pa"));
    key(contents[0], "Escape");
    expect(products.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(products);
  });
});

describe("ui-navigation-menu — live items", () => {
  it("wires an item added after the initial pass", async () => {
    const { menu } = await mount();
    const list = document.querySelector("ui-nav-list")!;
    list.insertAdjacentHTML(
      "beforeend",
      `<ui-nav-item>
        <button data-nav-trigger id="late">Support</button>
        <ui-nav-content><a href="#c" id="sc">Docs</a></ui-nav-content>
      </ui-nav-item>`,
    );
    await Promise.resolve(); // the observer delivers on a microtask
    const late = document.querySelector<HTMLButtonElement>("#late")!;
    // Holding the wire-time snapshot would leave this trigger permanently
    // inert — no aria wiring, no listeners, invisible to the arrow keys.
    expect(late.getAttribute("aria-expanded")).toBe("false");
    late.click();
    expect(menu.hasAttribute("data-open")).toBe(true);
    expect(document.querySelector("#late")!.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not re-wire an item it has already seen", async () => {
    const { products, menu } = await mount();
    products.click();
    expect(menu.hasAttribute("data-open")).toBe(true);
    document.querySelector("ui-nav-list")!.insertAdjacentHTML(
      "beforeend",
      `<ui-nav-item><button data-nav-trigger id="late">S</button>
        <ui-nav-content>x</ui-nav-content></ui-nav-item>`,
    );
    await Promise.resolve();
    // A duplicated click listener would toggle twice and close it again.
    products.click();
    expect(menu.hasAttribute("data-open")).toBe(false);
  });

  it("unlatches when the open item is removed, instead of freezing open", async () => {
    const { menu, products, company } = await mount();
    products.click();
    expect(menu.hasAttribute("data-open")).toBe(true);
    products.closest("ui-nav-item")!.remove();
    await Promise.resolve();
    // With the open item tracked by index, the stale index would still look
    // valid and every close path would target the wrong panel — leaving the
    // menu latched open and deaf to further interaction.
    expect(menu.hasAttribute("data-open")).toBe(false);
    company.click(); // and the menu still works
    expect(menu.hasAttribute("data-open")).toBe(true);
  });

  it("reflects a trigger's disabled state and refuses to open it", async () => {
    const { menu, products } = await mount();
    products.setAttribute("disabled", "");
    await Promise.resolve();
    expect(products.hasAttribute("data-disabled")).toBe(true);
    products.click();
    expect(menu.hasAttribute("data-open")).toBe(false);
  });

  it("keeps a tabbable trigger when the one holding the stop is removed", async () => {
    const { products, company } = await mount();
    expect(products.tabIndex).toBe(0);
    products.closest("ui-nav-item")!.remove();
    await Promise.resolve();
    // Roving's observer fires before ours and reads the stale trigger cache;
    // without a refresh after the resync the survivors all sit at -1 and the
    // whole menu drops out of the tab order.
    expect(company.tabIndex).toBe(0);
  });

  it("wires a panel that arrives or is swapped after its trigger", async () => {
    const { menu, company } = await mount();
    const item = company.closest("ui-nav-item")!;
    item.querySelector("ui-nav-content")!.remove();
    await Promise.resolve();
    expect(company.hasAttribute("aria-controls")).toBe(false);
    item.insertAdjacentHTML(
      "beforeend",
      `<ui-nav-content id="late"><a href="#l">L</a></ui-nav-content>`,
    );
    await Promise.resolve();
    const late = document.querySelector<HTMLElement>("#late")!;
    // A per-route panel rendered after the trigger was wired must still start
    // hidden and labelled, not sit permanently visible on the page.
    expect(late.hidden).toBe(true);
    expect(late.getAttribute("role")).toBe("region");
    expect(company.getAttribute("aria-controls")).toBe("late");
    company.click();
    expect(late.hidden).toBe(false);
    expect(menu.hasAttribute("data-open")).toBe(true);
  });
});

describe("ui-navigation-menu — item identity across rebuilds", () => {
  it("reports the change index in current DOM order after an item is prepended", async () => {
    const { menu, company } = await mount();
    const onChange = vi.fn<(detail: { index: number }) => void>();
    menu.addEventListener("change", (e) => onChange((e as CustomEvent<{ index: number }>).detail));

    const item = document.createElement("ui-nav-item");
    item.innerHTML = `
      <button data-nav-trigger id="pricing">Pricing</button>
      <ui-nav-content><a href="#p" id="pp">Plans</a></ui-nav-content>`;
    document.querySelector("ui-nav-list")!.prepend(item);
    await Promise.resolve(); // the observer rebuilds on a microtask

    // The item cache is keyed by trigger but iterates in insertion order, so the
    // index has to follow the DOM rather than the order entries were first seen.
    company.click();
    expect(onChange.mock.calls.at(-1)?.[0].index).toBe(2);

    document.querySelector<HTMLButtonElement>("#pricing")!.click();
    expect(onChange.mock.calls.at(-1)?.[0].index).toBe(0);
  });

  it("keeps the open panel's identity when a sibling is removed", async () => {
    const { products, company, contents } = await mount();
    company.click();
    expect(contents[1].hidden).toBe(false);

    products.closest("ui-nav-item")!.remove();
    await Promise.resolve();
    // The entry, not an index, is what `#active` holds — so the surviving panel
    // is still recognised as its own and a second click closes it.
    expect(contents[1].hidden).toBe(false);
    company.click();
    expect(company.getAttribute("aria-expanded")).toBe("false");
  });
});
