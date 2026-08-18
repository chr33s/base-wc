import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

export const Select: Story = {
  name: "Select (grouped)",
  render: () => html`
    <ui-select name="city" class="select">
      <button class="btn select-trigger" data-select-trigger>
        <span data-select-value>Choose a city…</span><span class="chev">▾</span>
      </button>
      <ui-select-popup class="panel listbox">
        <ui-select-group class="optgroup">
          <ui-select-group-label class="menulabel">Europe</ui-select-group-label>
          <ui-select-option class="option" value="lon">London</ui-select-option>
          <ui-select-option class="option" value="par">Paris</ui-select-option>
          <ui-select-option class="option" value="ber">Berlin</ui-select-option>
        </ui-select-group>
        <ui-select-group class="optgroup">
          <ui-select-group-label class="menulabel">Asia</ui-select-group-label>
          <ui-select-option class="option" value="tyo">Tokyo</ui-select-option>
          <ui-select-option class="option" value="sin">Singapore</ui-select-option>
        </ui-select-group>
      </ui-select-popup>
    </ui-select>
  `,
};

export const SelectMultiple: Story = {
  name: "Select (multiple)",
  render: () => html`
    <ui-select name="langs" multiple class="select">
      <button class="btn select-trigger" data-select-trigger>
        <span data-select-value>Pick languages…</span><span class="chev">▾</span>
      </button>
      <ui-select-popup class="panel listbox">
        <ui-select-option class="option" value="ts">TypeScript</ui-select-option>
        <ui-select-option class="option" value="rs">Rust</ui-select-option>
        <ui-select-option class="option" value="go">Go</ui-select-option>
        <ui-select-option class="option" value="py">Python</ui-select-option>
      </ui-select-popup>
    </ui-select>
  `,
};
