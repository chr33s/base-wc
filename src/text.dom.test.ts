// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { localeOf, normalize } from "./text.ts";
import { must } from "./test-utils.ts";

/** Narrow a lookup the fixture guarantees is present. */
afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("lang");
});

describe("normalize", () => {
  it("folds case and strips diacritics so `jose` matches `José`", () => {
    expect(normalize("José")).toBe("jose");
    expect(normalize("  JOSÉ  ")).toBe("jose");
  });

  it("folds Turkish dotted and dotless I correctly under a tr locale", () => {
    // The whole point of threading a locale through: the Unicode default rules
    // lowercase `I` to `i`, but Turkish lowercases it to the dotless `ı` and
    // `İ` to `i`. Getting this wrong makes a query of `i` match Isparta and
    // miss İzmir — exactly backwards for a Turkish reader.
    expect(normalize("İzmir", "tr")).toBe("izmir");
    expect(normalize("Isparta", "tr")).toBe("ısparta");
    expect(normalize("İzmir", "tr").includes(normalize("i", "tr"))).toBe(true);
    expect(normalize("Isparta", "tr").includes(normalize("i", "tr"))).toBe(false);
  });

  it("matches both spellings with the default locale, where `i` is unmarked", () => {
    // Without a locale the combining dot above is stripped, so both fold to a
    // plain `i` and a query of `i` matches each — permissive, never wrong.
    expect(normalize("İzmir").includes("i")).toBe(true);
    expect(normalize("Isparta").includes("i")).toBe(true);
  });
});

describe("localeOf", () => {
  it("prefers the nearest lang over the document's", () => {
    document.documentElement.setAttribute("lang", "en");
    document.body.innerHTML = `<div lang="tr"><span id="inner"></span></div>`;
    expect(localeOf(document.querySelector("#inner"))).toBe("tr");
  });

  it("falls back to the document language, then to the runtime default", () => {
    document.body.innerHTML = `<span id="inner"></span>`;
    const inner = must(document.querySelector("#inner"));
    document.documentElement.setAttribute("lang", "sv");
    expect(localeOf(inner)).toBe("sv");
    document.documentElement.removeAttribute("lang");
    expect(localeOf(inner)).toBeUndefined();
  });

  it("drops a malformed lang instead of throwing on every keystroke", () => {
    // `en_US` (underscore) is the classic mistake; `toLocaleLowerCase` throws
    // a RangeError on it, which would break every filter and typeahead.
    document.documentElement.setAttribute("lang", "en_US");
    document.body.innerHTML = `<span id="inner"></span>`;
    const inner = must(document.querySelector("#inner"));
    expect(localeOf(inner)).toBeUndefined();
    expect(() => normalize("İzmir", localeOf(inner))).not.toThrow();
    document.body.innerHTML = `<div lang="tr"><span id="ok"></span></div>`;
    expect(localeOf(document.querySelector("#ok"))).toBe("tr");
  });
});
