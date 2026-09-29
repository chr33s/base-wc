// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { must } from "./test-utils.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-avatar", () => {
  it("settles on error when there is no image, so CSS can show the fallback", async () => {
    document.body.innerHTML = `
      <ui-avatar>
        <span data-avatar-fallback>AB</span>
      </ui-avatar>`;
    await Promise.resolve();
    expect(must(document.querySelector("ui-avatar")).state).toBe("error");
  });

  it("treats an image without a src as an error", async () => {
    document.body.innerHTML = `
      <ui-avatar>
        <img data-avatar-image alt="">
        <span data-avatar-fallback>AB</span>
      </ui-avatar>`;
    await Promise.resolve();
    expect(must(document.querySelector("ui-avatar")).state).toBe("error");
  });

  it("wires parts that arrive after the connect microtask", async () => {
    document.body.innerHTML = "<ui-avatar></ui-avatar>";
    const avatar = must(document.querySelector("ui-avatar"));
    await Promise.resolve(); // wiring attempt runs against the empty host
    expect(avatar.hasAttribute("data-state")).toBe(false); // no premature error
    avatar.innerHTML = "<span data-avatar-fallback>AB</span>";
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver retry
    expect(avatar.state).toBe("error");
  });
});
