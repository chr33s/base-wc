/**
 * `ui-drop-zone` — a drag-and-drop file target (no Base UI counterpart).
 *
 * **Native-first.** Author a native `<input type="file" name="upload" multiple
 * accept="…">` and it works with no JavaScript — the browser's file chooser
 * submits on its own. On upgrade the component {@link retireNative | retires} the
 * input (hidden, still the submitting value) and turns a `[data-drop-target]`
 * (generated if absent) into a focusable `role="button"` zone: click / Enter /
 * Space open the chooser, and dragging files over it sets `data-dragging`. On
 * drop the files are filtered against `accept`, assigned to the native input via
 * `DataTransfer`, and the native change fires — so a later submit carries them.
 * A bubbling `change` event exposes the accepted `{ files }`.
 */
import { connectLightDom } from "./lifecycle.ts";
import { adoptedControl, fireNativeChange, retireNative } from "./native.ts";

export interface DropZoneChangeDetail {
  /** The accepted files now held by the native input. */
  readonly files: File[];
}

export class UIDropZone extends HTMLElement {
  #wired = false;
  #input!: HTMLInputElement;
  #target!: HTMLElement;
  /** dragenter/dragleave fire per descendant; count to know when we truly left. */
  #dragDepth = 0;

  get files(): File[] {
    return this.#input?.files ? Array.from(this.#input.files) : [];
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    const input = adoptedControl<HTMLInputElement>(this, 'input[type="file"]');
    if (!input) return;
    this.#wired = true;
    this.#input = input;
    this.#target = this.querySelector<HTMLElement>("[data-drop-target]") ?? this.#buildTarget();

    if (!this.#target.hasAttribute("role")) this.#target.setAttribute("role", "button");
    if (!this.#target.hasAttribute("tabindex")) this.#target.tabIndex = input.disabled ? -1 : 0;
    if (!this.#target.hasAttribute("aria-label")) {
      this.#target.setAttribute("aria-label", input.getAttribute("aria-label") ?? "Upload files");
    }

    this.#target.addEventListener("click", this.#browse);
    this.#target.addEventListener("keydown", this.#onKeydown);
    this.addEventListener("dragenter", this.#onDragEnter);
    this.addEventListener("dragover", this.#onDragOver);
    this.addEventListener("dragleave", this.#onDragLeave);
    this.addEventListener("drop", this.#onDrop);
    // Browsing via the (now hidden) input still notifies listeners of the zone.
    input.addEventListener("change", this.#onNativeChange);
    // Keep the input's raw native input event from leaking as the zone's own.
    input.addEventListener("input", (e) => e.stopPropagation());

    retireNative(input);
  }

  #buildTarget() {
    const el = document.createElement("div");
    el.setAttribute("data-drop-target", "");
    el.textContent = "Drop files here or browse";
    this.append(el);
    return el;
  }

  get #disabled(): boolean {
    return this.#input.disabled;
  }

  #browse = () => {
    if (!this.#disabled) this.#input.click();
  };

  #onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.#browse();
    }
  };

  #onDragEnter = (e: DragEvent) => {
    if (this.#disabled) return;
    e.preventDefault();
    if (this.#dragDepth++ === 0) this.setAttribute("data-dragging", "");
  };

  #onDragOver = (e: DragEvent) => {
    if (this.#disabled) return;
    e.preventDefault(); // required for `drop` to fire
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  #onDragLeave = (e: DragEvent) => {
    if (this.#disabled) return;
    e.preventDefault();
    if (--this.#dragDepth <= 0) {
      this.#dragDepth = 0;
      this.removeAttribute("data-dragging");
    }
  };

  #onDrop = (e: DragEvent) => {
    if (this.#disabled) return;
    e.preventDefault();
    this.#dragDepth = 0;
    this.removeAttribute("data-dragging");
    const dropped = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    const accepted = dropped.filter((f) => this.#accepts(f));
    if (!accepted.length) return;
    this.#assign(accepted);
  };

  // Only a real browse (trusted event) re-emits here; a programmatic drop emits
  // its accepted list directly (see `#assign`), so the two never double-fire.
  // Either way, stop the native change from leaking out as the zone's own event.
  #onNativeChange = (e: Event) => {
    e.stopPropagation();
    if (e.isTrusted) this.#emit();
  };

  /** Match a file against the native input's `accept` list (extensions + MIME). */
  #accepts(file: File): boolean {
    const accept = this.#input.accept.trim();
    if (!accept) return true;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return accept.split(",").some((raw) => {
      const token = raw.trim().toLowerCase();
      if (!token) return false;
      if (token.startsWith(".")) return name.endsWith(token);
      if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
      return type === token;
    });
  }

  /** Write files onto the native input (respecting `multiple`) and notify. */
  #assign(files: File[]) {
    const list = this.#input.multiple ? files : files.slice(0, 1);
    // Best-effort: populate the native input so the form submits the dropped
    // files. `DataTransfer` may be unconstructable / `files` unassignable on some
    // engines — the drop is still surfaced via the explicit `#emit` below.
    try {
      const dt = new DataTransfer();
      for (const f of list) dt.items.add(f);
      this.#input.files = dt.files;
      fireNativeChange(this.#input); // untrusted → `#onNativeChange` ignores it
    } catch {
      /* input can't be populated programmatically here */
    }
    this.#emit(list);
  }

  #emit(files = this.files) {
    this.dispatchEvent(
      new CustomEvent<DropZoneChangeDetail>("change", { bubbles: true, detail: { files } }),
    );
  }
}

if (!customElements.get("ui-drop-zone")) customElements.define("ui-drop-zone", UIDropZone);

declare global {
  interface HTMLElementTagNameMap {
    "ui-drop-zone": UIDropZone;
  }
}
