// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { UIToast, UIToastViewport } from "./toast.ts";
import { toast, updateToast } from "./toast.ts";
import "./elements.ts";
import { must } from "./test-utils.ts";

/** Narrow a lookup the fixture guarantees is present. */
async function mount() {
  document.body.innerHTML = `<ui-toast-viewport></ui-toast-viewport>`;
  await Promise.resolve();
  const viewport = must(document.querySelector<UIToastViewport>("ui-toast-viewport"));
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
    const title = must(t.querySelector("[data-toast-title]"));
    const desc = must(t.querySelector("[data-toast-description]"));
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

  it("pauses the timer on hover and resumes with only the time it had left", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Hover me", duration: 3000 });
    vi.advanceTimersByTime(2000);
    t.dispatchEvent(new Event("pointerenter")); // pause with 1000ms owed
    vi.advanceTimersByTime(10_000);
    expect(t.isConnected).toBe(true); // still here — timer paused
    t.dispatchEvent(new Event("pointerleave")); // resume
    vi.advanceTimersByTime(999);
    expect(t.isConnected).toBe(true);
    vi.advanceTimersByTime(1); // exactly the 1000ms that remained, not a fresh 3000
    expect(t.isConnected).toBe(false);
  });

  it("accumulates across repeated pauses, so hovering never extends the lifetime", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Hover me twice", duration: 3000 });
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(900); // 2700ms served in total
      t.dispatchEvent(new Event("pointerenter"));
      vi.advanceTimersByTime(5000); // parked — time here is not served
      t.dispatchEvent(new Event("pointerleave"));
    }
    expect(t.isConnected).toBe(true);
    vi.advanceTimersByTime(299);
    expect(t.isConnected).toBe(true);
    vi.advanceTimersByTime(1); // the last 300ms of the original 3000
    expect(t.isConnected).toBe(false);
  });

  it("dismisses on a [data-toast-close] click and fires dismiss", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Close me", duration: 0 });
    const onDismiss = vi.fn<() => void>();
    t.addEventListener("dismiss", onDismiss);
    must(t.querySelector<HTMLButtonElement>("[data-toast-close]")).click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(t.isConnected).toBe(false);
  });

  it("fires an action event and closes on the action button", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Undo?", action: "Undo", duration: 0 });
    const onAction = vi.fn<() => void>();
    t.addEventListener("action", onAction);
    const btn = must(t.querySelector<HTMLButtonElement>("[data-toast-action]"));
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
    expect(must(t.querySelector("[data-toast-title]")).textContent).toBe("Hi");
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

    it("spaces the expanded stack by the default gap when none is authored", async () => {
      const { viewport } = await mount();
      viewport.add({ title: "A", duration: 0 });
      viewport.add({ title: "B", duration: 0 });
      const c = viewport.add({ title: "C", duration: 0 });
      // Offsets accumulate each toast's height plus the gap; under happy-dom
      // every height is 0, so the resting positions are pure multiples of it.
      // An absent `gap` attribute must not read as `gap="0"`.
      const offsets = [...viewport.querySelectorAll<HTMLElement>("ui-toast")]
        .reverse()
        .map((t) => t.style.getPropertyValue("--offset"));
      expect(offsets).toEqual(["0px", "14px", "28px"]);
      expect(c.style.getPropertyValue("--offset")).toBe("0px"); // front
    });

    it("hides toasts past the visible limit while collapsed", async () => {
      document.body.innerHTML = `<ui-toast-viewport visible="2"></ui-toast-viewport>`;
      await Promise.resolve();
      const viewport = must(document.querySelector<UIToastViewport>("ui-toast-viewport"));
      viewport.add({ title: "A", duration: 0 }); // index 2 → hidden
      viewport.add({ title: "B", duration: 0 }); // index 1
      const c = viewport.add({ title: "C", duration: 0 }); // index 0 (front)
      const a = must(viewport.querySelector<UIToast>("ui-toast")); // first child = oldest
      expect(a.hasAttribute("data-hidden")).toBe(true);
      expect(c.hasAttribute("data-hidden")).toBe(false);
    });

    it("expands on pointer enter (revealing hidden toasts) and collapses on leave", async () => {
      document.body.innerHTML = `<ui-toast-viewport visible="1"></ui-toast-viewport>`;
      await Promise.resolve();
      const viewport = must(document.querySelector<UIToastViewport>("ui-toast-viewport"));
      viewport.add({ title: "A", duration: 0 });
      const b = viewport.add({ title: "B", duration: 0 });
      expect(must(viewport.querySelector<UIToast>("ui-toast")).hasAttribute("data-hidden")).toBe(
        true,
      );

      viewport.dispatchEvent(new Event("pointerenter"));
      expect(viewport.hasAttribute("data-expanded")).toBe(true);
      // Nothing is hidden once expanded.
      expect(must(viewport.querySelector<UIToast>("ui-toast")).hasAttribute("data-hidden")).toBe(
        false,
      );
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
      const b = must(viewport.querySelectorAll<UIToast>("ui-toast")[1]);
      expect(b.style.getPropertyValue("--index")).toBe("0"); // B is the new front
      expect(a.style.getPropertyValue("--index")).toBe("1");
    });
  });

  describe("swipe-to-dismiss", () => {
    const pointer = (type: string, clientX: number) =>
      new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX });

    it("dismisses on a flick past the threshold", async () => {
      const { viewport } = await mount();
      const t = viewport.add({ title: "A", duration: 0 });
      t.dispatchEvent(pointer("pointerdown", 0));
      t.dispatchEvent(pointer("pointermove", 160));
      t.dispatchEvent(pointer("pointerup", 160));
      expect(t.hasAttribute("data-open")).toBe(false);
    });

    it("snaps back and resumes the timer on a short swipe", async () => {
      const { viewport } = await mount();
      const t = viewport.add({ title: "A", duration: 1000 });
      t.dispatchEvent(pointer("pointerdown", 0));
      t.dispatchEvent(pointer("pointermove", 20));
      t.dispatchEvent(pointer("pointerup", 20));
      expect(t.hasAttribute("data-swiping")).toBe(false);
      expect(t.style.getPropertyValue("--swipe-x")).toBe("");
      vi.advanceTimersByTime(1000); // the auto-dismiss timer runs again
      expect(t.hasAttribute("data-open")).toBe(false);
    });

    // `ui-toast` is styled `touch-action: pan-y`, so a vertical scroll started
    // on a toast hands the gesture to the browser: `pointercancel` arrives and
    // `pointerup` never does. The swipe must still end, or the toast is
    // stranded mid-swipe with its auto-dismiss timer paused forever.
    // The toast sits in a scrollable stack, so a diagonal thumb-scroll must not
    // translate it sideways by its incidental horizontal component the whole
    // way down. The vertical axis wins the stroke, and it never becomes a swipe.
    it("yields a dominantly vertical stroke to the scroller", async () => {
      const { viewport } = await mount();
      const t = viewport.add({ title: "A", duration: 1000 });
      t.dispatchEvent(pointer("pointerdown", 0));
      t.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: 4,
          clientY: 40,
        }),
      );
      expect(t.hasAttribute("data-swiping")).toBe(false);
      // Having lost the stroke it stays out of it, however far the thumb drifts.
      t.dispatchEvent(pointer("pointermove", 200));
      expect(t.style.getPropertyValue("--swipe-x")).toBe("");

      // The press paused the auto-dismiss timer; the release must hand it back.
      t.dispatchEvent(pointer("pointerup", 200));
      expect(t.hasAttribute("data-open")).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(t.hasAttribute("data-open")).toBe(false);
    });

    it("ignores a press that never clears the slop, so a tap is not a swipe", async () => {
      const { viewport } = await mount();
      const t = viewport.add({ title: "A", duration: 1000 });
      t.dispatchEvent(pointer("pointerdown", 0));
      t.dispatchEvent(pointer("pointermove", 4)); // under the 8px slop
      expect(t.hasAttribute("data-swiping")).toBe(false);
      expect(t.style.getPropertyValue("--swipe-x")).toBe("");
      t.dispatchEvent(pointer("pointerup", 4));
      expect(t.hasAttribute("data-open")).toBe(true);
    });

    it("ends the swipe when the browser cancels the pointer", async () => {
      const { viewport } = await mount();
      const t = viewport.add({ title: "A", duration: 1000 });
      t.dispatchEvent(pointer("pointerdown", 0));
      t.dispatchEvent(pointer("pointermove", 40));
      expect(t.hasAttribute("data-swiping")).toBe(true);

      t.dispatchEvent(pointer("pointercancel", 40));
      expect(t.hasAttribute("data-swiping")).toBe(false);
      expect(t.style.getPropertyValue("--swipe-x")).toBe("");
      vi.advanceTimersByTime(1000);
      expect(t.hasAttribute("data-open")).toBe(false);
    });
  });
});

describe("ui-toast-viewport update", () => {
  it("amends a live toast in place", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Uploading", description: "0%", duration: 5000 });

    const same = viewport.update(t.id, { description: "100%" });
    expect(same).toBe(t); // the same element, not a replacement
    expect(must(t.querySelector("[data-toast-title]")).textContent).toBe("Uploading");
    expect(must(t.querySelector("[data-toast-description]")).textContent).toBe("100%");
  });

  it("derives the patch from what the toast currently shows", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Saving" });

    viewport.update(t.id, (current) => ({ title: `${current.title!} — done` }));
    expect(must(t.querySelector("[data-toast-title]")).textContent).toBe("Saving — done");
  });

  it("adds a missing part ahead of the close button, and removes one", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Saved" });
    expect(t.querySelector("[data-toast-description]")).toBe(null);

    viewport.update(t.id, { description: "3 files" });
    const parts = [...t.children].map((c) => c.getAttribute("data-toast-description") ?? c.tagName);
    // The close button stays last.
    expect(must(t.lastElementChild).hasAttribute("data-toast-close")).toBe(true);
    expect(parts).toContain("");

    viewport.update(t.id, { description: undefined });
    expect(t.querySelector("[data-toast-description]")).toBe(null);
  });

  it("re-announces assertively when the type is promoted", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Working" });
    expect(t.getAttribute("role")).toBe("status");
    expect(t.getAttribute("aria-live")).toBe("polite");

    viewport.update(t.id, { type: "error", title: "Failed" });
    expect(t.getAttribute("role")).toBe("alert");
    expect(t.getAttribute("aria-live")).toBe("assertive");
  });

  it("restarts the dismiss countdown so the new text can be read", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "Working", duration: 1000 });
    vi.advanceTimersByTime(900); // nearly expired

    viewport.update(t.id, { title: "Still working" });
    vi.advanceTimersByTime(900);
    expect(t.hasAttribute("data-open")).toBe(true); // the old timer did not fire
    vi.advanceTimersByTime(200);
    expect(t.hasAttribute("data-open")).toBe(false);
  });

  it("returns null for an id no live toast holds", async () => {
    const { viewport } = await mount();
    expect(viewport.update("nope", { title: "x" })).toBe(null);
  });

  it("updates through the document-level helper", async () => {
    const { viewport } = await mount();
    const t = viewport.add({ title: "One", id: "fixed" });
    updateToast("fixed", { title: "Two" });
    expect(must(t.querySelector("[data-toast-title]")).textContent).toBe("Two");
  });
});
