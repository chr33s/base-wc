import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const Table: Story = {
  name: "Table",
  render: () => html`
    <ui-table class="table" paginate has-next-page>
      <table>
        <thead>
          <tr data-table-controls-row>
            <td data-table-controls-cell colspan="5">
              <div data-table-controls>
                <ui-search-field class="search" data-table-filters debounce="0">
                  <input
                    class="input"
                    type="search"
                    placeholder="Search products"
                    aria-label="Search products"
                  />
                </ui-search-field>
                <div data-table-bulk>
                  <span class="muted sm" data-table-selected-count></span>
                  <button class="btn sm" type="button" data-table-bulk-action disabled>
                    Archive
                  </button>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <th>
              <ui-checkbox class="checkbox">
                <input type="checkbox" data-table-select-all aria-label="Select all" />
              </ui-checkbox>
            </th>
            <th data-sort-key="product" data-list-slot="primary">Product</th>
            <th data-sort-key="status" data-list-slot="inline">Status</th>
            <th data-sort-key="inventory" format="numeric">Inventory</th>
            <th data-sort-key="price" format="currency">Price</th>
          </tr>
        </thead>
        <tbody>
          <tr click-delegate="water-bottle">
            <td>
              <ui-checkbox class="checkbox">
                <input type="checkbox" data-table-select-row value="water-bottle" />
              </ui-checkbox>
            </td>
            <td><a id="water-bottle" class="link" href="#">Water bottle</a></td>
            <td><span class="badge ok">Active</span></td>
            <td>128</td>
            <td>$24.99</td>
          </tr>
          <tr click-delegate="tee">
            <td>
              <ui-checkbox class="checkbox">
                <input type="checkbox" data-table-select-row value="tee" />
              </ui-checkbox>
            </td>
            <td><a id="tee" class="link" href="#">T-shirt</a></td>
            <td><span class="badge warn">Low stock</span></td>
            <td>15</td>
            <td>$19.99</td>
          </tr>
          <tr click-delegate="cutting-board">
            <td>
              <ui-checkbox class="checkbox">
                <input type="checkbox" data-table-select-row value="cutting-board" />
              </ui-checkbox>
            </td>
            <td><a id="cutting-board" class="link" href="#">Cutting board</a></td>
            <td><span class="badge danger">Out of stock</span></td>
            <td>0</td>
            <td>$34.99</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">
              <nav data-table-pagination aria-label="Pagination">
                <button type="button" data-table-previous>Previous</button>
                <button type="button" data-table-next>Next</button>
              </nav>
            </td>
          </tr>
        </tfoot>
      </table>
    </ui-table>
  `,
};
