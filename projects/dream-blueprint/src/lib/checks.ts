/**
 * Claude's checks of a written answer arrive later than they are asked for. A reply counts only for the check it
 * answers: the newest check of a box that is still on screen, about the item and the exact text that were sent.
 */

/** Numbers the checks of one box. `isCurrent` is false for an earlier check once a newer one started, and for every
 *  check once the box is closed (it left the screen: another passage, another word). */
export function checkSequence() {
  let last = 0
  let open = true
  return {
    start: () => ++last,
    isCurrent: (id: number) => open && id === last,
    close: () => { open = false },
    open: () => { open = true },
  }
}

/** What a check judged. */
export interface Judged { id: string; answer: string }
/** A check still applies only to the item it judged and the text as it was sent: editing the answer, or moving to
 *  another item, needs a new check before it counts. */
export const checkApplies = (judged: Judged | undefined, id: string | undefined, answer: string) =>
  !!judged && id !== undefined && judged.id === id && judged.answer === answer.trim()
