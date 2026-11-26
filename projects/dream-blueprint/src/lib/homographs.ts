import data from '../data/homographs.json'
import { wordKey } from './vocab'

/** A spelling that means one thing in everyday English and another in nursing (pupil: 學生 / 瞳孔). `nurseWord` is the
 *  nursing list's entry when it is a phrase (blood culture for culture). */
export interface Homograph {
  en: string; nurseWord?: string; nurse: string; everyday: string
  nurseEx: { en: string; zh: string }; everydayEx: { en: string; zh: string }
}
/** Nursing words that are easily mixed up with each other (dementia / delirium). */
export interface Confusable { words: string[]; tip: string }

export const homographs = data.same as Homograph[]
export const confusables = data.confusable as Confusable[]
const byEveryday = new Map(homographs.map(h => [wordKey(h.en), h]))
const byNurse = new Map(homographs.map(h => [wordKey(h.nurseWord ?? h.en), h]))

/** The note for a word on one side: an everyday word that is also a nursing word, or a nursing word (or phrase) whose
 *  everyday meaning is different. Null for words with one meaning. */
export function homographOf(en: string, side: 'nurse' | 'everyday'): Homograph | null {
  return (side === 'nurse' ? byNurse : byEveryday).get(wordKey(en)) ?? null
}
/** The nursing words easily mixed up with this one, and how to tell them apart. */
export function confusableOf(en: string): Confusable | null {
  const k = wordKey(en)
  return confusables.find(c => c.words.some(w => wordKey(w) === k)) ?? null
}
/** The key a nursing word's practice is saved under. A word that means something else in everyday English is kept apart
 *  ('n:pupil'), so passing 學生 in the everyday words does not count as knowing 瞳孔, and the other way round. Every other
 *  nursing word shares its record with the everyday list (the same meaning, learned once). */
export function nurseSkillKey(en: string) {
  const h = byNurse.get(wordKey(en))
  return h && !h.nurseWord ? 'n:' + wordKey(en) : wordKey(en)
}
