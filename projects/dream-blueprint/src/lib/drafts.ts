import { useSyncExternalStore } from 'react'

/** Keep half-written answers available in this tab when the browser cannot write a draft. */
const legacyPrefix = 'dream-blueprint.draft.'
const revisionPrefix = 'dream-blueprint.draft-version.'
const revisionKey = (id: string) => revisionPrefix + encodeURIComponent(id) + '/'
export interface DraftVersion { key: string; text: string }
const editing = new Map<string, DraftVersion | undefined>()
const pending = new Map<string, { text: string }>()
const draftChange = 'dream-draft-change'
const listeners = new Set<() => void>()
const hasUnsavedDrafts = () => [...pending.values()].some(draft => !!draft.text.trim())
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const useUnsavedDrafts = () => useSyncExternalStore(subscribe, hasUnsavedDrafts, () => false)

export function draftVersions(id: string): DraftVersion[] {
  try {
    const prefix = revisionKey(id)
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix)).sort().reverse()
    keys.push(legacyPrefix + id)
    return keys.flatMap(key => {
      const text = localStorage.getItem(key)
      return text === null ? [] : [{ key, text }]
    })
  } catch { return [] }
}
/** The writing menu reads many tasks. Discover them once without changing a mounted editor's revision. */
export function savedDraftTexts(prefix: string) {
  const texts = new Map<string, string[]>()
  function collect(id: string, text: string | null) {
    if (!text?.trim()) return
    const values = texts.get(id)
    if (values) values.push(text)
    else texts.set(id, [text])
  }
  try {
    for (const key of Object.keys(localStorage)) {
      let id: string
      if (key.startsWith(legacyPrefix + prefix)) id = key.slice(legacyPrefix.length)
      else if (key.startsWith(revisionPrefix + encodeURIComponent(prefix))) {
        id = decodeURIComponent(key.slice(revisionPrefix.length).split('/')[0])
      } else continue
      collect(id, localStorage.getItem(key))
    }
  } catch { /* Pending drafts are still available in this tab. */ }
  for (const [id, draft] of pending) if (id.startsWith(prefix)) collect(id, draft.text)
  return texts
}
export function hasDraft(id: string) {
  return !!pending.get(id)?.text.trim() || draftVersions(id).some(v => v.text.trim())
}
export function readDraft(id: string, initial = '') {
  const unsaved = pending.get(id)
  if (unsaved) return unsaved.text
  const versions = draftVersions(id)
  const current = versions.find(v => v.key === editing.get(id)?.key) ?? versions[0]
  editing.set(id, current)
  return current?.text ?? initial
}
/** Revisions have immutable keys. Simultaneous writers can retire their shared base without
 * deleting one another's subsequent edits, including in browsers without Web Locks. */
function replaceDraft(id: string, text: string, replaced: DraftVersion[], keepBlank = false) {
  const warned = hasUnsavedDrafts()
  try {
    let next: DraftVersion | undefined
    if (keepBlank || text.trim()) {
      const token = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
      next = { key: revisionKey(id) + Date.now().toString(36) + '-' + token, text }
      localStorage.setItem(next.key, text)
    }
    for (const version of replaced) {
      if (localStorage.getItem(version.key) === version.text) localStorage.removeItem(version.key)
    }
    editing.set(id, next)
    pending.delete(id)
  } catch {
    pending.set(id, { text })
  }
  announceChange(id, warned)
}
function announceChange(id: string, warned: boolean) {
  if (warned !== hasUnsavedDrafts()) listeners.forEach(listener => listener())
  window.dispatchEvent(new CustomEvent(draftChange, { detail: id }))
}
export function writeDraft(id: string, text: string, keepBlank = false) {
  const base = editing.get(id)
  replaceDraft(id, text, base ? [base] : [], keepBlank)
}
export const clearDraft = (id: string) => writeDraft(id, '')

/** Bind later cleanup to the draft revision that was submitted, even if the same text is typed again. */
export function captureDraftCleanup(id: string, text: string) {
  const version = editing.get(id)
  const unsaved = pending.get(id)
  return () => {
    if ((unsaved?.text ?? version?.text) !== text) return
    const current = pending.get(id)
    if (current && current !== unsaved && editing.get(id) === version) return
    const warned = hasUnsavedDrafts()
    try {
      if (version && localStorage.getItem(version.key) === version.text) localStorage.removeItem(version.key)
    } catch { /* Leave the saved draft available if cleanup fails. */ }
    if (editing.get(id) === version) editing.delete(id)
    if (current === unsaved) pending.delete(id)
    announceChange(id, warned)
  }
}

/** Only retire the alternatives actually shown to the learner. A later edit keeps its own revision. */
export function chooseDraft(id: string, text: string, displayed: DraftVersion[], keepBlank = false) {
  replaceDraft(id, text, displayed, keepBlank)
}
export function watchDraft(id: string, refresh: () => void) {
  const prefix = revisionKey(id)
  const local = (e: Event) => { if ((e as CustomEvent<string>).detail === id) refresh() }
  const remote = (e: StorageEvent) => {
    if (e.key === null || e.key === legacyPrefix + id || e.key.startsWith(prefix)) refresh()
  }
  window.addEventListener(draftChange, local)
  window.addEventListener('storage', remote)
  return () => { window.removeEventListener(draftChange, local); window.removeEventListener('storage', remote) }
}

export function downloadUnsavedDrafts() {
  const drafts = [...pending.entries()].filter(([, draft]) => draft.text.trim()).map(([id, draft]) => id + '\n' + draft.text)
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
