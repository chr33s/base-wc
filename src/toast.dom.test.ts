// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { UIToast, UIToastViewport } from "./toast.ts";
import { toast } from "./toast.ts";
import "./elements.ts";

async function mount() {
  document.body.innerHTML = `<ui-toast-viewport></ui-toast-viewport>`;
  await Promise.resolve();
  const viewport = document.querySelector<UIToastViewport>("ui-toast-viewport")!;
  return { viewport };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("ui-toast-viewport", () => {
  it("is a labelled live region", async () => {
    const { viewport } = await mount();
    expect(viewport.getAttribute("role")).toBe("region");
    expect(viewport.getAttribute("aria-label")).toBe("Notifications");
  });

  it("adds a toast with title/description ARIA and a polite live role", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Saved", description: "Your changes are live." });
    expect(t.getAttribute("role")).toBe("status");
    expect(t.getAttribute("aria-live")).toBe("polite");
    const title = t.querySelector("[data-toast-title]")!;
    const desc = t.querySelector("[data-toast-description]")!;
    expect(t.getAttribute("aria-labelledby")).toBe(title.id);
    expect(t.getAttribute("aria-describedby")).toBe(desc.id);
    expect(title.textContent).toBe("Saved");
    expect(desc.textContent).toBe("Your changes are live.");
  });

  it("announces error/warning toasts assertively (role=alert)", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Failed", type: "error" });
    expect(t.getAttribute("role")).toBe("alert");
    expect(t.getAttribute("aria-live")).toBe("assertive");
    expect(t.dataset.type).toBe("error");
  });

  it("auto-dismisses after the duration", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Bye", duration: 3000 });
    expect(t.isConnected).toBe(true);
    vi.advanceTimersByTime(2999);
    expect(t.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(t.isConnected).toBe(false); // removed after exit
  });

  it("stays forever when duration is 0", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Sticky", duration: 0 });
    vi.advanceTimersByTime(60_000);
    expect(t.isConnected).toBe(true);
  });

  it("pauses the timer on hover and resumes on leave", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Hover me", duration: 3000 });
    vi.advanceTimersByTime(2000);
    t.dispatchEvent(new Event("pointerenter")); // pause
    vi.advanceTimersByTime(10_000);
    expect(t.isConnected).toBe(true); // still here — timer paused
    t.dispatchEvent(new Event("pointerleave")); // resume (full duration)
    vi.advanceTimersByTime(3000);
    expect(t.isConnected).toBe(false);
  });

  it("dismisses on a [data-toast-close] click and fires dismiss", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Close me", duration: 0 });
    const onDismiss = vi.fn<() => void>();
    t.addEventListener("dismiss", onDismiss);
    t.querySelector<HTMLButtonElement>("[data-toast-close]")!.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(t.isConnected).toBe(false);
  });

  it("fires an action event and closes on the action button", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Undo?", action: "Undo", duration: 0 });
    const onAction = vi.fn<() => void>();
    t.addEventListener("action", onAction);
    const btn = t.querySelector<HTMLButtonElement>("[data-toast-action]")!;
    expect(btn.textContent).toBe("Undo");
    btn.click();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(t.isConnected).toBe(false);
  });

  it("dismiss(id) and clear() remove toasts", async () => {
    const { viewport } = await mount();
    const a = viewport.add({ title: "A", id: "a", duration: 0 });
    const b = viewport.add({ title: "B", id: "b", duration: 0 });
    viewport.dismiss("a");
    expect(a.isConnected).toBe(false);
    expect(b.isConnected).toBe(true);
    viewport.clear();
    expect(b.isConnected).toBe(false);
  });

  it("the module-level toast() helper targets the first viewport", async () => {
    await mount();
    const t = toast({ title: "Hi" }) as UIToast;
    expect(t).not.toBeNull();
    expect(t.isConnected).toBe(true);
    expect(t.querySelector("[data-toast-title]")!.textContent).toBe("Hi");
  });

  describe("stacking", () => {
    it("stacks newest-in-front, indexing each toast from the front", async () => {
      const { viewport } = await mount();
      const a = viewport.add({ title: "A", duration: 0 });
      const b = viewport.add({ title: "B", duration: 0 });
      const c = viewport.add({ title: "C", duration: 0 });
      // Newest (c) is the front of the stack.
      expect(c.style.getPropertyValue("--index")).toBe("0");
      expect(c.hasAttribute("data-front")).toBe(true);
      expect(b.style.getPropertyValue("--index")).toBe("1");
      expect(a.style.getPropertyValue("--index")).toBe("2");
      expect(a.hasAttribute("data-front")).toBe(false);
      // Front is highest in the paint order.
      expect(Number(c.style.getPropertyValue("--z"))).toBeGreaterThan(
        Number(a.style.getPropertyValue("--z")),
      );
    });

    it("hides toasts past the visible limit while collapsed", async () => {
      document.body.innerHTML = `<ui-toast-viewport visible="2"></ui-toast-viewport>`;
      await Promise.resolve();
      const viewport = document.querySelector<UIToastViewport>("ui-toast-viewport")!;
      viewport.add({ title: "A", duration: 0 }); // index 2 → hidden
      viewport.add({ title: "B", duration: 0 }); // index 1
      const c = viewport.add({ title: "C", duration: 0 }); // index 0 (front)
      const a = viewport.querySelector<UIToast>("ui-toast")!; // first child = oldest
      expect(a.hasAttribute("data-hidden")).toBe(true);
      expect(c.hasAttribute("data-hidden")).toBe(false);
    });

    it("expands on pointer enter (revealing hidden toasts) and collapses on leave", async () => {
      document.body.innerHTML = `<ui-toast-viewport visible="1"></ui-toast-viewport>`;
      await Promise.resolve();
      const viewport = document.querySelector<UIToastViewport>("ui-toast-viewport")!;
      viewport.add({ title: "A", duration: 0 });
      const b = viewport.add({ title: "B", duration: 0 });
      expect(viewport.querySelector<UIToast>("ui-toast")!.hasAttribute("data-hidden")).toBe(true);

      viewport.dispatchEvent(new Event("pointerenter"));
      expect(viewport.hasAttribute("data-expanded")).toBe(true);
      // Nothing is hidden once expanded.
      expect(viewport.querySelector<UIToast>("ui-toast")!.hasAttribute("data-hidden")).toBe(false);
      expect(b.hasAttribute("data-hidden")).toBe(false);

      viewport.dispatchEvent(new Event("pointerleave"));
      expect(viewport.hasAttribute("data-expanded")).toBe(false);
    });

    it("pauses every toast's timer while the stack is expanded", async () => {
      const { viewport } = await mount();
      const a = viewport.add({ title: "A", duration: 3000 });
      const b = viewport.add({ title: "B", duration: 3000 });
      viewport.dispatchEvent(new Event("pointerenter")); // expand → pause all
      vi.advanceTimersByTime(10_000);
      expect(a.isConnected).toBe(true);
      expect(b.isConnected).toBe(true);
      viewport.dispatchEvent(new Event("pointerleave")); // resume all
      vi.advanceTimersByTime(3000);
      expect(a.isConnected).toBe(false);
      expect(b.isConnected).toBe(false);
    });

    it("keeps a toast paused when its own leave fires inside an expanded stack", async () => {
      const { viewport } = await mount();
      const a = viewport.add({ title: "A", duration: 3000 });
      const b = viewport.add({ title: "B", duration: 3000 });
      viewport.dispatchEvent(new Event("pointerenter"));

      a.dispatchEvent(new Event("pointerleave"));
      b.dispatchEvent(new FocusEvent("focusout", { relatedTarget: a }));
      vi.advanceTimersByTime(10_000);

      expect(a.isConnected).toBe(true);
      expect(b.isConnected).toBe(true);
    });

    it("reindexes the stack after a toast is dismissed", async () => {
      const { viewport } = await mount();
      const a = viewport.add({ title: "A", duration: 0 });
      viewport.add({ title: "B", duration: 0 });
      const c = viewport.add({ title: "C", duration: 0 });
      expect(c.style.getPropertyValue("--index")).toBe("0");
      viewport.dismiss(c.id); // drop the front
      await Promise.resolve(); // MutationObserver relayout
      const b = viewport.querySelectorAll<UIToast>("ui-toast")[1];
      expect(b.style.getPropertyValue("--index")).toBe("0"); // B is the new front
      expect(a.style.getPropertyValue("--index")).toBe("1");
    });
  });
});
