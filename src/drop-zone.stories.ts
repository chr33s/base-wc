import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const DropZone: Story = {
  name: "Drop zone",
  render: () => html`
    <ui-drop-zone class="dropzone">
      <input type="file" name="upload" accept="image/*" multiple />
      <div data-drop-target class="dropzone-target">
        <strong>Drop images here</strong>
        <span class="muted sm">or click to browse</span>
      </div>
    </ui-drop-zone>
  `,
};
