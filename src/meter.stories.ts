import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const Meter: Story = {
  render: () => html`
    <div style="min-width:16rem">
      <ui-meter class="meter" value="82" min="0" max="100" low="30" high="70" optimum="90">
        <span class="bar"></span>
      </ui-meter>
      <ui-meter class="meter" value="18" min="0" max="100" low="30" high="70" optimum="90">
        <span class="bar"></span>
      </ui-meter>
    </div>
  `,
};
