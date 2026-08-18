import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const Progress: Story = {
  render: () => html`
    <div style="min-width:16rem">
      <ui-progress class="progress" value="64" max="100"><span class="bar"></span></ui-progress>
      <ui-progress class="progress" indeterminate><span class="bar"></span></ui-progress>
    </div>
  `,
};
