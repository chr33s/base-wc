import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Disclosure" };
export default meta;
type Story = StoryObj;

export const Tabs: Story = {
  render: () => html`
    <ui-tabs class="tabs" value="overview">
      <ui-tab-list class="tablist">
        <button class="tab" data-tab value="overview">Overview</button>
        <button class="tab" data-tab value="specs">Specs</button>
        <button class="tab" data-tab value="reviews">Reviews</button>
      </ui-tab-list>
      <div class="tabpanel" data-tab-panel value="overview">A quick summary of the product.</div>
      <div class="tabpanel" data-tab-panel value="specs">Dimensions, weight and materials.</div>
      <div class="tabpanel" data-tab-panel value="reviews">What customers say.</div>
    </ui-tabs>
  `,
};
