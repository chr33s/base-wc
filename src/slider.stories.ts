import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const Slider: Story = {
  name: "Slider (single & range)",
  render: () => html`
    <div style="display:grid;gap:1rem;min-width:16rem">
      <ui-slider class="slider">
        <input class="range" type="range" name="volume" value="40" min="0" max="100" step="1" />
      </ui-slider>
      <ui-slider class="slider" value="20,70" min="0" max="100" step="1" min-distance="10">
        <ui-slider-track class="track">
          <span class="fill range"></span>
          <ui-slider-thumb class="thumb"></ui-slider-thumb>
          <ui-slider-thumb class="thumb"></ui-slider-thumb>
        </ui-slider-track>
      </ui-slider>
    </div>
  `,
};
