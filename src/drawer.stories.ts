import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Overlays" };
export default meta;
type Story = StoryObj;

export const Drawer: Story = {
  name: "Drawer (swipe / edge-swipe)",
  render: () => html`
    <ui-drawer side="right">
      <button class="btn" data-drawer-trigger>Open drawer</button>
      <div class="swipe-zone" data-drawer-swipe title="drag inward from the right edge"></div>
      <ui-drawer-backdrop class="backdrop"></ui-drawer-backdrop>
      <ui-drawer-popup class="panel drawer">
        <div class="handle" data-drawer-handle>⇔ drag me to dismiss</div>
        <h4>Settings</h4>
        <p class="muted">Swipe the handle right to dismiss, or grab the right edge to reopen.</p>
        <button class="btn" data-drawer-close>Close</button>
      </ui-drawer-popup>
    </ui-drawer>
  `,
};
