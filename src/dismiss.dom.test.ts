// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { onOutsidePress } from "./dismiss.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

function press(target: Element) {
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
}

function mount() {
  document.body.innerHTML = `
    <div id="popup"><button id="in">in</button></div>
    <button id="trigger">trigger</button>
    <div id="toast" data-dismiss-ignore><button id="toast-btn">x</button></div>
    <button id="out">out</button>`;
  const q = (selector: string) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`missing ${selector}`);
    return el;
  };
  return {
    popup: q("#popup"),
    inner: q("#in"),
    trigger: q("#trigger"),
    toastBtn: q("#toast-btn"),
    out: q("#out"),
  };
}

describe("onOutsidePress", () => {
  it("dismisses on a press outside every listed element", () => {
    const { popup, trigger, out } = mount();
    const onDismiss = vi.fn();
    const stop = onOutsidePress([popup, trigger], onDismiss);
    press(out);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignores presses inside a listed element or its descendants", () => {
    const { popup, inner, trigger } = mount();
    const onDismiss = vi.fn();
    const stop = onOutsidePress([popup, trigger], onDismiss);
    press(inner);
    press(trigger);
    expect(onDismiss).not.toHaveBeenCalled();
    stop();
  });

  it("skips null/undefined entries in the inside list", () => {
    const { popup, out } = mount();
    const onDismiss = vi.fn();
    const stop = onOutsidePress([null, undefined, popup], onDismiss);
    press(out);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    stop();
  });

  it("treats a press inside a [data-dismiss-ignore] layer as inside", () => {
    const { popup, toastBtn } = mount();
    const onDismiss = vi.fn();
    const stop = onOutsidePress([popup], onDismiss);
    press(toastBtn);
    expect(onDismiss).not.toHaveBeenCalled();
    stop();
  });

  it("runs in the capture phase, before a handler that swallows the press", () => {
    const { popup, out } = mount();
    out.addEventListener("pointerdown", (e) => e.stopPropagation());
    const onDismiss = vi.fn();
    const stop = onOutsidePress([popup], onDismiss);
    press(out);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops listening once the returned cleanup runs", () => {
    const { popup, out } = mount();
    const onDismiss = vi.fn();
    onOutsidePress([popup], onDismiss)();
    press(out);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
