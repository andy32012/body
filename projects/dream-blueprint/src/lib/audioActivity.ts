import { createContext, useCallback, useMemo, useRef, useState } from 'react'

type AudioActivity = {
  busy: boolean
  isBusy: () => boolean
  acquire: (signal: AbortSignal) => (() => void) | undefined
}

export const AudioActivityContext = createContext<AudioActivity | null>(null)

/** Parts of the same speaking exercise share the speakers and microphone. */
export function useAudioActivity(): AudioActivity {
  const owner = useRef<(() => void) | null>(null)
  const [busy, setBusy] = useState(false)
  const isBusy = useCallback(() => owner.current !== null, [])
  const acquire = useCallback((signal: AbortSignal) => {
    if (owner.current || signal.aborted) return
    function release() {
      if (owner.current !== release) return
      owner.current = null
      signal.removeEventListener('abort', release)
      setBusy(false)
    }
    owner.current = release
    signal.addEventListener('abort', release, { once: true })
    setBusy(true)
    return release
  }, [])
  return useMemo(() => ({ busy, isBusy, acquire }), [busy, isBusy, acquire])
}
