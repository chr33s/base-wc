// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { roving } from "./roving.ts";
import { must } from "./test-utils.ts";

/** Narrow an indexed lookup the fixture guarantees is present. */
afterEach(() => {
  document.body.innerHTML = "";
});

function mount(count = 3) {
  document.body.innerHTML = `<div id="bar">${Array.from(
    { length: count },
    (_, i) => `<button id="b${i}">${i}</button>`,
  ).join("")}</div>`;
  const container = must(document.querySelector<HTMLElement>("#bar"));
  const items = () => [...container.querySelectorAll<HTMLElement>("button")];
  const nav = roving(container, { items, orientation: "horizontal", loop: true });
  nav.refresh(0);
  return { container, items, nav };
}

/** The single element the group offers to the tab sequence. */
const tabbable = (items: HTMLElement[]) => items.filter((el) => el.tabIndex === 0);

describe("roving — tab stop invariant", () => {
  it("keeps exactly one tabbable item", () => {
    const { items } = mount();
    expect(tabbable(items())).toEqual([items()[0]]);
  });

  it("keeps the group reachable when the tabbable item is removed", async () => {
    const { items, nav } = mount();
    nav.focusItem(1);
    expect(tabbable(items())).toEqual([items()[1]]);
    must(items()[1]).remove();
    await Promise.resolve(); // observers deliver on a microtask
    // Losing the only tabindex=0 would drop the whole group out of the tab
    // sequence — unreachable by keyboard with no visible sign anything is wrong.
    expect(tabbable(items())).toHaveLength(1);
  });

  it("holds the stop in place when an item is added before it", async () => {
    const { container, items, nav } = mount();
    nav.focusItem(2);
    const held = items()[2];
    container.insertAdjacentHTML("afterbegin", `<button id="new">new</button>`);
    await Promise.resolve();
    nav.refresh(); // what a component calls after its own items change
    // Tracking the element, not the index: a prepended sibling shifts every
    // index by one, and resetting to index 0 would silently move the user's
    // tab stop to a button they never chose.
    expect(tabbable(items())).toEqual([held]);
  });

  it("refresh() with no argument preserves the stop; with an index it moves it", async () => {
    const { items, nav } = mount();
    nav.focusItem(2);
    nav.refresh();
    expect(tabbable(items())).toEqual([items()[2]]);
    nav.refresh(0);
    expect(tabbable(items())).toEqual([items()[0]]);
  });

  it("re-homes the stop when the held item leaves the navigable set", async () => {
    document.body.innerHTML = `<div id="bar">
      <button id="b0">0</button><button id="b1">1</button></div>`;
    const container = must(document.querySelector<HTMLElement>("#bar"));
    const items = () =>
      [...container.querySelectorAll<HTMLElement>("button")].filter(
        (el) => !el.hasAttribute("disabled"),
      );
    const nav = roving(container, { items });
    nav.refresh(1);
    expect(tabbable(items())).toHaveLength(1);
    must(container.querySelector("#b1")).setAttribute("disabled", "");
    await Promise.resolve();
    expect(tabbable(items())).toEqual([container.querySelector("#b0")]);
    nav.destroy();
  });

  it("takes the stop off an item that left the set but stayed in the DOM", async () => {
    document.body.innerHTML = `<div id="bar">
      <div role="button" id="b0">0</div><div role="button" id="b1">1</div></div>`;
    const container = must(document.querySelector<HTMLElement>("#bar"));
    const all = () => [...container.querySelectorAll<HTMLElement>("[role=button]")];
    const items = () => all().filter((el) => el.getAttribute("aria-disabled") !== "true");
    const nav = roving(container, { items });
    nav.refresh(1);
    must(container.querySelector("#b1")).setAttribute("aria-disabled", "true");
    await Promise.resolve();
    // A non-native element stays focusable with tabindex=0, so leaving it on
    // the disabled item would give the group two tab stops, one of them dead.
    expect(tabbable(all())).toEqual([container.querySelector("#b0")]);
    nav.destroy();
  });
});

describe("roving — teardown and re-attach", () => {
  it("destroy() drops the observer and the keydown listener", async () => {
    const { container, items, nav } = mount();
    nav.destroy();
    container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(tabbable(items())).toEqual([items()[0]]); // navigation is off

    // A destroyed helper must also stop watching: an observer left running on a
    // detached subtree keeps firing for as long as anything mutates it, and
    // keeps the whole component reachable from the mutation record.
    must(items()[0]).remove();
    await Promise.resolve();
    expect(tabbable(items())).toHaveLength(0);
  });

  it("a fresh helper adopts the tab stop already marked in the DOM", () => {
    const { container, items, nav } = mount();
    nav.focusItem(2);
    nav.destroy(); // the owner was removed from the document…

    // …and re-inserted, so it builds a new helper. The DOM is the source of
    // truth, so re-attaching must not silently walk the user's tab stop back to
    // the start of the group.
    const revived = roving(container, { items, orientation: "horizontal", loop: true });
    revived.refresh();
    expect(tabbable(items())).toEqual([items()[2]]);
  });
});
