// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { ensureButton } from "./parts.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ensureButton", () => {
  it("generates a marked type=button with label and glyph when none is authored", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const btn = ensureButton(host, { marker: "data-x-dismiss", label: "Dismiss", text: "✕" });
    expect(btn.tagName).toBe("BUTTON");
    expect((btn as HTMLButtonElement).type).toBe("button");
    expect(btn.hasAttribute("data-x-dismiss")).toBe(true);
    expect(btn.getAttribute("aria-label")).toBe("Dismiss");
    expect(btn.textContent).toBe("✕");
    expect(btn.parentElement).toBe(host);
  });

  it("adopts an authored element as-is (its label/content are the consumer's)", () => {
    document.body.innerHTML = `<div><button data-x-dismiss aria-label="Close it">x</button></div>`;
    const host = document.body.firstElementChild as HTMLElement;
    const authored = host.querySelector("[data-x-dismiss]");
    const btn = ensureButton(host, { marker: "data-x-dismiss", label: "Dismiss", text: "✕" });
    expect(btn).toBe(authored);
    expect(btn.getAttribute("aria-label")).toBe("Close it");
  });

  it("never adopts a nested same-tag instance's button", () => {
    document.body.innerHTML = `
      <section><section><button data-x-dismiss>inner</button></section></section>`;
    const outer = document.body.querySelector("section") as HTMLElement;
    const btn = ensureButton(outer, { marker: "data-x-dismiss", label: "Dismiss" });
    expect(btn.textContent).not.toBe("inner"); // generated for the outer host
    expect(btn.parentElement).toBe(outer);
  });

  it("marks generated buttons with the extra generatedMarker and honors insert", () => {
    document.body.innerHTML = `<div><input /></div>`;
    const host = document.body.firstElementChild as HTMLElement;
    const input = host.querySelector("input")!;
    const btn = ensureButton(host, {
      marker: "data-x-clear",
      generatedMarker: "data-x-generated",
      label: "Clear",
      insert: (b) => input.after(b),
    });
    expect(btn.hasAttribute("data-x-generated")).toBe(true);
    expect(input.nextElementSibling).toBe(btn);
  });
});
