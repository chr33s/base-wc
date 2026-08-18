import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const NumberField: Story = {
  name: "Number field (scrub the ⇔ label)",
  render: () => html`
    <ui-number-field class="numfield" scrub-sensitivity="4">
      <span class="scrub" data-number-scrub>⇔</span>
      <button class="btn sm" data-number-decrement>−</button>
      <input class="input num" type="number" name="qty" value="8" min="0" max="100" step="1" />
      <button class="btn sm" data-number-increment>+</button>
    </ui-number-field>
  `,
};
