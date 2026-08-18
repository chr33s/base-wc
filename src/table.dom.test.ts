// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(markup: string) {
  document.body.innerHTML = markup;
  await flush();
  await flush();
  return document.querySelector("ui-table")!;
}

describe("ui-table", () => {
  it("keeps native table markup and annotates cells for list rendering", async () => {
    const el = await mount(`
      <ui-table variant="list" loading>
        <table>
          <thead>
            <tr>
              <th scope="col" data-list-slot="primary">Product</th>
              <th scope="col" data-list-slot="inline">Status</th>
              <th scope="col" format="numeric">Inventory</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Water bottle</td><td>Active</td><td>128</td></tr>
          </tbody>
        </table>
      </ui-table>`);

    expect(el.dataset.variant).toBe("list");
    expect(el.getAttribute("aria-busy")).toBe("true");
    expect(el.querySelector("table")).toBeTruthy();
    const cells = el.querySelectorAll("tbody td");
    expect(cells[0].getAttribute("data-label")).toBe("Product");
    expect(cells[0].getAttribute("data-list-slot")).toBe("primary");
    expect(cells[1].getAttribute("data-list-slot")).toBe("inline");
    expect(cells[2].getAttribute("data-format")).toBe("numeric");
  });

  it("sorts sortable headers by text and numeric formats, toggling aria-sort", async () => {
    const el = await mount(`
      <ui-table>
        <table>
          <thead>
            <tr data-table-controls-row>
              <td data-table-controls-cell colspan="2"><div data-table-controls>Filters</div></td>
            </tr>
            <tr>
              <th data-sort-key="name">Name</th>
              <th data-sort-key="orders" format="numeric">Orders</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Beta</td><td>2</td></tr>
            <tr><td>Alpha</td><td>10</td></tr>
          </tbody>
        </table>
      </ui-table>`);
    const headers = el.querySelectorAll<HTMLTableCellElement>("thead tr[data-table-header-row] th");
    const firstColumn = () =>
      [...el.querySelectorAll("tbody tr")].map((row) => row.children[0].textContent);
    const orders = () =>
      [...el.querySelectorAll("tbody tr")].map((row) => row.children[1].textContent);

    // Sortable headers advertise their resting state to assistive tech.
    expect(headers[0].getAttribute("aria-sort")).toBe("none");
    // Each sortable header is wrapped in a real button for keyboard/SR activation.
    expect(headers[0].querySelector("button[data-table-sort]")).toBeTruthy();

    headers[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(firstColumn()).toEqual(["Alpha", "Beta"]);
    expect(headers[0].getAttribute("aria-sort")).toBe("ascending");

    headers[1].querySelector<HTMLButtonElement>("button")!.click();
    expect(orders()).toEqual(["2", "10"]);
    expect(headers[1].getAttribute("aria-sort")).toBe("ascending");
    expect(headers[0].getAttribute("aria-sort")).toBe("none");
  });

  it("toggles to descending sort and emits a directional sort event on re-activation", async () => {
    const el = await mount(`
      <ui-table>
        <table>
          <thead><tr><th data-sort-key="name">Name</th></tr></thead>
          <tbody>
            <tr><td>Alpha</td></tr>
            <tr><td>Beta</td></tr>
          </tbody>
        </table>
      </ui-table>`);
    const header = el.querySelector<HTMLTableCellElement>("th[data-sort-key]")!;
    const names = () => [...el.querySelectorAll("tbody tr")].map((r) => r.textContent?.trim());
    const directions: string[] = [];
    el.addEventListener("sort", (event) => {
      if (event instanceof CustomEvent) directions.push(event.detail.direction);
    });

    header.querySelector<HTMLButtonElement>("button")!.click();
    expect(names()).toEqual(["Alpha", "Beta"]);
    expect(header.getAttribute("aria-sort")).toBe("ascending");

    header.querySelector<HTMLButtonElement>("button")!.click();
    expect(names()).toEqual(["Beta", "Alpha"]);
    expect(header.getAttribute("aria-sort")).toBe("descending");
    expect(directions).toEqual(["ascending", "descending"]);
  });

  it("sorts a currency column numerically after stripping symbols, treating non-numeric text as 0", async () => {
    const el = await mount(`
      <ui-table>
        <table>
          <thead><tr><th data-sort-key="price" format="currency">Price</th></tr></thead>
          <tbody>
            <tr><td>$1,000.00</td></tr>
            <tr><td>$99.00</td></tr>
            <tr><td>$1,299.00</td></tr>
            <tr><td>Free</td></tr>
          </tbody>
        </table>
      </ui-table>`);
    const header = el.querySelector<HTMLTableCellElement>("th[data-sort-key]")!;
    const prices = () => [...el.querySelectorAll("tbody tr")].map((r) => r.textContent?.trim());

    header.querySelector<HTMLButtonElement>("button")!.click();
    expect(prices()).toEqual(["Free", "$99.00", "$1,000.00", "$1,299.00"]);
  });

  it("moves filters and bulk actions into a controls row above the headers", async () => {
    const el = await mount(`
      <ui-table>
        <ui-search-field data-table-filters debounce="0"><input type="search" aria-label="Search"></ui-search-field>
        <table>
          <thead>
            <tr>
              <th><ui-checkbox class="checkbox"><input type="checkbox" data-table-select-all aria-label="Select all"></ui-checkbox></th>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><ui-checkbox class="checkbox"><input type="checkbox" value="a" data-table-select-row></ui-checkbox></td><td>Alpha</td></tr>
            <tr><td><ui-checkbox class="checkbox"><input type="checkbox" value="b" data-table-select-row></ui-checkbox></td><td>Beta</td></tr>
          </tbody>
        </table>
        <span data-table-selected-count></span>
        <button type="button" data-table-bulk-action>Archive</button>
      </ui-table>`);
    const controlsRow = el.querySelector<HTMLTableRowElement>("thead tr:first-child")!;
    expect(controlsRow.hasAttribute("data-table-controls-row")).toBe(true);
    expect(controlsRow.nextElementSibling?.hasAttribute("data-table-header-row")).toBe(true);
    expect(controlsRow.querySelector("[data-table-filters]")).toBeTruthy();
    expect(controlsRow.querySelector("[data-table-bulk]")).toBeTruthy();

    const selectAll = el.querySelector<HTMLInputElement>("[data-table-select-all]")!;
    const rows = [...el.querySelectorAll<HTMLInputElement>("[data-table-select-row]")];
    const count = el.querySelector<HTMLElement>("[data-table-selected-count]")!;
    const action = el.querySelector<HTMLButtonElement>("[data-table-bulk-action]")!;
    const stateOf = (input: HTMLInputElement) =>
      input.closest("ui-checkbox")?.getAttribute("data-state");

    let selected = 0;
    el.addEventListener("selectionchange", (event) => {
      if (event instanceof CustomEvent) selected = event.detail.selected;
    });

    selectAll.click();
    expect(rows.every((row) => row.checked)).toBe(true);
    expect(el.getAttribute("data-selected-count")).toBe("2");
    expect(count.textContent).toBe("2 selected");
    expect(action.disabled).toBe(false);
    expect(stateOf(selectAll)).toBe("checked");
    expect(selected).toBe(2);

    rows[0].click();
    expect(rows[0].checked).toBe(false);
    expect(stateOf(selectAll)).toBe("indeterminate");
    expect(el.getAttribute("data-selected-count")).toBe("1");
  });

  it("generates pagination controls in tfoot and emits page events", async () => {
    const el = await mount(`
      <ui-table paginate has-next-page>
        <table><tbody><tr><td>One</td></tr></tbody></table>
      </ui-table>`);
    const footer = el.querySelector("tfoot")!;
    const pagination = footer.querySelector("[data-table-pagination]")!;
    const previous = pagination.querySelector<HTMLButtonElement>("[data-table-previous]")!;
    const next = pagination.querySelector<HTMLButtonElement>("[data-table-next]")!;
    const events: string[] = [];
    el.addEventListener("previouspage", () => events.push("previous"));
    el.addEventListener("nextpage", () => events.push("next"));

    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    previous.click();
    next.click();
    expect(events).toEqual(["next"]);

    el.setAttribute("has-previous-page", "");
    el.setAttribute("loading", "");
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });

  it("emits previouspage and tears down generated pagination when paginate is removed", async () => {
    const el = await mount(`
      <ui-table paginate has-previous-page has-next-page>
        <table><tbody><tr><td>One</td></tr></tbody></table>
      </ui-table>`);
    const previous = el.querySelector<HTMLButtonElement>("[data-table-previous]")!;
    const events: string[] = [];
    el.addEventListener("previouspage", () => events.push("previous"));

    expect(previous.disabled).toBe(false);
    previous.click();
    expect(events).toEqual(["previous"]);

    el.removeAttribute("paginate");
    await flush();
    expect(el.querySelector("[data-table-pagination]")).toBeNull();
    expect(el.querySelector("[data-table-pagination-row]")).toBeNull();
  });

  it("spans generated pagination across every column of a header-less table", async () => {
    const el = await mount(`
      <ui-table paginate has-next-page>
        <table><tbody><tr><td>A</td><td>B</td><td>C</td></tr></tbody></table>
      </ui-table>`);
    const cell = el.querySelector<HTMLTableCellElement>("[data-table-pagination-cell]")!;
    expect(cell.colSpan).toBe(3);
  });

  it("re-annotates rows appended after mount via the mutation observer", async () => {
    const el = await mount(`
      <ui-table variant="list">
        <table>
          <thead><tr><th data-list-slot="primary">Name</th><th format="numeric">Qty</th></tr></thead>
          <tbody><tr><td>Alpha</td><td>1</td></tr></tbody>
        </table>
      </ui-table>`);
    const row = document.createElement("tr");
    row.innerHTML = "<td>Beta</td><td>2</td>";
    el.querySelector("tbody")!.append(row);
    await flush();

    const cells = row.querySelectorAll("td");
    expect(row.getAttribute("data-table-row")).toBe("");
    expect(cells[0].getAttribute("data-label")).toBe("Name");
    expect(cells[0].getAttribute("data-list-slot")).toBe("primary");
    expect(cells[1].getAttribute("data-format")).toBe("numeric");
  });

  it("exposes selectedValues and re-annotates on an explicit refresh()", async () => {
    const el = await mount(`
      <ui-table>
        <table>
          <thead><tr><th>Sel</th><th>Name</th></tr></thead>
          <tbody>
            <tr><td><input type="checkbox" value="a" data-table-select-row checked></td><td>Alpha</td></tr>
            <tr><td><input type="checkbox" value="b" data-table-select-row></td><td>Beta</td></tr>
          </tbody>
        </table>
      </ui-table>`);
    expect([...el.selectedValues]).toEqual(["a"]);

    const row = document.createElement("tr");
    row.innerHTML =
      '<td><input type="checkbox" value="c" data-table-select-row checked></td><td>Gamma</td>';
    el.querySelector("tbody")!.append(row);
    el.refresh();

    expect([...el.selectedValues]).toEqual(["a", "c"]);
    expect(row.querySelectorAll("td")[1].getAttribute("data-label")).toBe("Name");
  });

  it("clears count, live region, and select-all state when the last row is deselected", async () => {
    const el = await mount(`
      <ui-table>
        <table>
          <thead><tr>
            <th><ui-checkbox class="checkbox"><input type="checkbox" data-table-select-all aria-label="Select all"></ui-checkbox></th>
            <th>Name</th>
          </tr></thead>
          <tbody>
            <tr><td><ui-checkbox class="checkbox"><input type="checkbox" value="a" data-table-select-row></ui-checkbox></td><td>Alpha</td></tr>
          </tbody>
        </table>
        <span data-table-selected-count></span>
      </ui-table>`);
    const selectAll = el.querySelector<HTMLInputElement>("[data-table-select-all]")!;
    const row = el.querySelector<HTMLInputElement>("[data-table-select-row]")!;
    const count = el.querySelector<HTMLElement>("[data-table-selected-count]")!;
    const stateOf = (input: HTMLInputElement) =>
      input.closest("ui-checkbox")?.getAttribute("data-state");

    expect(count.getAttribute("role")).toBe("status");

    row.click();
    expect(el.getAttribute("data-selected-count")).toBe("1");
    expect(count.hidden).toBe(false);
    expect(stateOf(selectAll)).toBe("checked");

    row.click();
    expect(el.getAttribute("data-selected-count")).toBe("0");
    expect(count.hidden).toBe(true);
    expect(stateOf(selectAll)).toBe("unchecked");
    expect(selectAll.indeterminate).toBe(false);
  });

  it("disables select-all when there are no selectable rows", async () => {
    const el = await mount(`
      <ui-table>
        <table>
          <thead><tr><th><input type="checkbox" data-table-select-all aria-label="Select all"></th><th>Name</th></tr></thead>
          <tbody></tbody>
        </table>
      </ui-table>`);
    expect(el.querySelector<HTMLInputElement>("[data-table-select-all]")!.disabled).toBe(true);
  });

  it("delegates row clicks to an in-row primary action without double-firing controls", async () => {
    const el = await mount(`
      <ui-table>
        <table>
          <tbody>
            <tr click-delegate="open-alpha">
              <td><button type="button" id="archive-alpha">Archive</button></td>
              <td class="name">Alpha</td>
              <td><a id="open-alpha" href="/alpha">Open</a></td>
            </tr>
            <tr><td class="beta">Beta</td></tr>
          </tbody>
        </table>
      </ui-table>`);
    const link = el.querySelector<HTMLAnchorElement>("#open-alpha")!;
    let clicks = 0;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      clicks++;
    });

    // A plain cell in the delegated row triggers the primary action once.
    el.querySelector<HTMLElement>("td.name")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(clicks).toBe(1);
    // The link itself still fires natively, not via delegation.
    link.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicks).toBe(2);
    // A click originating on an interactive child must NOT delegate.
    el.querySelector<HTMLButtonElement>("#archive-alpha")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(clicks).toBe(2);
    // A row without a delegate does nothing.
    el.querySelector<HTMLElement>("td.beta")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(clicks).toBe(2);
  });
});
