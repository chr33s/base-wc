/**
 * The shared vocabulary for **why** a component's state changed (Base UI's
 * `REASONS`). Every `open` / `close` / `change` CustomEvent this library
 * dispatches carries one in its `detail.reason`, so a listener can tell a
 * user's Escape press from a programmatic close, or a typed edit from a
 * committed selection, without inspecting the DOM or racing the event.
 *
 * The vocabulary is deliberately shared rather than per-component: the same
 * question ("was this the user or my own code?") is asked of every overlay, and
 * a listener that learns one component's answers can read them all.
 *
 * `"none"` is the default — a programmatic `show()` / `hide()` / property
 * assignment with nothing more specific to say.
 */

/**
 * Why an overlay opened or closed, or a value changed. Every member is a reason
 * some component in this library actually emits — the union is meant to be
 * exhaustively switchable, so a reason nothing can produce would only send a
 * consumer writing dead branches.
 */
export type ChangeReason =
  | "none"
  // Opening
  | "trigger-press"
  | "trigger-hover"
  | "input-press"
  | "list-navigation"
  // Committing a value
  | "item-press"
  | "clear-press"
  | "chip-remove-press"
  | "input-change"
  | "input-clear"
  // Closing
  | "close-press"
  | "outside-press"
  | "escape-key"
  | "focus-out"
  | "swipe"
  // A press-drag that ended nowhere, taking back the open it started.
  | "cancel-open"
  // Another menu in the same bar took over.
  | "sibling-open";

/** Detail shared by every `open` / `close` event in the library. */
export interface OpenChangeDetail {
  readonly reason: ChangeReason;
}
