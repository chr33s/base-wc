/**
 * Hover-intent **delay groups** — shared by Tooltip and Preview Card. The first
 * member of a named group to open waits the full open delay; while any member
 * is open (and for a short cooldown after the last one closes) sibling members
 * open instantly. This is what makes sweeping across a row of tooltips feel
 * responsive instead of re-incurring the delay on every one. Components without
 * a `group` never participate and always use their own delay.
 */
interface Group {
  warm: boolean;
  timer: number;
}

const groups = new Map<string, Group>();

function ensure(name: string): Group {
  let group = groups.get(name);
  if (!group) {
    group = { warm: false, timer: 0 };
    groups.set(name, group);
  }
  return group;
}

/** True while `name`'s group is warm (a member is open or just closed). */
export function isGroupWarm(name: string | null): boolean {
  return name != null && (groups.get(name)?.warm ?? false);
}

/** Mark a group warm because one of its members opened. */
export function openGroup(name: string | null): void {
  if (name == null) return;
  const group = ensure(name);
  group.warm = true;
  clearTimeout(group.timer);
}

/** A member closed: keep the group warm for `cooldown` ms, then cool it. */
export function closeGroup(name: string | null, cooldown: number): void {
  if (name == null) return;
  const group = ensure(name);
  clearTimeout(group.timer);
  group.timer = window.setTimeout(() => {
    group.warm = false;
  }, cooldown);
}
