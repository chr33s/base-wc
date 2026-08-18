// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount(attrs = 'value="40" min="0" max="100" step="1"') {
  document.body.innerHTML = `
    <ui-slider name="volume" ${attrs}>
      <ui-slider-track><ui-slider-thumb></ui-slider-thumb></ui-slider-track>
    </ui-slider>`;
  await Promise.resolve();
  const slider = document.querySelector("ui-slider")!;
  const thumb = document.querySelector("ui-slider-thumb")!;
  return { slider, thumb };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-slider", () => {
  it("wires slider ARIA and the initial value/fraction", async () => {
    const { slider, thumb } = await mount();
    expect(thumb.getAttribute("role")).toBe("slider");
    expect(thumb.getAttribute("aria-valuemin")).toBe("0");
    expect(thumb.getAttribute("aria-valuemax")).toBe("100");
    expect(thumb.getAttribute("aria-valuenow")).toBe("40");
    expect(thumb.tabIndex).toBe(0);
    expect(slider.style.getPropertyValue("--slider")).toBe("0.4");
    expect((thumb as HTMLElement).style.left).toBe("40%");
  });

  it("moves with the arrow keys and reports change", async () => {
    const { slider, thumb } = await mount();
    const onChange = vi.fn<(detail: { value: number }) => void>();
    slider.addEventListener("change", (e) =>
      onChange((e as CustomEvent<{ value: number }>).detail),
    );
    key(thumb, "ArrowRight");
    expect(slider.value).toBe(41);
    key(thumb, "ArrowLeft");
    key(thumb, "ArrowLeft");
    expect(slider.value).toBe(39);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("supports Page/Home/End and clamps to the range", async () => {
    const { slider, thumb } = await mount();
    key(thumb, "PageUp"); // +10% of range = 10
    expect(slider.value).toBe(50);
    key(thumb, "Home");
    expect(slider.value).toBe(0);
    key(thumb, "ArrowLeft"); // already at min → stays
    expect(slider.value).toBe(0);
    key(thumb, "End");
    expect(slider.value).toBe(100);
  });

  it("snaps to step", async () => {
    const { slider } = await mount('value="0" min="0" max="100" step="10"');
    slider.value = 34; // snaps to 30
    expect(slider.value).toBe(30);
  });

  it("reflects a vertical orientation", async () => {
    const { thumb } = await mount('value="25" min="0" max="100" orientation="vertical"');
    expect(thumb.getAttribute("aria-orientation")).toBe("vertical");
    expect((thumb as HTMLElement).style.bottom).toBe("25%");
  });

  it("keeps a legitimate 0 bound (max=0 on a negative range)", async () => {
    const { slider, thumb } = await mount('value="-50" min="-100" max="0" step="1"');
    expect(thumb.getAttribute("aria-valuemax")).toBe("0"); // not the 100 fallback
    expect(slider.style.getPropertyValue("--slider")).toBe("0.5"); // (-50 − −100)/(0 − −100)
  });
});

describe("ui-slider — adopts a native range input (no-JS fallback)", () => {
  async function mountNative(attrs = 'value="40" min="0" max="100" step="1"') {
    document.body.innerHTML = `
      <form>
        <ui-slider>
          <input type="range" name="volume" ${attrs} />
        </ui-slider>
      </form>`;
    await Promise.resolve();
    const form = document.querySelector("form")!;
    const slider = document.querySelector<
      HTMLElement & { value: number | number[]; range: boolean }
    >("ui-slider")!;
    const input = document.querySelector<HTMLInputElement>("input")!;
    return { form, slider, input };
  }

  it("the native range is the form value, with or without JS", async () => {
    const { form, slider } = await mountNative();
    expect(new FormData(form).get("volume")).toBe("40");
    expect(slider.value).toBe(40);
  });

  it("publishes the value fraction as --slider and leaves the role to the input", async () => {
    const { slider, input } = await mountNative();
    expect(slider.style.getPropertyValue("--slider")).toBe("0.4");
    expect(input.getAttribute("role")).toBe(null); // native range is a slider
    expect(slider.range).toBe(false);
  });

  it("updates --slider when the native value changes", async () => {
    const { slider, input } = await mountNative();
    input.value = "75";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(slider.style.getPropertyValue("--slider")).toBe("0.75");
    expect(slider.value).toBe(75);
  });

  it("writes back through the value setter", async () => {
    const { slider, input } = await mountNative();
    slider.value = 10;
    expect(input.value).toBe("10");
    expect(slider.style.getPropertyValue("--slider")).toBe("0.1");
  });
});

describe("ui-slider — range (multiple thumbs)", () => {
  async function mount(attrs = 'value="20,80" min="0" max="100" step="1" min-distance="10"') {
    document.body.innerHTML = `
      <ui-slider name="price" ${attrs}>
        <ui-slider-track>
          <ui-slider-thumb id="lo"></ui-slider-thumb>
          <ui-slider-thumb id="hi"></ui-slider-thumb>
        </ui-slider-track>
      </ui-slider>`;
    await Promise.resolve();
    const slider = document.querySelector<
      HTMLElement & { value: number | number[]; range: boolean }
    >("ui-slider")!;
    const lo = document.querySelector<HTMLElement>("#lo")!;
    const hi = document.querySelector<HTMLElement>("#hi")!;
    return { slider, lo, hi };
  }

  it("wires two thumbs with neighbor-bounded ranges and fill vars", async () => {
    const { slider, lo, hi } = await mount();
    expect(slider.range).toBe(true);
    expect(slider.value).toEqual([20, 80]);
    expect(lo.getAttribute("aria-valuenow")).toBe("20");
    expect(hi.getAttribute("aria-valuenow")).toBe("80");
    expect(lo.getAttribute("aria-valuemin")).toBe("0"); // [min, hi]
    expect(lo.getAttribute("aria-valuemax")).toBe("80");
    expect(hi.getAttribute("aria-valuemin")).toBe("20"); // [lo, max]
    expect(hi.getAttribute("aria-valuemax")).toBe("100");
    expect(slider.style.getPropertyValue("--slider-start")).toBe("0.2");
    expect(slider.style.getPropertyValue("--slider-end")).toBe("0.8");
  });

  it("keeps thumbs from crossing, honouring min-distance", async () => {
    const { slider, lo } = await mount();
    for (let i = 0; i < 20; i++) key(lo, "ArrowRight"); // 20 → 40 (under the cap)
    expect((slider.value as number[])[0]).toBe(40);
    for (let i = 0; i < 50; i++) key(lo, "ArrowRight"); // pushes into the cap
    expect((slider.value as number[])[0]).toBe(70); // clamped at hi(80) − min-distance(10)
  });

  it("updates both values via the array setter and submits each", async () => {
    const { slider, lo, hi } = await mount();
    slider.value = [10, 90];
    expect(slider.value).toEqual([10, 90]);
    expect(lo.getAttribute("aria-valuenow")).toBe("10");
    expect(hi.getAttribute("aria-valuenow")).toBe("90");
  });
});
