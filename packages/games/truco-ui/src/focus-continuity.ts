/**
 * Keyboard-focus continuity across full-DOM re-renders (WCAG 2.1.1/2.4.3).
 * Every surface here re-renders by wiping and rebuilding its container, which
 * drops keyboard focus on `<body>` — a keyboard user loses their place every
 * few seconds through no action of their own. These helpers bracket the wipe:
 * capture WHO was focused by stable SEMANTIC identity (the `data-*`/`role`
 * vocabulary the DOM already carries, scoped by every identity-bearing
 * ancestor — never a node reference, which is about to die, and never an
 * index, which would silently restore onto a DIFFERENT control and arm an
 * action the player never chose), then hand focus to the equivalent new node.
 *
 * When the exact control is gone (its action stopped being legal), a ladder,
 * most-honest first, each candidate VERIFIED (focus must actually take — a
 * disabled button or plain div refuses it) before falling to the next rung:
 *   1. exact  — same identity, all attributes, same ancestor context.
 *   2. group  — nearest surviving sibling of the same group (below).
 *   3. region — any `[data-action]` control under the same ancestors: the
 *      convention `senas.ts`'s Escape handler set (return focus to a control
 *      owning the region, never drop it).
 *   4. the container itself, `tabindex="-1"` — focusable without becoming a
 *      tab stop: the honest "your control is gone, you are still inside the
 *      widget" landing, from which Tab reaches the first live control.
 *
 * `captureFocus` returns null when focus was not inside the container: a
 * re-render must never STEAL focus the widget did not hold — and since
 * capture/restore run synchronously around one render, containment at
 * capture time is the whole guard.
 *
 * Named debt: duplicated by hand in `apps/widget-app/src/focus-continuity.ts`
 * — neither UI package may import the other, and a shared DOM-utils package
 * for two small files was judged heavier than the duplication it removes.
 */

/** The data-* keys that NAME a control, primary-first. State-only attributes
 * (`data-prominent`, `data-playable`, ...) are deliberately absent: state
 * changes between renders on the SAME control, and identity must not. */
const IDENTITY_KEYS = ["action", "card", "signal", "tier", "response", "level", "game", "modality", "position", "relation"] as const;

export interface FocusSnapshot {
  readonly exact: string | null;
  readonly group: string | null;
  readonly region: string;
}

/** Attribute values land inside a double-quoted CSS attribute selector, so
 * only the quote and the backslash need escaping. */
function escapeAttrValue(value: string): string {
  return value.replace(/[\\"]/g, "\\$&");
}

function identitySelector(el: HTMLElement): string | null {
  const attrs: string[] = [];
  const role = el.getAttribute("role");
  if (role !== null) attrs.push(`[role="${escapeAttrValue(role)}"]`);
  for (const key of IDENTITY_KEYS) {
    const value = el.dataset[key];
    if (value !== undefined) attrs.push(`[data-${key}="${escapeAttrValue(value)}"]`);
  }
  return attrs.length === 0 ? null : attrs.join("");
}

/** The leaf's GROUP identity — rung 2 of the ladder. `data-action` keeps its
 * value (quiero and no-quiero are one group; vs-bot tiers are one group); a
 * card relaxes to presence (the surviving hand is the group); a role keeps
 * its value (another log is still a log). */
function groupSelector(el: HTMLElement): string | null {
  if (el.dataset.action !== undefined) return `[data-action="${escapeAttrValue(el.dataset.action)}"]`;
  if (el.dataset.card !== undefined) return "[data-card]";
  const role = el.getAttribute("role");
  if (role !== null) return `[role="${escapeAttrValue(role)}"]`;
  return null;
}

export function captureFocus(container: HTMLElement): FocusSnapshot | null {
  const active = container.ownerDocument.activeElement;
  // `active === container` needs no snapshot: the wipe removes CHILDREN, so
  // focus held by the container itself survives it untouched.
  if (!(active instanceof HTMLElement) || active === container || !container.contains(active)) return null;

  const ancestors: string[] = [];
  for (let node = active.parentElement; node !== null && node !== container; node = node.parentElement) {
    const part = identitySelector(node);
    if (part !== null) ancestors.unshift(part);
  }
  const scope = (leaf: string | null): string | null => (leaf === null ? null : [...ancestors, leaf].join(" "));

  return {
    exact: scope(identitySelector(active)),
    group: scope(groupSelector(active)),
    region: scope("[data-action]")!,
  };
}

export function restoreFocus(container: HTMLElement, snapshot: FocusSnapshot | null): void {
  if (snapshot === null) return;
  const doc = container.ownerDocument;
  const tried = new Set<string>();
  for (const selector of [snapshot.exact, snapshot.group, snapshot.region]) {
    if (selector === null || tried.has(selector)) continue;
    tried.add(selector);
    for (const candidate of container.querySelectorAll<HTMLElement>(selector)) {
      candidate.focus();
      // Verified, not assumed: focus() silently refuses a disabled button, a
      // plain div, a display:none node — refusal means "next candidate",
      // never "close enough".
      if (doc.activeElement === candidate) return;
    }
  }
  container.tabIndex = -1;
  container.focus();
}
