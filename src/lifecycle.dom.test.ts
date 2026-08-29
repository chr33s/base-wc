// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { connectLightDom } from "./lifecycle.ts";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("connectLightDom", () => {
  it("wires on the next microtask when the host is already complete", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let wired = false;
    connectLightDom(
      host,
      () => wired,
      () => {
        wired = true;
      },
    );
    expect(wired).toBe(false); // deferred, never synchronous
    await flush();
    expect(wired).toBe(true);
  });

  it("retries on the next light-DOM mutation while the host is incomplete", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    // The shape every component follows: `wire` claims the host only once the
    // part it needs exists, so an early pass leaves `isWired` false and the
    // helper keeps watching.
    let attempts = 0;
    let wired = false;
    const wire = () => {
      attempts++;
      if (host.querySelector("span")) wired = true;
    };
    connectLightDom(host, () => wired, wire);
    await flush();
    expect(attempts).toBe(1);
    expect(wired).toBe(false); // still waiting

    host.append(document.createElement("span")); // the part finally arrives
    await flush();
    await flush();
    expect(attempts).toBe(2);
    expect(wired).toBe(true);
  });

  it("stops retrying once wired, so a later mutation does not re-wire", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let attempts = 0;
    const isWired = () => host.querySelector("span") != null;
    connectLightDom(host, isWired, () => {
      attempts++;
      host.append(document.createElement("span"));
    });
    await flush();
    await flush();
    expect(attempts).toBe(1);

    host.append(document.createElement("b"));
    await flush();
    await flush();
    expect(attempts).toBe(1);
  });

  it("does not wire a host disconnected before the microtask ran", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let wired = false;
    connectLightDom(
      host,
      () => wired,
      () => {
        wired = true;
      },
    );
    host.remove();
    await flush();
    expect(wired).toBe(false);
  });

  /**
   * The contract every light-DOM component opts into: a component must not
   * claim its host until the parts it needs exist, or `connectLightDom` stops
   * watching and a renderer that appends those parts later is never noticed.
   * `ui-table` used to set its wired flag first and silently never enhance.
   */
  it.each([
    [
      "ui-table",
      `<table><thead><tr><th data-sort-key="n">N</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>`,
      (host: Element) => host.querySelector("th")!.hasAttribute("data-sortable"),
    ],
    [
      "ui-select",
      `<button data-select-trigger><span data-select-value>Pick</span></button>
       <ui-select-popup><ui-select-option value="a">A</ui-select-option></ui-select-popup>`,
      (host: Element) => host.querySelector("[data-select-trigger]")!.hasAttribute("aria-haspopup"),
    ],
    [
      "ui-scroll-area",
      `<ui-scroll-viewport><div></div></ui-scroll-viewport>
       <ui-scroll-scrollbar data-orientation="vertical"><ui-scroll-thumb></ui-scroll-thumb></ui-scroll-scrollbar>`,
      (host: Element) => host.querySelector<HTMLElement>("ui-scroll-thumb")!.style.height !== "",
    ],
  ])("%s enhances parts appended after connection", async (tag, markup, enhanced) => {
    document.body.innerHTML = `<${tag}></${tag}>`;
    const host = document.querySelector(tag)!;
    await flush();
    await flush();

    host.innerHTML = markup; // framework render / htmx swap lands late
    await flush();
    await flush();

    expect(enhanced(host)).toBe(true);
  });
});
