import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Overlays" };
export default meta;
type Story = StoryObj;

export const PreviewCard: Story = {
  name: "Preview card",
  // NB: the card must NOT sit inside a <p>. Its content holds block elements
  // (<div>), which make the HTML parser auto-close the <p> and reparent the
  // card's content out of <ui-preview-card-content> — leaving the popover empty.
  render: () => html`
    <div>
      Follow
      <ui-preview-card delay="200">
        <a href="#" data-preview-trigger class="link">@ada</a>
        <ui-preview-card-content class="panel previewcard">
          <div class="row gap">
            <ui-avatar class="avatar sm"><span data-avatar-fallback>A</span></ui-avatar>
            <div>
              <strong>Ada Lovelace</strong>
              <div class="muted">Mathematician · 1815</div>
            </div>
          </div>
          <div class="muted">First to recognise the full potential of a computing machine.</div>
        </ui-preview-card-content>
      </ui-preview-card>
      for updates.
    </div>
  `,
};
