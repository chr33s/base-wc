import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const Banner: Story = {
  name: "Banner (persistent)",
  render: () => html`
    <div class="stack" style="min-width:20rem">
      <ui-banner class="banner" data-type="info">
        <strong data-banner-title>Heads up</strong>
        <span data-banner-description>A background sync just finished.</span>
      </ui-banner>
      <ui-banner class="banner" data-type="error" dismissible>
        <strong data-banner-title>Upload failed</strong>
        <span data-banner-description>The network dropped. Try again.</span>
      </ui-banner>
    </div>
  `,
};
