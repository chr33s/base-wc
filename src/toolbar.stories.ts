import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const Toolbar: Story = {
  render: () => html`
    <ui-toolbar class="toolbar-row" aria-label="Format">
      <button class="btn sm" data-toolbar-item>Cut</button>
      <button class="btn sm" data-toolbar-item>Copy</button>
      <button class="btn sm" data-toolbar-item>Paste</button>
      <ui-switch class="switch"><input type="checkbox" /><span class="thumb"></span></ui-switch>
    </ui-toolbar>
  `,
};
