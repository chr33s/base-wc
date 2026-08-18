import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const Form: Story = {
  name: "Form (Field · Fieldset · validation)",
  render: () => html`
    <ui-form class="form" novalidate>
      <div data-form-error-summary class="error-summary" hidden></div>
      <ui-fieldset class="fieldset">
        <legend data-fieldset-legend>Account</legend>
        <ui-field class="field">
          <label data-field-label>Email</label>
          <input
            class="input"
            data-field-control
            name="email"
            type="email"
            required
            placeholder="you@example.com"
          />
          <span class="field-error" data-field-error></span>
        </ui-field>
        <ui-field class="field">
          <label data-field-label>Username</label>
          <input
            class="input"
            data-field-control
            name="username"
            required
            minlength="3"
            placeholder="min 3 chars"
          />
          <span class="field-desc" data-field-description>Letters and numbers.</span>
          <span class="field-error" data-field-error></span>
        </ui-field>
      </ui-fieldset>
      <button class="btn primary" type="submit">Create account</button>
    </ui-form>
  `,
};
