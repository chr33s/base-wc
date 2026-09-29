// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";
import { key, must } from "./test-utils.ts";

/** Narrow an indexed lookup the fixture guarantees is present. */
const typeInto = (cell: HTMLInputElement, value: string) => {
  cell.value = value;
  cell.dispatchEvent(new Event("input", { bubbles: true }));
};
async function mount(attrs = 'length="4"') {
  document.body.innerHTML = `<ui-otp-field name="code" ${attrs}></ui-otp-field>`;
  await Promise.resolve();
  const otp = must(document.querySelector("ui-otp-field"));
  const cells = () => [...otp.querySelectorAll<HTMLInputElement>("input")];
  return { otp, cells };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-otp-field", () => {
  it("generates the requested number of cells with a11y labels", async () => {
    const { otp, cells } = await mount('length="4"');
    expect(otp.getAttribute("role")).toBe("group");
    expect(cells().length).toBe(4);
    expect(must(cells()[0]).getAttribute("aria-label")).toBe("Character 1 of 4");
    expect(must(cells()[0]).getAttribute("maxlength")).toBe("1");
  });

  it("advances the caret as digits are typed", async () => {
    const { otp, cells } = await mount('length="4"');
    typeInto(must(cells()[0]), "1");
    expect(must(cells()[0]).value).toBe("1");
    expect(document.activeElement).toBe(cells()[1]);
    typeInto(must(cells()[1]), "2");
    expect(otp.value).toBe("12");
  });

  it("rejects characters outside the numeric set", async () => {
    const { cells } = await mount('length="4"');
    typeInto(must(cells()[0]), "a");
    expect(must(cells()[0]).value).toBe("");
  });

  it("moves back and clears on Backspace in an empty cell", async () => {
    const { cells } = await mount('length="4"');
    typeInto(must(cells()[0]), "1");
    typeInto(must(cells()[1]), "2"); // focus now on cell 2
    key(must(cells()[2]), "Backspace"); // cell 2 empty → go back to cell 1 and clear
    expect(document.activeElement).toBe(cells()[1]);
    expect(must(cells()[1]).value).toBe("");
  });

  it("distributes a pasted code and fires complete when full", async () => {
    const { otp, cells } = await mount('length="4"');
    const onComplete = vi.fn<(detail: { value: string }) => void>();
    otp.addEventListener("complete", (e) =>
      onComplete((e as CustomEvent<{ value: string }>).detail),
    );
    const paste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "12ab34" } });
    must(cells()[0]).dispatchEvent(paste);
    expect(otp.value).toBe("1234"); // non-digits stripped, capped at length
    expect(onComplete.mock.calls.at(-1)?.[0]).toEqual({ value: "1234" });
  });

  it("fills from the start when a full-length code is pasted into a later cell", async () => {
    const { otp, cells } = await mount('length="4"');
    must(cells()[2]).focus(); // paste while a later cell is focused
    const paste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "1234" } });
    must(cells()[2]).dispatchEvent(paste);
    // A full code fills the whole field from cell 0 — no digits dropped.
    expect(otp.value).toBe("1234");
  });

  it("masks the cells and allows alphanumeric mode", async () => {
    const { cells } = await mount('length="4" mask mode="alphanumeric"');
    expect(must(cells()[0]).type).toBe("password");
    typeInto(must(cells()[0]), "a");
    expect(must(cells()[0]).value).toBe("a"); // letters allowed in alphanumeric mode
  });

  it("reacts to length/mask/mode attribute changes (not read-once)", async () => {
    const { otp, cells } = await mount('length="4"');
    otp.setAttribute("length", "6");
    expect(cells().length).toBe(6);
    expect(must(cells()[5]).getAttribute("aria-label")).toBe("Character 6 of 6");
    otp.setAttribute("mask", "");
    expect(must(cells()[0]).type).toBe("password");
    otp.removeAttribute("mask");
    expect(must(cells()[0]).type).toBe("text");
    otp.setAttribute("mode", "alphanumeric");
    expect(must(cells()[0]).getAttribute("inputmode")).toBe("text");
  });

  it("supports disabled via the attribute, disabling every cell", async () => {
    const { otp, cells } = await mount('length="4"');
    otp.setAttribute("disabled", "");
    expect(otp.disabled).toBe(true);
    expect(cells().every((c) => c.disabled)).toBe(true);
    otp.removeAttribute("disabled");
    expect(otp.disabled).toBe(false);
    expect(cells().every((c) => !c.disabled)).toBe(true);
  });

  it("formDisabledCallback disables the cells (disabled fieldset ancestor)", async () => {
    const { otp, cells } = await mount('length="4"');
    otp.formDisabledCallback(true);
    expect(otp.disabled).toBe(true);
    expect(cells().every((c) => c.disabled)).toBe(true);
    otp.formDisabledCallback(false);
    expect(cells().every((c) => !c.disabled)).toBe(true);
  });

  it("formResetCallback clears the cells", async () => {
    const { otp, cells } = await mount('length="4"');
    typeInto(must(cells()[0]), "1");
    typeInto(must(cells()[1]), "2");
    expect(otp.value).toBe("12");
    otp.formResetCallback();
    expect(otp.value).toBe("");
    expect(cells().every((c) => c.value === "")).toBe(true);
  });
});
