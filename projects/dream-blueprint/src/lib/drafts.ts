/** Half-written answers survive page switches and reloads on this device. */
const key = (id: string) => 'dream-blueprint.draft.' + id
export function readDraft(id: string) {
  try { return localStorage.getItem(key(id)) ?? '' } catch { return '' }
}
export function writeDraft(id: string, text: string) {
  try { text.trim() ? localStorage.setItem(key(id), text) : localStorage.removeItem(key(id)) } catch { /* private mode */ }
}
export const clearDraft = (id: string) => writeDraft(id, '')
