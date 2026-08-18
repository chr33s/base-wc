import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const ScrollArea: Story = {
  name: "Scroll area",
  render: () => html`
    <ui-scroll-area class="scrollarea">
      <ui-scroll-viewport class="sv">
        <div class="tall">
          <p>Overlay scrollbars with a proportional, draggable thumb.</p>
          <p>Row 2</p>
          <p>Row 3</p>
          <p>Row 4</p>
          <p>Row 5</p>
          <p>Row 6</p>
          <p>Row 7</p>
          <p>Row 8</p>
          <p>Row 9</p>
          <p>Row 10</p>
          <p>Row 11</p>
          <p>Row 12</p>
        </div>
      </ui-scroll-viewport>
      <ui-scroll-scrollbar class="sb" data-orientation="vertical">
        <ui-scroll-thumb class="sth"></ui-scroll-thumb>
      </ui-scroll-scrollbar>
    </ui-scroll-area>
  `,
};
