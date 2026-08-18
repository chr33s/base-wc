import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const SearchField: Story = {
  name: "Search field",
  render: () => html`
    <ui-search-field class="search" debounce="200">
      <input class="input" type="search" name="q" placeholder="Search…" />
    </ui-search-field>
  `,
};
