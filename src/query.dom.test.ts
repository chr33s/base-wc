// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

/** Narrow a lookup the fixture guarantees is present. */
afterEach(() => {
  document.body.innerHTML = "";
});

import { isOwnedBy, queryPair, scopedFirst, scopedQuery } from "./query.ts";
import { must } from "./test-utils.ts";

function mount(): HTMLElement {
  document.body.innerHTML = `
    <ui-tabs id="outer">
      <button data-tab id="a"></button>
      <ui-tabs id="inner"><button data-tab id="b"></button></ui-tabs>
    </ui-tabs>`;
  return must(document.querySelector<HTMLElement>("#outer"));
}

describe("scoped queries", () => {
  it("excludes descendants owned by a nested same-tag instance", () => {
    const outer = mount();
    expect(scopedQuery(outer, "[data-tab]").map((el) => el.id)).toEqual(["a"]);
    expect(scopedFirst(outer, "[data-tab]")?.id).toBe("a");
    expect(scopedFirst(outer, "[data-missing]")).toBeNull();
  });

  it("answers ownership from the nearest same-tag ancestor", () => {
    const outer = mount();
    expect(isOwnedBy(outer, must(document.querySelector("#a")))).toBe(true);
    expect(isOwnedBy(outer, must(document.querySelector("#b")))).toBe(false);
  });
});

describe("queryPair", () => {
  it("returns both parts, or null unless both exist", () => {
    document.body.innerHTML = '<div id="h"><i class="x"></i><b class="y"></b></div>';
    const host = must(document.querySelector("#h"));
    expect(queryPair(host, ".x", ".y")?.map((el) => el.localName)).toEqual(["i", "b"]);
    expect(queryPair(host, ".x", ".z")).toBeNull();
  });
});
