import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Overlays" };
export default meta;
type Story = StoryObj;

export const Tooltip: Story = {
  name: "Tooltip (+ arrow)",
  render: () => html`
    <span class="row gap">
      <ui-tooltip delay="200" group="demo">
        <button class="btn icon" data-tooltip-trigger aria-label="Bold">B</button>
        <ui-tooltip-content class="tooltip" role="tooltip">
          <ui-arrow class="arrow"></ui-arrow>Bold (⌘B)
        </ui-tooltip-content>
      </ui-tooltip>
      <ui-tooltip delay="200" group="demo">
        <button class="btn icon" data-tooltip-trigger aria-label="Italic"><em>I</em></button>
        <ui-tooltip-content class="tooltip" role="tooltip">
          <ui-arrow class="arrow"></ui-arrow>Italic (⌘I)
        </ui-tooltip-content>
      </ui-tooltip>
    </span>
  `,
};
