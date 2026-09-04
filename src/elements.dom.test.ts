// @vitest-environment happy-dom
/**
 * The `elements.ts` roster is hand-maintained, and nothing about adding a
 * component forces you to append to it. Drift is silent in the worst possible
 * way: the class still registers in a source build (importing any module runs
 * its `define`), so tests and the dev server look fine — but in the packed
 * register-all bundle the module has nothing keeping it alive and gets
 * tree-shaken out, so the element never registers for consumers.
 *
 * `scripts/check-package.ts` only floors the packed count, which cannot catch
 * a single omission. This closes that gap at the source level: every element
 * class the barrel exports must appear in the roster, and vice versa.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import * as ui from "./index.ts";

/** The `ui.UIFoo,` entries of the roster, read from source. */
function roster() {
  const source = readFileSync(resolve(import.meta.dirname, "elements.ts"), "utf8");
  const block = source.slice(source.indexOf("const constructors"), source.indexOf("];"));
  return new Set([...block.matchAll(/\bui\.(UI\w+)\b/g)].map((m) => m[1]));
}

/** Barrel exports that are actually registered custom elements, by export name. */
function registeredExports() {
  const found = new Set<string>();
  for (const [name, value] of Object.entries(ui)) {
    if (typeof value !== "function") continue;
    // `getName` is the authority on "this class is a registered element", so
    // the shared bases (`UIPopupElement`, `UIChartSeries`, …) are excluded
    // without having to list them.
    if (customElements.getName(value as CustomElementConstructor)) found.add(name);
  }
  return found;
}

describe("elements roster", () => {
  it("lists every element class the barrel exports", () => {
    const missing = [...registeredExports()].filter((name) => !roster().has(name)).sort();
    expect(missing, `add these to the roster in elements.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists nothing the barrel does not export as an element", () => {
    const registered = registeredExports();
    const stale = [...roster()].filter((name) => !registered.has(name)).sort();
    expect(stale, `remove these from the roster in elements.ts: ${stale.join(", ")}`).toEqual([]);
  });
});
