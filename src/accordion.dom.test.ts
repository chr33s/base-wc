// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount(attrs = "") {
  document.body.innerHTML = `
    <ui-accordion ${attrs}>
      <ui-accordion-item value="a">
        <button data-accordion-trigger>A</button>
        <div data-accordion-content>Body A</div>
      </ui-accordion-item>
      <ui-accordion-item value="b">
        <button data-accordion-trigger>B</button>
        <div data-accordion-content>Body B</div>
      </ui-accordion-item>
      <ui-accordion-item value="c">
        <button data-accordion-trigger>C</button>
        <div data-accordion-content>Body C</div>
      </ui-accordion-item>
    </ui-accordion>`;
  await Promise.resolve();
  const accordion = document.querySelector("ui-accordion")!;
  const triggers = [...document.querySelectorAll<HTMLButtonElement>("[data-accordion-trigger]")];
  const contents = [...document.querySelectorAll<HTMLElement>("[data-accordion-content]")];
  return { accordion, triggers, contents };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-accordion", () => {
  it("wires trigger/region ARIA and starts collapsed", async () => {
    const { triggers, contents } = await mount();
    expect(triggers[0].getAttribute("aria-expanded")).toBe("false");
    expect(triggers[0].getAttribute("aria-controls")).toBe(contents[0].id);
    expect(contents[0].getAttribute("role")).toBe("region");
    expect(contents[0].getAttribute("aria-labelledby")).toBe(triggers[0].id);
    expect(contents[0].hidden).toBe(true);
  });

  it("opens on click and, in single mode, closes the others", async () => {
    const { accordion, triggers, contents } = await mount();
    triggers[0].click();
    expect(triggers[0].getAttribute("aria-expanded")).toBe("true");
    expect(contents[0].hidden).toBe(false);
    expect(accordion.value).toBe("a");
    triggers[1].click(); // single mode → A closes, B opens
    expect(contents[0].hidden).toBe(true);
    expect(contents[1].hidden).toBe(false);
    expect(accordion.value).toBe("b");
  });

  it("collapses an open item when clicked again", async () => {
    const { accordion, triggers } = await mount();
    triggers[0].click();
    triggers[0].click();
    expect(accordion.value).toBe(null);
  });

  it("keeps sections independent in multiple mode", async () => {
    const { accordion, triggers, contents } = await mount("multiple");
    triggers[0].click();
    triggers[2].click();
    expect(contents[0].hidden).toBe(false);
    expect(contents[2].hidden).toBe(false);
    expect(accordion.value).toEqual(["a", "c"]);
  });

  it("moves focus between headers with the arrow keys and Home/End", async () => {
    const { triggers } = await mount();
    triggers[0].focus();
    key(triggers[0], "ArrowDown");
    expect(document.activeElement).toBe(triggers[1]);
    key(triggers[1], "End");
    expect(document.activeElement).toBe(triggers[2]);
    key(triggers[2], "ArrowDown"); // wraps
    expect(document.activeElement).toBe(triggers[0]);
    key(triggers[0], "Home");
    expect(document.activeElement).toBe(triggers[0]);
  });

  it("emits change with the current value", async () => {
    const { accordion, triggers } = await mount("multiple");
    const onChange = vi.fn<(detail: { value: string | string[] | null }) => void>();
    accordion.addEventListener("change", (e) =>
      onChange((e as CustomEvent<{ value: string | string[] | null }>).detail),
    );
    triggers[1].click();
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ value: ["b"] });
  });
});
