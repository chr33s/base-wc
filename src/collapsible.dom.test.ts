// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

async function mount(attrs = "") {
  document.body.innerHTML = `
    <ui-collapsible ${attrs}>
      <button data-collapsible-trigger>Details</button>
      <div data-collapsible-content>Body</div>
    </ui-collapsible>`;
  await Promise.resolve();
  const collapsible = document.querySelector("ui-collapsible")!;
  const trigger = document.querySelector<HTMLButtonElement>("[data-collapsible-trigger]")!;
  const content = document.querySelector<HTMLElement>("[data-collapsible-content]")!;
  return { collapsible, trigger, content };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-collapsible", () => {
  it("starts closed with the content hidden and wired ARIA", async () => {
    const { trigger, content } = await mount();
    expect(trigger.getAttribute("aria-controls")).toBe(content.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(content.hidden).toBe(true);
    expect(content.getAttribute("data-state")).toBe("closed");
  });

  it("opens on trigger click", async () => {
    const { trigger, content } = await mount();
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(content.hidden).toBe(false);
    expect(content.getAttribute("data-state")).toBe("open");
  });

  it("honours the open attribute and reacts to changes", async () => {
    const { collapsible, trigger, content } = await mount("open");
    expect(content.hidden).toBe(false);
    collapsible.open = false;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(content.hidden).toBe(true);
  });
});
