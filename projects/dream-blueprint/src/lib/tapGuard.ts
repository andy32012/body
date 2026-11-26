import { useEffect, useRef } from 'react'

/** A double tap must not also answer what appears under the finger next (the next question, the next word): taps within
 *  `ms` after `key` changes are ignored. Call `ready()` at the start of the handler. */
export function useTapGuard(key: unknown, ms = 450) {
  const changed = useRef(0)
  useEffect(() => { changed.current = Date.now() }, [key])
  return () => Date.now() - changed.current >= ms
}
