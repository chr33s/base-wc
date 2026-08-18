import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const Checkbox: Story = {
  name: "Checkbox (group, select all)",
  render: () => html`
    <ui-checkbox-group class="stack">
      <label class="field-row">
        <ui-checkbox class="checkbox" data-checkbox-all>
          <input type="checkbox" />
        </ui-checkbox>
        <strong>Select all</strong>
      </label>
      <label class="field-row indent">
        <ui-checkbox class="checkbox">
          <input type="checkbox" name="scope" value="read" checked />
        </ui-checkbox>
        Read
      </label>
      <label class="field-row indent">
        <ui-checkbox class="checkbox">
          <input type="checkbox" name="scope" value="write" />
        </ui-checkbox>
        Write
      </label>
    </ui-checkbox-group>
  `,
};
