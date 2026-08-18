import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Overlays" };
export default meta;
type Story = StoryObj;

export const Dialog: Story = {
  render: () => html`
    <ui-dialog>
      <button class="btn" data-dialog-trigger>Open dialog</button>
      <ui-dialog-backdrop class="backdrop"></ui-dialog-backdrop>
      <ui-dialog-popup class="panel dialog">
        <h4 data-dialog-title>Save project?</h4>
        <p data-dialog-description class="muted">This will save the project and its data.</p>
        <div class="row end gap">
          <button class="btn" data-close>Cancel</button>
          <button class="btn ok" data-close>Save</button>
        </div>
      </ui-dialog-popup>
    </ui-dialog>
  `,
};

export const AlertDialog: Story = {
  name: "Alert dialog",
  render: () => html`
    <ui-dialog alert>
      <button class="btn" data-dialog-trigger>Discard changes</button>
      <ui-dialog-backdrop class="backdrop"></ui-dialog-backdrop>
      <ui-dialog-popup class="panel dialog">
        <h4 data-dialog-title>Discard unsaved changes?</h4>
        <p data-dialog-description class="muted">You can't undo this.</p>
        <div class="row end gap">
          <button class="btn" data-close>Keep editing</button>
          <button class="btn danger" data-close>Discard</button>
        </div>
      </ui-dialog-popup>
    </ui-dialog>
  `,
};
