import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Menus" };
export default meta;
type Story = StoryObj;

export const NavigationMenu: Story = {
  name: "Navigation menu",
  render: () => html`
    <ui-navigation-menu class="navmenu" delay="120">
      <ui-nav-list class="navlist">
        <ui-nav-item>
          <button class="btn ghost" data-nav-trigger>Products</button>
          <ui-nav-content class="panel navpanel">
            <a class="navcard" href="#">Analytics<span class="muted">Understand traffic</span></a>
            <a class="navcard" href="#">Automations<span class="muted">Workflows</span></a>
          </ui-nav-content>
        </ui-nav-item>
        <ui-nav-item>
          <button class="btn ghost" data-nav-trigger>Company</button>
          <ui-nav-content class="panel navpanel">
            <a class="navcard" href="#">About<span class="muted">Who we are</span></a>
            <a class="navcard" href="#">Careers<span class="muted">Join us</span></a>
          </ui-nav-content>
        </ui-nav-item>
      </ui-nav-list>
    </ui-navigation-menu>
  `,
};
