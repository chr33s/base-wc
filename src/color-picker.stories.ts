import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const ColorPicker: Story = {
  name: "Color picker",
  render: () => html`<ui-color-picker name="brand" value="#3366ff"></ui-color-picker>`,
};

export const ColorField: Story = {
  name: "Color field (native-first)",
  render: () => html`
    <label class="field-row">
      Brand color
      <ui-color-field class="color-field">
        <input type="color" name="brand" value="#3366ff" aria-label="Brand color" />
      </ui-color-field>
    </label>
  `,
};
