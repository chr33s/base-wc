import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const Toggle: Story = {
  render: () => html`<ui-toggle class="toggle" value="star">★ Star</ui-toggle>`,
};

export const ToggleGroup: Story = {
  name: "Toggle group",
  render: () => html`
    <ui-toggle-group class="toolbar-row" aria-label="Alignment">
      <ui-toggle class="toggle" value="left">⇤</ui-toggle>
      <ui-toggle class="toggle" value="center">↔</ui-toggle>
      <ui-toggle class="toggle" value="right">⇥</ui-toggle>
    </ui-toggle-group>
  `,
};
