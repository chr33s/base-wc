import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

const fruits = [
  "Apple",
  "Apricot",
  "Banana",
  "Blackberry",
  "Blueberry",
  "Cherry",
  "Date",
  "Fig",
  "Grape",
  "Kiwi",
  "Lemon",
  "Mango",
  "Melon",
  "Orange",
  "Peach",
  "Pear",
  "Pineapple",
  "Plum",
  "Raspberry",
  "Strawberry",
  "Watermelon",
];

export const Autocomplete: Story = {
  render: () => html`
    <ui-autocomplete name="fruit" class="combobox" .items=${fruits}>
      <input class="input" data-autocomplete-input placeholder="Type a fruit…" />
      <ui-autocomplete-popup class="panel listbox">
        <ui-autocomplete-list class="ac-list"></ui-autocomplete-list>
        <ui-autocomplete-empty class="empty" hidden>No matches.</ui-autocomplete-empty>
      </ui-autocomplete-popup>
    </ui-autocomplete>
  `,
};
