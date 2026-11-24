import { useCallback, useState, useSyncExternalStore } from 'react'
import { tutorKey } from './tutor'

/** Practice pages teach through Claude's hints and checking; a model answer (參考句、參考寫法、範文) is shown only
 *  as a way on when Claude cannot teach — no key, no network, or a request that failed (bad key, no credit) —
 *  and only after the learner has tried once. */
export function claudeUsable(s: { keyed: boolean; online: boolean; failed: boolean }) {
  return s.keyed && s.online && !s.failed
}
export const answerAllowed = (usable: boolean, tried: boolean) => !usable && tried

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => { window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange) }
}
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false
export const useOnline = () => useSyncExternalStore(subscribe, isOnline, () => true)

/** For one screen: whether Claude can teach right now. Call `failed()` when a request to Claude fails and
 *  `worked()` when one succeeds, so the way on appears only while Claude is really unreachable. */
export function useClaudeGate() {
  const online = useOnline()
  const [down, setDown] = useState(false)
  const usable = claudeUsable({ keyed: !!tutorKey(), online, failed: down })
  const failed = useCallback(() => setDown(true), [])
  const worked = useCallback(() => setDown(false), [])
  return { usable, failed, worked }
}

/** A request that failed because the screen was closed or the request was cancelled does not mean Claude is down. */
export const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'
