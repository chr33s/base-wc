import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const Chip: Story = {
  name: "Chip (removable)",
  render: () => html`
    <div class="row gap wrap">
      <ui-chip class="chip" removable value="design">Design</ui-chip>
      <ui-chip class="chip" removable value="bug">Bug</ui-chip>
      <ui-chip class="chip" removable value="docs">Docs</ui-chip>
      <ui-chip class="chip">Read-only</ui-chip>
    </div>
  `,
};
