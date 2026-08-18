import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { toast, type UIToastViewport } from "./index.ts";

const meta: Meta = { title: "Overlays" };
export default meta;
type Story = StoryObj;

export const Toast: Story = {
  render: () => {
    const errorToast = () => {
      const viewport = document.querySelector<UIToastViewport>(".toast-viewport");
      const t = viewport?.add({
        title: "Upload failed",
        description: "The network dropped.",
        type: "error",
        action: "Retry",
        duration: 8000,
      });
      t?.addEventListener("action", () =>
        toast({ title: "Retrying…", type: "info", duration: 2000 }),
      );
    };
    let n = 0;
    const stack = () => {
      const items = [
        {
          title: "Event created",
          description: "“Design review” added to your calendar.",
          type: "success" as const,
        },
        { title: "New comment", description: "Ada replied to your thread.", type: "info" as const },
        { title: "Draft saved", description: "We’ll keep it for 30 days.", type: "info" as const },
        {
          title: "Sync running",
          description: "Fetching the latest orders…",
          type: "info" as const,
        },
      ];
      const item = items[n++ % items.length];
      toast({ ...item, duration: 0 });
    };
    return html`
      <div class="row gap wrap">
        <button class="btn" @click=${stack}>Add to stack</button>
        <button
          class="btn"
          @click=${() =>
            toast({
              title: "Heads up",
              description: "A background sync just finished.",
              type: "info",
            })}
        >
          Info
        </button>
        <button
          class="btn"
          @click=${() => toast({ title: "Saved", description: "Your changes are live.", type: "success" })}
        >
          Success
        </button>
        <button class="btn" @click=${errorToast}>Error + action</button>
      </div>
      <p class="muted sm">
        Click “Add to stack” a few times — toasts pile up newest-in-front; hover the stack to expand
        it, or flick one sideways to dismiss.
      </p>
      <ui-toast-viewport class="toast-viewport" visible="3"></ui-toast-viewport>
    `;
  },
};
