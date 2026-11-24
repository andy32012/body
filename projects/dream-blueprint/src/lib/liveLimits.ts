/** Guard rails for the live voice call, which is billed every connected minute — silence included.
 *  Two minutes without him speaking: a warning. Three: the call ends. Each call runs 20 minutes at a time and
 *  goes on only when he presses 繼續 (from one minute before the end). */
export const IDLE_WARN_MS = 2 * 60_000
export const IDLE_STOP_MS = 3 * 60_000
export const BLOCK_MS = 20 * 60_000
export const LIMIT_WARN_MS = 60_000

export interface LiveClock {
  /** When he was last heard (microphone level or his transcript); the call's start counts as heard. */
  lastYou: number
  /** The call ends at this time unless extended. */
  until: number
}
export interface LiveVerdict { stop: 'idle' | 'limit' | null; warnIdle: boolean; warnLimit: boolean }

export const startClock = (now: number): LiveClock => ({ lastYou: now, until: now + BLOCK_MS })
export const heard = (c: LiveClock, now: number): LiveClock => ({ ...c, lastYou: Math.max(c.lastYou, now) })
/** 繼續: twenty more minutes from the current end (or from now, if that has already passed). */
export const extend = (c: LiveClock, now: number): LiveClock => ({ ...c, until: Math.max(c.until, now) + BLOCK_MS })

export function liveVerdict(c: LiveClock, now: number): LiveVerdict {
  const quiet = now - c.lastYou
  if (quiet >= IDLE_STOP_MS) return { stop: 'idle', warnIdle: false, warnLimit: false }
  if (now >= c.until) return { stop: 'limit', warnIdle: false, warnLimit: false }
  return { stop: null, warnIdle: quiet >= IDLE_WARN_MS, warnLimit: c.until - now <= LIMIT_WARN_MS }
}

export const stopMessages = {
  idle: '你 3 分鐘沒說話，通話自動結束了（不說話也在計費）。想再聊就再按麥克風。',
  limit: '這次聊滿 20 分鐘，通話自動結束了。想再聊就再按麥克風。',
  hidden: '切到別的畫面或 App 到背景，通話自動結束了（避免一直計費）。想再聊就再按麥克風。',
} as const
