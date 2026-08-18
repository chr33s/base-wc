import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Overlays" };
export default meta;
type Story = StoryObj;

export const Popover: Story = {
  name: "Popover (+ arrow)",
  render: () => html`
    <ui-popover>
      <button class="btn" data-popover-trigger>Share</button>
      <ui-popover-popup class="panel popover">
        <ui-arrow class="arrow"></ui-arrow>
        <h4 data-popover-title>Share link</h4>
        <p data-popover-description class="muted">Anyone with the link can view.</p>
        <input class="input" value="https://example.com/p/9f3" readonly />
        <button class="btn sm" data-popover-close>Done</button>
      </ui-popover-popup>
    </ui-popover>
  `,
};
