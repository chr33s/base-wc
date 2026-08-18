import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const Calendar: Story = {
  render: () => html`<ui-calendar value="2026-07-15"></ui-calendar>`,
};
