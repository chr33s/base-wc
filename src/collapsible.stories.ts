import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Disclosure" };
export default meta;
type Story = StoryObj;

export const Collapsible: Story = {
  render: () => html`
    <ui-collapsible class="collapsible">
      <button class="btn ghost row-between" data-collapsible-trigger>
        Details <span class="chev">▾</span>
      </button>
      <ui-collapsible-content class="collapsible-content" data-collapsible-content>
        <p class="muted">
          Hidden content that expands and collapses with <code>aria-expanded</code>.
        </p>
      </ui-collapsible-content>
    </ui-collapsible>
  `,
};
