// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(inputAttrs = "multiple") {
  document.body.innerHTML = `<ui-drop-zone><input type="file" name="upload" ${inputAttrs} /></ui-drop-zone>`;
  await flush();
  const zone = document.querySelector("ui-drop-zone")!;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const target = zone.querySelector<HTMLElement>("[data-drop-target]")!;
  return { zone, input, target };
}

/** Dispatch a drag/drop event with a synthetic dataTransfer (happy-dom has no ctor). */
function fireDrag(el: Element, type: string, files: File[] = []) {
  const e = new Event(type, { bubbles: true }) as Event & { dataTransfer: unknown };
  e.dataTransfer = { files, dropEffect: "" };
  el.dispatchEvent(e);
}

describe("ui-drop-zone", () => {
  it("adopts + retires the file input and generates a button target", async () => {
    const { input, target } = await mount();
    expect(input.hidden).toBe(true); // retired, still submitting
    expect(target.getAttribute("role")).toBe("button");
    expect(target.getAttribute("tabindex")).toBe("0");
  });

  it("opens the file chooser on click and Enter", async () => {
    const { input, target } = await mount();
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    target.click();
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("reflects drag state via data-dragging", async () => {
    const { zone } = await mount();
    fireDrag(zone, "dragenter");
    expect(zone.hasAttribute("data-dragging")).toBe(true);
    fireDrag(zone, "dragleave");
    expect(zone.hasAttribute("data-dragging")).toBe(false);
  });

  it("filters dropped files against accept and emits the accepted set", async () => {
    const { zone } = await mount('multiple accept="image/*"');
    const img = new File(["x"], "a.png", { type: "image/png" });
    const txt = new File(["x"], "b.txt", { type: "text/plain" });
    let files: File[] = [];
    zone.addEventListener("change", (e) => (files = (e as CustomEvent).detail.files));
    fireDrag(zone, "drop", [img, txt]);
    expect(files.map((f) => f.name)).toEqual(["a.png"]);
  });

  it("ignores a drop with no acceptable files", async () => {
    const { zone } = await mount('accept=".pdf"');
    let fired = false;
    zone.addEventListener("change", () => (fired = true));
    fireDrag(zone, "drop", [new File(["x"], "a.png", { type: "image/png" })]);
    expect(fired).toBe(false);
  });
});
