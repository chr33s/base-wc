import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Components" };
export default meta;
type Story = StoryObj;

export const Avatar: Story = {
  render: () => html`
    <div class="row gap">
      <ui-avatar class="avatar">
        <img data-avatar-image src="https://invalid.example/x.png" alt="" />
        <span data-avatar-fallback>KB</span>
      </ui-avatar>
      <ui-avatar class="avatar"><span data-avatar-fallback>AL</span></ui-avatar>
    </div>
    <p class="muted sm">The left avatar falls back to initials when the image fails.</p>
  `,
};
