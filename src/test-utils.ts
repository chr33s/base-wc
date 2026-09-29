/** Assert a queried value is present, narrowing away `null`/`undefined`. */
export function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("expected value to be present");
  return value;
}

/** Resolve after pending timers and microtasks, so custom elements finish upgrading. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Dispatch a bubbling, cancelable `keydown` for `key` on `target`. */
export function key(target: EventTarget, k: string): boolean {
  return target.dispatchEvent(
    new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }),
  );
}
