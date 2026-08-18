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
