import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";
import type { ComboboxItem } from "./index.ts";

const meta: Meta = { title: "Inputs" };
export default meta;
type Story = StoryObj;

const people: ComboboxItem[] = Array.from({ length: 10_000 }, (_, i) => ({
  value: `u${i}`,
  label: `Person ${i}`,
}));

const tags: ComboboxItem[] = [
  "accessibility",
  "animation",
  "bug",
  "chore",
  "design",
  "docs",
  "enhancement",
  "good first issue",
  "help wanted",
  "performance",
  "question",
  "security",
].map((t) => ({ value: t, label: t }));

export const Combobox: Story = {
  name: "Combobox (virtualized, 10k rows)",
  render: () => html`
    <ui-combobox name="assignee" class="combobox" .items=${people}>
      <input class="input" data-combobox-input placeholder="Search people…" />
      <ui-combobox-popup class="panel listbox virtual">
        <ui-combobox-viewport class="cb-viewport">
          <ui-combobox-spacer class="cb-spacer"></ui-combobox-spacer>
        </ui-combobox-viewport>
        <ui-combobox-empty class="empty" hidden>No matches.</ui-combobox-empty>
      </ui-combobox-popup>
    </ui-combobox>
  `,
};

export const ComboboxMulti: Story = {
  name: "Combobox (multi-select chips)",
  render: () => html`
    <ui-combobox name="tags" multiple class="combobox" .items=${tags}>
      <ui-combobox-chips class="chips"></ui-combobox-chips>
      <div class="row gap">
        <input class="input grow" data-combobox-input placeholder="Add tags…" />
        <button class="btn sm ghost" data-combobox-clear type="button">Clear</button>
      </div>
      <ui-combobox-popup class="panel listbox virtual">
        <ui-combobox-viewport class="cb-viewport">
          <ui-combobox-spacer class="cb-spacer"></ui-combobox-spacer>
        </ui-combobox-viewport>
        <ui-combobox-empty class="empty" hidden>No matches.</ui-combobox-empty>
      </ui-combobox-popup>
    </ui-combobox>
  `,
};
