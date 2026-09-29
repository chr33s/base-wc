// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { key, must } from "./test-utils.ts";

/** The value, or a failure naming the missing element. */
async function mount(attrs = "") {
  document.body.innerHTML = `
    <ui-drawer ${attrs}>
      <button data-drawer-trigger id="open">Open</button>
      <ui-drawer-backdrop></ui-drawer-backdrop>
      <ui-drawer-popup>
        <button data-drawer-handle id="handle">grip</button>
        <button id="ok">OK</button>
        <button data-drawer-close id="close">Close</button>
      </ui-drawer-popup>
    </ui-drawer>`;
  await Promise.resolve();
  const drawer = must(document.querySelector("ui-drawer"));
  const trigger = must(document.querySelector<HTMLButtonElement>("#open"));
  const popup = must(document.querySelector("ui-drawer-popup"));
  return { drawer, trigger, popup };
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.overflow = "";
});

describe("ui-drawer", () => {
  it("wires modal ARIA and reflects the side", async () => {
    const { drawer, trigger, popup } = await mount('side="left"');
    expect(popup.getAttribute("role")).toBe("dialog");
    expect(popup.getAttribute("aria-modal")).toBe("true");
    expect(popup.getAttribute("data-side")).toBe("left");
    expect(drawer.side).toBe("left");
    expect(trigger.getAttribute("aria-controls")).toBe(popup.id);
  });

  it("defaults the side to right", async () => {
    const { popup } = await mount();
    expect(popup.getAttribute("data-side")).toBe("right");
  });

  it("opens with scroll lock and focus moved inside", async () => {
    const { trigger, popup } = await mount();
    trigger.focus();
    trigger.click();
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(document.querySelector("#handle"));
  });

  it("closes on Escape, unlocking scroll and restoring focus", async () => {
    const { trigger, popup } = await mount();
    trigger.focus();
    trigger.click();
    key(popup, "Escape");
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a [data-drawer-close] click", async () => {
    const { drawer, trigger } = await mount();
    trigger.click();
    must(document.querySelector<HTMLButtonElement>("#close")).click();
    expect(drawer.open).toBe(false);
  });

  it("marks data-state for CSS enter/exit animations", async () => {
    const { drawer, trigger, popup } = await mount();
    trigger.click();
    expect(popup.getAttribute("data-state")).toBe("open");
    drawer.hide();
    expect(popup.getAttribute("data-state")).toBe("closed");
  });

  it("static drawers ignore Escape and outside press", async () => {
    const { drawer, trigger, popup } = await mount("static");
    trigger.click();
    key(popup, "Escape");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(drawer.open).toBe(true);
    drawer.hide(); // only an explicit action closes it; balance the scroll lock
    expect(drawer.open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("ui-drawer — swipe to open", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-drawer side="right">
        <div data-drawer-swipe id="swipe">edge</div>
        <ui-drawer-popup><button id="ok">OK</button></ui-drawer-popup>
      </ui-drawer>`;
    await Promise.resolve();
    const drawer = must(document.querySelector("ui-drawer"));
    const swipe = must(document.querySelector<HTMLElement>("#swipe"));
    const popup = must(document.querySelector("ui-drawer-popup"));
    return { drawer, swipe, popup };
  }
  const down = (el: EventTarget, x: number, y = 0) =>
    el.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
  const move = (x: number, y = 0) =>
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));
  const up = (x: number, y = 0) =>
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: x, clientY: y }));

  afterEach(() => {
    document.documentElement.style.overflow = "";
  });

  it("presents once the swipe clears the slop, and commits open when released past the threshold", async () => {
    const { drawer, swipe, popup } = await mount();
    down(swipe, 100); // grabbing the edge zone alone commits to nothing yet
    expect(popup.hasAttribute("data-open")).toBe(false);
    move(88); // 12px inward (right→left) clears the slop → presented off-screen
    expect(popup.hasAttribute("data-open")).toBe(true);
    move(20); // the reveal is measured from the commit point, so keep pulling
    up(20);
    expect(drawer.open).toBe(true);
  });

  it("ignores a press that never moves, so a tap on the edge zone is not a swipe", async () => {
    const { drawer, popup, swipe } = await mount();
    down(swipe, 100);
    up(100); // no inward movement at all
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(drawer.open).toBe(false);
  });

  it("ignores movement below the slop so a tremor never presents the drawer", async () => {
    const { drawer, popup, swipe } = await mount();
    down(swipe, 100);
    move(96); // 4px — under the 8px slop
    expect(popup.hasAttribute("data-open")).toBe(false);
    up(96);
    expect(drawer.open).toBe(false);
  });

  it("yields to a cross-axis gesture: a vertical flick on a side drawer scrolls", async () => {
    const { drawer, popup, swipe } = await mount();
    down(swipe, 100, 0);
    move(98, 40); // dominantly vertical → the drawer must not claim it
    expect(popup.hasAttribute("data-open")).toBe(false);
    move(40, 40); // and having lost the gesture it stays out of it
    expect(popup.hasAttribute("data-open")).toBe(false);
    up(40, 40);
    expect(drawer.open).toBe(false);
  });

  // The reported failure: on a bottom sheet the swipe zone sits on a scrollable
  // page, and the stroke that starts a downward scroll runs along the drawer's
  // own axis. Committing to it captured the pointer, opened the modal overlay
  // off-screen, then dismissed it at release — the page scroll swallowed and a
  // spurious open/close pair fired with nothing ever visible.
  it("ignores a swipe away from the drawer, so a page scroll stays a page scroll", async () => {
    document.body.innerHTML = `
      <ui-drawer side="bottom">
        <div data-drawer-swipe id="swipe">edge</div>
        <ui-drawer-popup id="popup"><button id="ok">OK</button></ui-drawer-popup>
      </ui-drawer>`;
    await Promise.resolve();
    const drawer = must(document.querySelector("ui-drawer"));
    const swipe = must(document.querySelector<HTMLElement>("#swipe"));
    const popup = must(document.querySelector<HTMLElement>("#popup"));
    const events: string[] = [];
    for (const type of ["open", "close"]) drawer.addEventListener(type, () => events.push(type));

    down(swipe, 0, 300);
    move(0, 320); // 20px *down* — away from a bottom sheet, so not its gesture
    expect(popup.hasAttribute("data-open")).toBe(false);
    move(0, 200); // and having lost it, it stays out even on the way back up
    expect(popup.hasAttribute("data-open")).toBe(false);
    up(0, 200);
    expect(drawer.open).toBe(false);
    expect(events).toEqual([]);
  });

  it("ignores a handle drag away from the edge on an open drawer", async () => {
    document.body.innerHTML = `
      <ui-drawer side="bottom">
        <ui-drawer-popup id="popup">
          <button data-drawer-handle id="handle">grip</button>
        </ui-drawer-popup>
      </ui-drawer>`;
    await Promise.resolve();
    const drawer = must(document.querySelector("ui-drawer"));
    const handle = must(document.querySelector<HTMLElement>("#handle"));
    const popup = must(document.querySelector<HTMLElement>("#popup"));
    drawer.show();

    down(handle, 0, 300);
    move(0, 260); // dragging a bottom sheet *up* has nothing left to reveal
    // Capturing here would block the native scroll of whatever is under the
    // grip while moving the sheet not at all.
    expect(popup.style.transform).toBe("");
    up(0, 260);
    expect(drawer.open).toBe(true);

    // The same grip still drags the sheet on a pull toward the edge. The offset
    // is measured from the point the gesture was recognised, so it takes one
    // more move past that to show any travel.
    down(handle, 0, 300);
    move(0, 320); // recognised here
    move(0, 340);
    expect(popup.style.transform).toBe("translateY(20px)");
  });

  it("drops an armed gesture when the closed drawer is disconnected", async () => {
    const { drawer, popup, swipe } = await mount();
    down(swipe, 100); // armed, but the drawer is closed so nothing is open yet
    drawer.remove();
    await Promise.resolve();
    // The teardown path bails on a closed drawer, so the gesture has to be
    // ended explicitly or its window listeners keep driving a detached drawer.
    move(20);
    up(20);
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(drawer.open).toBe(false);
  });

  it("lets the grip dismiss even when the popup around it is scrolled", async () => {
    document.body.innerHTML = `
      <ui-drawer side="bottom">
        <button data-drawer-trigger id="open">Open</button>
        <ui-drawer-popup id="popup" style="overflow-y: auto">
          <button data-drawer-handle id="handle">grip</button>
          <button id="ok">OK</button>
        </ui-drawer-popup>
      </ui-drawer>`;
    await Promise.resolve();
    const drawer = must(document.querySelector("ui-drawer"));
    const popup = must(document.querySelector<HTMLElement>("#popup"));
    const handle = must(document.querySelector<HTMLElement>("#handle"));
    Object.defineProperty(popup, "scrollHeight", { value: 800 });
    Object.defineProperty(popup, "clientHeight", { value: 300 });
    popup.scrollTop = 40; // content scrolled away from the closing edge
    drawer.show();
    handle.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 0, clientY: 100, bubbles: true }),
    );
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0, clientY: 120 }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0, clientY: 140 }));
    // A dedicated grip is an unambiguous intent to drag the sheet; what scrolls
    // around it is not its business, or it goes dead until scrolled to the top.
    // (`show()` seeds --drawer-offset, so the transform is what proves a drag.)
    expect(popup.style.transform).toBe("translateY(20px)");
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: 0, clientY: 140 }));
  });
});
