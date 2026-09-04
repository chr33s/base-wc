/**
 * Connect a light-DOM component once its authored parts are available.
 *
 * A custom element can connect before its children have been parsed or before a
 * renderer appends them. Components report readiness through `isWired`; when a
 * first attempt cannot wire, this helper watches the host and retries on the
 * next light-DOM mutation. Successful components keep their existing listeners
 * across ordinary DOM moves, so reconnection does not duplicate handlers.
 */

interface PendingConnection {
  observer: MutationObserver | null;
  queued: boolean;
}

const pending = new WeakMap<HTMLElement, PendingConnection>();

export function connectLightDom(host: HTMLElement, isWired: () => boolean, wire: () => void) {
  if (isWired()) {
    stopWaiting(host);
    return;
  }

  const state = pending.get(host) ?? { observer: null, queued: false };
  pending.set(host, state);
  if (state.queued) return;
  state.queued = true;

  queueMicrotask(() => {
    state.queued = false;
    if (!host.isConnected || isWired()) return;

    wire();
    if (isWired()) {
      stopWaiting(host);
      return;
    }

    if (typeof MutationObserver === "undefined" || state.observer) return;
    state.observer = new MutationObserver(() => connectLightDom(host, isWired, wire));
    state.observer.observe(host, { childList: true, subtree: true });
  });
}

/**
 * The base for a light-DOM component that wires itself from its authored
 * children — nearly every element in the library.
 *
 * Each of them used to carry the same five lines: a `#wired` flag, a
 * `connectedCallback` that forwarded to {@link connectLightDom}, and a private
 * `#wire`. The base owns the flag and the forwarding; a subclass implements
 * {@link wire} and sets `this.wired = true` at the point it knows the parts it
 * needs are present — the same place the private version set its own flag, so
 * a component that cannot wire yet simply leaves it `false` and is retried on
 * the next light-DOM mutation.
 *
 * A component with more to do on connect overrides `connectedCallback`, does
 * its own work, and calls `super.connectedCallback()`. The `wired` setter is
 * protected for the few components that tear their wiring down on disconnect
 * (`ui-chart`, `ui-table`) and need the next connect to run {@link wire} again.
 */
export abstract class LightDomElement extends HTMLElement {
  #wired = false;

  /** Whether {@link wire} has run far enough to consider the component live. */
  protected get wired() {
    return this.#wired;
  }
  protected set wired(next: boolean) {
    this.#wired = next;
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.wire(),
    );
  }

  /**
   * Adopt the authored parts and attach behaviour. Set `this.wired = true` once
   * the required parts are present; returning with it still `false` asks to be
   * retried when the light DOM next changes.
   */
  protected abstract wire(): void;
}

function stopWaiting(host: HTMLElement) {
  const state = pending.get(host);
  state?.observer?.disconnect();
  pending.delete(host);
}

/**
 * Connect a light-DOM component that also needs an **owning container
 * element** — an ancestor custom element it registers itself with, the way
 * every `ui-chart` child registers with `ui-chart`.
 *
 * On top of {@link connectLightDom}'s "wait for the authored children" retry,
 * this waits for the container to have been *upgraded*. Custom elements
 * upgrade in definition order, and a container module necessarily evaluates
 * its children's modules before it defines itself (`chart.ts` imports
 * `chart-axis.ts`), so a child can be upgraded while its container is still an
 * inert unknown element: `closest()` finds it, but none of the registration
 * methods exist yet, and calling one throws out of the child's own lifecycle
 * callback and leaves it permanently unwired. In that window `wire` is simply
 * not called, and the attempt is repeated once the container's own definition
 * lands.
 */
export function connectOwned<K extends keyof HTMLElementTagNameMap>(
  host: HTMLElement,
  ownerTag: K,
  isWired: () => boolean,
  wire: (owner: HTMLElementTagNameMap[K]) => void,
) {
  const connect = () => {
    connectLightDom(host, isWired, () => {
      const owner = host.closest(ownerTag);
      if (!owner) return;
      const ctor = customElements.get(ownerTag);
      if (ctor && owner instanceof ctor) {
        wire(owner);
        return;
      }
      // Retried only while the definition is genuinely still missing —
      // `whenDefined` resolves once and for all, so re-arming it against an
      // already-defined container would spin.
      if (!ctor) {
        void customElements.whenDefined(ownerTag).then(() => {
          if (host.isConnected) connect();
        });
      }
    });
  };
  connect();
}
