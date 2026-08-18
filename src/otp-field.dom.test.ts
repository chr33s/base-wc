// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const typeInto = (cell: HTMLInputElement, value: string) => {
  cell.value = value;
  cell.dispatchEvent(new Event("input", { bubbles: true }));
};
const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount(attrs = 'length="4"') {
  document.body.innerHTML = `<ui-otp-field name="code" ${attrs}></ui-otp-field>`;
  await Promise.resolve();
  const otp = document.querySelector("ui-otp-field")!;
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
    expect(cells()[0].getAttribute("aria-label")).toBe("Character 1 of 4");
    expect(cells()[0].getAttribute("maxlength")).toBe("1");
  });

  it("advances the caret as digits are typed", async () => {
    const { otp, cells } = await mount('length="4"');
    typeInto(cells()[0], "1");
    expect(cells()[0].value).toBe("1");
    expect(document.activeElement).toBe(cells()[1]);
    typeInto(cells()[1], "2");
    expect(otp.value).toBe("12");
  });

  it("rejects characters outside the numeric set", async () => {
    const { cells } = await mount('length="4"');
    typeInto(cells()[0], "a");
    expect(cells()[0].value).toBe("");
  });

  it("moves back and clears on Backspace in an empty cell", async () => {
    const { cells } = await mount('length="4"');
    typeInto(cells()[0], "1");
    typeInto(cells()[1], "2"); // focus now on cell 2
    key(cells()[2], "Backspace"); // cell 2 empty → go back to cell 1 and clear
    expect(document.activeElement).toBe(cells()[1]);
    expect(cells()[1].value).toBe("");
  });

  it("distributes a pasted code and fires complete when full", async () => {
    const { otp, cells } = await mount('length="4"');
    const onComplete = vi.fn<(detail: { value: string }) => void>();
    otp.addEventListener("complete", (e) =>
      onComplete((e as CustomEvent<{ value: string }>).detail),
    );
    const paste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "12ab34" } });
    cells()[0].dispatchEvent(paste);
    expect(otp.value).toBe("1234"); // non-digits stripped, capped at length
    expect(onComplete.mock.calls.at(-1)?.[0]).toEqual({ value: "1234" });
  });

  it("fills from the start when a full-length code is pasted into a later cell", async () => {
    const { otp, cells } = await mount('length="4"');
    cells()[2].focus(); // paste while a later cell is focused
    const paste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "1234" } });
    cells()[2].dispatchEvent(paste);
    // A full code fills the whole field from cell 0 — no digits dropped.
    expect(otp.value).toBe("1234");
  });

  it("masks the cells and allows alphanumeric mode", async () => {
    const { cells } = await mount('length="4" mask mode="alphanumeric"');
    expect(cells()[0].type).toBe("password");
    typeInto(cells()[0], "a");
    expect(cells()[0].value).toBe("a"); // letters allowed in alphanumeric mode
  });
});
