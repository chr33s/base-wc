import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Disclosure" };
export default meta;
type Story = StoryObj;

export const Accordion: Story = {
  render: () => html`
    <ui-accordion class="accordion">
      <ui-accordion-item value="a">
        <button class="accordion-trigger" data-accordion-trigger>
          Shipping <span class="chev">▾</span>
        </button>
        <ui-accordion-content class="accordion-content" data-accordion-content>
          Free over $50.
        </ui-accordion-content>
      </ui-accordion-item>
      <ui-accordion-item value="b">
        <button class="accordion-trigger" data-accordion-trigger>
          Returns <span class="chev">▾</span>
        </button>
        <ui-accordion-content class="accordion-content" data-accordion-content>
          30-day window.
        </ui-accordion-content>
      </ui-accordion-item>
    </ui-accordion>
  `,
};
