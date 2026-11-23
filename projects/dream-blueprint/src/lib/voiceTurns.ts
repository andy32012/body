/** Two small helpers that keep a full-duplex voice chat going on an ordinary computer with speakers.
 *
 *  GPT-Live listens while it speaks and decides by itself when to stop; there is no setting for it. Two things then go wrong
 *  for a beginner: her own voice (or room noise) reaches the microphone and she stops after a word, and when both sides
 *  wait for the other nothing happens at all. The guard closes the microphone while she is heard; the quiet watch tells
 *  her to speak when nobody has said anything for a while. Both are plain state machines so they can be tested. */

/** Her level (0–1, see `measure` in voice.ts) above which she counts as speaking. Silence from the service measures 0. */
export const HER_HEARD = 0.05
/** His level above which the microphone counts as hearing a voice. */
export const YOU_HEARD = 0.08
/** How long she must be silent before the microphone opens again: longer than the pause between two words, and long
 *  enough for the echo of her last word to die away. */
export const GUARD_HOLD_MS = 450
/** The microphone is never kept closed longer than this in one stretch. If her level never drops (noise on the line),
 *  the guard lets go and stays out of the way until it has seen silence once, so she can always hear him. */
export const GUARD_MAX_MS = 15000

export interface GuardState { muted: boolean; since: number; silentFrom: number | null; released: boolean }
export const guardStart = (): GuardState => ({ muted: false, since: 0, silentFrom: null, released: false })

export function guardStep(s: GuardState, her: number, now: number): GuardState {
  if (her > HER_HEARD) {
    if (s.released) return { ...s, silentFrom: null }
    if (!s.muted) return { muted: true, since: now, silentFrom: null, released: false }
    if (now - s.since >= GUARD_MAX_MS) return { muted: false, since: now, silentFrom: null, released: true }
    return { ...s, silentFrom: null }
  }
  const silentFrom = s.silentFrom ?? now
  if (now - silentFrom >= GUARD_HOLD_MS) return { muted: false, since: s.since, silentFrom, released: false }
  return { ...s, silentFrom }
}

/** `last` is when anyone was last heard (sound or transcript); `nudges` counts the reminders since he last said something. */
export interface QuietState { last: number; nudges: number }
export const quietStart = (now: number): QuietState => ({ last: now, nudges: 0 })

/** A piece of transcript arrived. His words also re-arm the reminders. */
export const quietHeard = (s: QuietState, role: 'user' | 'assistant', now: number): QuietState =>
  ({ last: now, nudges: role === 'user' ? 0 : s.nudges })

/** Call often with the current levels. `nudge` is true once when both sides have been silent for `afterMs`; after
 *  `times` reminders without a word from him it stays quiet (he may have left the room). */
export function quietStep(s: QuietState, at: { her: number; you: number; now: number }, afterMs: number, times: number): { state: QuietState; nudge: boolean } {
  if (at.her > HER_HEARD || at.you > YOU_HEARD) return { state: { ...s, last: at.now }, nudge: false }
  if (s.nudges >= times || at.now - s.last < afterMs) return { state: s, nudge: false }
  return { state: { last: at.now, nudges: s.nudges + 1 }, nudge: true }
}
