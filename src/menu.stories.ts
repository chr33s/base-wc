import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Menus" };
export default meta;
type Story = StoryObj;

export const Menu: Story = {
  name: "Menu (checkable items, groups, submenu)",
  render: () => {
    const onSelect = (e: Event) => {
      const detail = (e as CustomEvent<{ value: string; item: HTMLElement }>).detail;
      const checked = (detail.item as unknown as { checked?: boolean }).checked;
      const log = (e.currentTarget as Element).parentElement?.querySelector("#menu-log");
      if (log)
        log.textContent =
          checked === undefined
            ? `selected: ${detail.value}`
            : `${detail.value}: ${checked ? "on" : "off"}`;
    };
    return html`
      <div>
        <ui-menu id="rich-menu" @menu-select=${onSelect}>
          <button class="btn" data-menu-trigger>View ▾</button>
          <ui-menu-popup class="panel menu">
            <ui-menu-group class="menugroup">
              <ui-menu-group-label class="menulabel">Appearance</ui-menu-group-label>
              <ui-menu-checkbox-item class="menuitem check" value="grid" checked>
                Show grid
              </ui-menu-checkbox-item>
              <ui-menu-checkbox-item class="menuitem check" value="ruler">
                Show ruler
              </ui-menu-checkbox-item>
            </ui-menu-group>
            <hr class="menusep" />
            <ui-menu-radio-group value="md">
              <ui-menu-group-label class="menulabel">Density</ui-menu-group-label>
              <ui-menu-radio-item class="menuitem radio" value="sm">Compact</ui-menu-radio-item>
              <ui-menu-radio-item class="menuitem radio" value="md">Cozy</ui-menu-radio-item>
              <ui-menu-radio-item class="menuitem radio" value="lg">Comfortable</ui-menu-radio-item>
            </ui-menu-radio-group>
            <hr class="menusep" />
            <ui-menu submenu>
              <ui-menu-item class="menuitem submenu" data-menu-trigger>Export ▸</ui-menu-item>
              <ui-menu-popup class="panel menu">
                <ui-menu-item class="menuitem" value="png">PNG</ui-menu-item>
                <ui-menu-item class="menuitem" value="svg">SVG</ui-menu-item>
                <ui-menu-item class="menuitem" value="pdf">PDF</ui-menu-item>
              </ui-menu-popup>
            </ui-menu>
          </ui-menu-popup>
        </ui-menu>
        <pre class="log" id="menu-log">selection…</pre>
      </div>
    `;
  },
};
