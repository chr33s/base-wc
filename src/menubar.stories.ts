import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Menus" };
export default meta;
type Story = StoryObj;

export const Menubar: Story = {
  render: () => html`
    <ui-menubar class="menubar">
      <ui-menu>
        <button class="btn ghost" data-menu-trigger>File</button>
        <ui-menu-popup class="panel menu">
          <ui-menu-item class="menuitem" value="new">New</ui-menu-item>
          <ui-menu-item class="menuitem" value="open">Open…</ui-menu-item>
          <ui-menu-item class="menuitem" value="save">Save</ui-menu-item>
        </ui-menu-popup>
      </ui-menu>
      <ui-menu>
        <button class="btn ghost" data-menu-trigger>Edit</button>
        <ui-menu-popup class="panel menu">
          <ui-menu-item class="menuitem" value="undo">Undo</ui-menu-item>
          <ui-menu-item class="menuitem" value="redo">Redo</ui-menu-item>
        </ui-menu-popup>
      </ui-menu>
      <ui-menu>
        <button class="btn ghost" data-menu-trigger>Help</button>
        <ui-menu-popup class="panel menu">
          <ui-menu-item class="menuitem" value="docs">Documentation</ui-menu-item>
          <ui-menu-item class="menuitem" value="about">About</ui-menu-item>
        </ui-menu-popup>
      </ui-menu>
    </ui-menubar>
  `,
};
