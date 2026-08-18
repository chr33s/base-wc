// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount(attrs = "") {
  document.body.innerHTML = `
    <ui-dialog ${attrs}>
      <button data-dialog-trigger>Open</button>
      <ui-dialog-backdrop></ui-dialog-backdrop>
      <ui-dialog-popup>
        <h2 data-dialog-title>Title</h2>
        <p data-dialog-description>Description</p>
        <button id="ok">OK</button>
      </ui-dialog-popup>
    </ui-dialog>`;
  await Promise.resolve();
  const dialog = document.querySelector("ui-dialog")!;
  const trigger = document.querySelector<HTMLButtonElement>("[data-dialog-trigger]")!;
  const popup = document.querySelector("ui-dialog-popup")!;
  const ok = document.querySelector<HTMLButtonElement>("#ok")!;
  return { dialog, trigger, popup, ok };
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.overflow = "";
});

describe("ui-dialog", () => {
  it("wires modal ARIA and label/description cross-references", async () => {
    const { trigger, popup } = await mount();
    expect(popup.getAttribute("role")).toBe("dialog");
    expect(popup.getAttribute("aria-modal")).toBe("true");
    expect(popup.getAttribute("aria-labelledby")).toBe(
      document.querySelector("[data-dialog-title]")!.id,
    );
    expect(popup.getAttribute("aria-describedby")).toBe(
      document.querySelector("[data-dialog-description]")!.id,
    );
    expect(trigger.getAttribute("aria-controls")).toBe(popup.id);
  });

  it("opens with scroll lock and focus moved into the dialog", async () => {
    const { trigger, popup, ok } = await mount();
    trigger.focus();
    trigger.click();
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden"); // scroll locked
    expect(document.activeElement).toBe(ok); // focus trapped inside
  });

  it("closes on Escape, unlocking scroll and restoring focus", async () => {
    const { trigger, popup } = await mount();
    trigger.focus();
    trigger.click();
    key(popup, "Escape");
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(document.documentElement.style.overflow).toBe(""); // unlocked
    expect(document.activeElement).toBe(trigger); // focus restored
  });

  it("light-dismisses on outside press", async () => {
    const { dialog, trigger, popup } = await mount();
    trigger.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(dialog.open).toBe(false);
  });

  it("static dialogs ignore Escape and outside press", async () => {
    const { dialog, trigger, popup } = await mount("static");
    trigger.click();
    key(popup, "Escape");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(dialog.open).toBe(true);
    dialog.hide(); // balance the scroll lock for the next test
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("alert dialogs use role=alertdialog and force an action", async () => {
    const { dialog, trigger, popup } = await mount("alert");
    expect(popup.getAttribute("role")).toBe("alertdialog");
    trigger.click();
    key(popup, "Escape");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(popup.hasAttribute("data-open")).toBe(true); // no light dismiss
    dialog.hide(); // only an explicit action closes it
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
  });
});
