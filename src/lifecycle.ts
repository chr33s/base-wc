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

export function connectLightDom(host: HTMLElement, isWired: () => boolean, wire: () => void): void {
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

function stopWaiting(host: HTMLElement): void {
  const state = pending.get(host);
  state?.observer?.disconnect();
  pending.delete(host);
}
