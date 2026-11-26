/** Half-written answers survive page switches and reloads on this device. */
const key = (id: string) => 'dream-blueprint.draft.' + id
export function readDraft(id: string) {
  try { return localStorage.getItem(key(id)) ?? '' } catch { return '' }
}
export function writeDraft(id: string, text: string) {
  try { text.trim() ? localStorage.setItem(key(id), text) : localStorage.removeItem(key(id)) } catch { /* private mode */ }
}
export const clearDraft = (id: string) => writeDraft(id, '')

/** Where a speech-to-text result that came back goes: into the box when the box still holds what it held when he asked,
 *  otherwise it waits as a choice (he typed or cleared the box while waiting). An empty result changes nothing. */
export function transcriptLanding(asked: string, now: string, transcript: string): 'fill' | 'offer' | 'none' {
  if (!transcript.trim()) return 'none'
  return now === asked ? 'fill' : 'offer'
}
