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

  it("marks data-state for CSS enter/exit animations", async () => {
    const { dialog, trigger, popup } = await mount();
    trigger.click();
    expect(popup.getAttribute("data-state")).toBe("open");
    dialog.hide();
    // The exit path flips to `closed` so a `[data-state]` animation can play
    // before the popup leaves the top layer.
    expect(popup.getAttribute("data-state")).toBe("closed");
  });

  it("traps Tab within the dialog, wrapping from last to first", async () => {
    document.body.innerHTML = `
      <ui-dialog>
        <button data-dialog-trigger>Open</button>
        <ui-dialog-popup>
          <button id="first">First</button>
          <button id="last">Last</button>
        </ui-dialog-popup>
      </ui-dialog>`;
    await Promise.resolve();
    document.querySelector<HTMLButtonElement>("[data-dialog-trigger]")!.click();
    expect(document.activeElement).toBe(document.querySelector("#first"));
    document.querySelector<HTMLButtonElement>("#last")!.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(document.querySelector("#first")); // wrapped
    document.querySelector("ui-dialog")!.hide(); // balance the scroll lock
  });

  it("opens in the same task as connection (sync-wire guard)", async () => {
    document.body.innerHTML = `
      <ui-dialog>
        <ui-dialog-popup><button id="ok">OK</button></ui-dialog-popup>
      </ui-dialog>`;
    const dialog = document.querySelector("ui-dialog")!;
    dialog.show(); // no microtask wait — must wire synchronously
    expect(dialog.open).toBe(true);
    expect(document.querySelector("ui-dialog-popup")!.hasAttribute("data-open")).toBe(true);
    dialog.hide();
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

describe("ui-dialog change reasons", () => {
  it("names what opened and closed it", async () => {
    document.body.innerHTML = `
      <ui-dialog>
        <button data-dialog-trigger>Open</button>
        <ui-dialog-popup><p>Body</p></ui-dialog-popup>
      </ui-dialog>`;
    await Promise.resolve();
    const dialog = document.querySelector("ui-dialog")!;
    const trigger = document.querySelector<HTMLButtonElement>("[data-dialog-trigger]")!;
    const popup = document.querySelector("ui-dialog-popup")!;
    const reasons: string[] = [];
    for (const type of ["open", "close"]) {
      dialog.addEventListener(type, (e) =>
        reasons.push(`${type}:${(e as CustomEvent<{ reason: string }>).detail.reason}`),
      );
    }

    trigger.click();
    popup.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(reasons).toEqual(["open:trigger-press", "close:escape-key"]);

    // A programmatic call has nothing more specific to say.
    dialog.show();
    expect(reasons.at(-1)).toBe("open:none");
  });
});
