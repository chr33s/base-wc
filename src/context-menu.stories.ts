import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Overlays" };
export default meta;
type Story = StoryObj;

export const ContextMenu: Story = {
  name: "Context menu",
  render: () => html`
    <ui-context-menu>
      <div class="dropzone" data-context-target>Right-click here</div>
      <ui-menu>
        <ui-menu-popup class="panel menu">
          <ui-menu-item class="menuitem" value="cut">Cut</ui-menu-item>
          <ui-menu-item class="menuitem" value="copy">Copy</ui-menu-item>
          <ui-menu-item class="menuitem" value="paste">Paste</ui-menu-item>
        </ui-menu-popup>
      </ui-menu>
    </ui-context-menu>
  `,
};
