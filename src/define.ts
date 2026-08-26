/**
 * Idempotent custom-element registration. Every component module self-registers
 * on evaluation; guarding on `customElements.get` keeps a second evaluation of
 * the same module (duplicate bundles, dev-server reloads, test isolation) from
 * throwing on re-define. This is the one copy of the guard each module used to
 * hand-write next to its class.
 */

/** Define `name` as `ctor` unless a definition for `name` already exists. */
export function define(name: string, ctor: CustomElementConstructor) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}
