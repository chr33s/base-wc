import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const Separator: Story = {
  render: () => html`
    <div class="row gap center">
      <span>Home</span>
      <ui-separator class="sep vertical" aria-orientation="vertical"></ui-separator>
      <span>Docs</span>
      <ui-separator class="sep vertical" aria-orientation="vertical"></ui-separator>
      <span>Blog</span>
    </div>
    <ui-separator class="sep"></ui-separator>
  `,
};
