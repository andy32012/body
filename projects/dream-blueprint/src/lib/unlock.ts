/** Levels, stages and lessons open one after another: the first is always open, and each later one opens only once
 *  every one before it is complete. Locking never deletes anything — records of a locked step stay where they are. */
export function openSteps(complete: readonly boolean[]): boolean[] {
  const open: boolean[] = []
  let ok = true
  for (const c of complete) { open.push(ok); ok = ok && c }
  return open
}
/** How much of a level completes it — the rule reading has always used to move up: 80% of a level with more than five
 *  items, three (or all, if fewer) of a smaller one. */
export const levelTarget = (count: number) => count <= 5 ? Math.min(3, count) : Math.ceil(count * 0.8)
export const levelDone = (done: number, total: number) => done >= levelTarget(total)
/** The nearest open step at or below the one asked for: a choice saved earlier can point at a step that is locked now. */
export function openAt(open: readonly boolean[], wanted: number) {
  for (let i = Math.min(wanted, open.length - 1); i >= 0; i--) if (open[i]) return i
  return 0
}
/** A course unit is open once the course has reached it (the units go in order). */
export const reached = (unit: number, current: number) => unit <= current
