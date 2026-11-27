import type { Result } from './correction'
import { legacyRecordId } from './recordId'

export type CorrectionSubmission = { id: string; at: number }
export type SavedCorrection = CorrectionSubmission & { answer: string; result: Result }
export type CorrectionFollowUp = CorrectionSubmission & { grade: string; question: string; reply: string }

export function correctionSubmission(): CorrectionSubmission {
  const at = Date.now()
  return { at, id: globalThis.crypto?.randomUUID?.() ?? at.toString(36) + '-' + Math.random().toString(36).slice(2) }
}

export const correctionPrefix = 'correction.'
export const correctionKey = (activity: string) => correctionPrefix + activity

export function readCorrections(value: string | undefined): SavedCorrection[] {
  try {
    const rows: unknown = JSON.parse(value ?? '[]')
    return Array.isArray(rows) ? rows.filter(row => row && typeof row.id === 'string' &&
      Number.isFinite(row.at) && typeof row.answer === 'string' && row.result &&
      typeof row.result.corrected === 'string' && Array.isArray(row.result.fixes)) : []
  } catch { return [] }
}

/** One recent grade for each distinct text. Reply arrival order does not select the latest draft. */
export function mergeCorrections(older: SavedCorrection[], newer: SavedCorrection[]) {
  const byAnswer = new Map<string, SavedCorrection>()
  const ordered = [...older, ...newer].sort(correctionOrder)
  for (const row of ordered) {
    byAnswer.delete(row.answer)
    byAnswer.set(row.answer, row)
  }
  return [...byAnswer.values()].slice(-5)
}

export function correctionOrder(a: CorrectionSubmission, b: CorrectionSubmission) {
  return a.at - b.at || a.id.localeCompare(b.id)
}

export function readCorrection(notes: Record<string, string>, key: string, text: string): SavedCorrection | undefined {
  const rows = readCorrections(notes[key]).sort((a, b) => correctionOrder(b, a))
  return rows.find(row => row.answer === text.trim()) ?? rows[0]
}

export function storeCorrection(notes: Record<string, string>, key: string, grade: SavedCorrection) {
  return { ...notes, [key]: JSON.stringify(mergeCorrections(readCorrections(notes[key]), [grade])) }
}

/** A legacy daily lesson already has the graded answer and the parsed result. Both copies derive the same identity. */
export const correctionGrade = (answer: string, result: Result) => legacyRecordId(JSON.stringify([answer, result]))

export function mergeCorrectionFollowUps(older: readonly CorrectionFollowUp[], newer: readonly CorrectionFollowUp[]) {
  const byId = new Map([...older, ...newer].map(item => [item.id, item]))
  return [...byId.values()].sort(correctionOrder).slice(-20)
}

/** The store can resolve a failed lock request without calling its updater. The paid reply must remain available. */
export async function requireCorrectionSave(write: (applied: () => void) => void | Promise<void>) {
  let applied = false
  await write(() => { applied = true })
  if (!applied) throw new Error('無法寫入批改紀錄。')
}
