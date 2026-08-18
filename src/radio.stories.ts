import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const Radio: Story = {
  name: "Radio group",
  render: () => html`
    <ui-radio-group class="stack">
      <label class="field-row">
        <ui-radio class="radio">
          <input type="radio" name="plan" value="free" /><span class="pip"></span>
        </ui-radio>
        Free
      </label>
      <label class="field-row">
        <ui-radio class="radio">
          <input type="radio" name="plan" value="pro" checked /><span class="pip"></span>
        </ui-radio>
        Pro
      </label>
    </ui-radio-group>
  `,
};
