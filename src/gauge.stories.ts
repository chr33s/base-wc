import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

export const Gauge: Story = {
  render: () => html`
    <div class="row gap">
      <ui-gauge
        class="gauge"
        style="width: 160px; height: 160px"
        width="200"
        height="200"
        value="25"
        min="0"
        max="100"
      ></ui-gauge>
      <ui-gauge
        class="gauge"
        style="width: 160px; height: 160px"
        width="200"
        height="200"
        value="65"
        min="0"
        max="100"
      ></ui-gauge>
      <ui-gauge
        class="gauge"
        style="width: 160px; height: 160px"
        width="200"
        height="200"
        value="92"
        min="0"
        max="100"
        thickness="20"
      ></ui-gauge>
    </div>
    <p class="muted sm">Three gauges at 25%, 65%, and 92% (the last with a thicker ring).</p>
  `,
};
