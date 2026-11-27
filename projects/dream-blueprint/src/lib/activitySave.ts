import { useRef, useState } from 'react'
import type { AppState } from './store'

export type SaveActivity = (apply: (previous: AppState) => AppState) => Promise<void>

/** Keep progression controls blocked while the current answer or annotation is being saved. */
export function useActivitySave() {
  const inFlight = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(work: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      await work()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '無法儲存練習紀錄，請再試一次。')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return { saving, error, save, clearError: () => setError('') }
}
