import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const OtpField: Story = {
  name: "OTP field",
  render: () => html`<ui-otp-field class="otp" name="code" length="6"></ui-otp-field>`,
};
