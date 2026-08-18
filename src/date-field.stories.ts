import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const DateField: Story = {
  name: "Date field (native-first)",
  render: () => html`
    <label class="field-row">
      Due date
      <ui-date-field class="date-field">
        <input class="input" type="date" name="due" value="2026-07-15" style="width:auto" />
      </ui-date-field>
    </label>
  `,
};
