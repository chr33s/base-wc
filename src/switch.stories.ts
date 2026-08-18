import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const Switch: Story = {
  render: () => html`
    <label class="field-row">
      <ui-switch class="switch">
        <input type="checkbox" name="notify" checked /><span class="thumb"></span>
      </ui-switch>
      Notifications
    </label>
  `,
};
