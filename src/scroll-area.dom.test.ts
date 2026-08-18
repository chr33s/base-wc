// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

// happy-dom has no layout (scrollHeight/clientHeight are 0), so overflow
// detection and thumb sizing are covered by ui.e2e.test.ts. Here we only assert
// the wiring: elements register and orientation is normalized.
afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-scroll-area", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-scroll-area>
        <ui-scroll-viewport><div>content</div></ui-scroll-viewport>
        <ui-scroll-scrollbar data-orientation="vertical"><ui-scroll-thumb></ui-scroll-thumb></ui-scroll-scrollbar>
        <ui-scroll-scrollbar><ui-scroll-thumb></ui-scroll-thumb></ui-scroll-scrollbar>
      </ui-scroll-area>`;
    await Promise.resolve();
    const area = document.querySelector("ui-scroll-area")!;
    const bars = [...document.querySelectorAll("ui-scroll-scrollbar")];
    return { area, bars };
  }

  it("normalizes scrollbar orientation (defaulting to vertical)", async () => {
    const { bars } = await mount();
    expect(bars[0].getAttribute("data-orientation")).toBe("vertical");
    expect(bars[1].getAttribute("data-orientation")).toBe("vertical");
  });

  it("reports no overflow without layout", async () => {
    const { area, bars } = await mount();
    expect(area.hasAttribute("data-overflow-y")).toBe(false);
    expect(bars[0].hasAttribute("hidden")).toBe(true); // hidden when nothing overflows
  });
});
