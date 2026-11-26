import { useSyncExternalStore } from 'react'

/** Keep half-written answers available in this tab when the browser cannot write a draft. */
const key = (id: string) => 'dream-blueprint.draft.' + id
const pending = new Map<string, string>()
const listeners = new Set<() => void>()
const hasUnsavedDrafts = () => [...pending.values()].some(text => text.trim().length > 0)
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const useUnsavedDrafts = () => useSyncExternalStore(subscribe, hasUnsavedDrafts, () => false)

export function readDraft(id: string) {
  const draft = pending.get(id)
  if (draft !== undefined) return draft
  try { return localStorage.getItem(key(id)) ?? '' } catch { return '' }
}
export function writeDraft(id: string, text: string) {
  const warned = hasUnsavedDrafts()
  try {
    if (text.trim()) localStorage.setItem(key(id), text)
    else localStorage.removeItem(key(id))
    pending.delete(id)
  } catch {
    pending.set(id, text)
  }
  if (warned !== hasUnsavedDrafts()) listeners.forEach(listener => listener())
}
export const clearDraft = (id: string) => writeDraft(id, '')

export function downloadUnsavedDrafts() {
  const drafts = [...pending.entries()].filter(([, text]) => text.trim()).map(([id, text]) => id + '\n' + text)
  if (!drafts.length) return
  const file = new Blob([drafts.join('\n\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = '夢想藍圖未存草稿.txt'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Where a speech-to-text result that came back goes: into the box when the box still holds what it held when he asked,
 *  otherwise it waits as a choice (he typed or cleared the box while waiting). An empty result changes nothing. */
export function transcriptLanding(asked: string, now: string, transcript: string): 'fill' | 'offer' | 'none' {
  if (!transcript.trim()) return 'none'
  return now === asked ? 'fill' : 'offer'
}
