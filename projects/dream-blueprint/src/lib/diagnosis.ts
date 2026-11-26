/** Claude's Chinese reading of a missed nursing question, cached in notes as "diag.<id>". */
export interface Diagnosis { questionZh: string; optionsZh: string[]; words: { en: string; zh: string }[]; why: string[] }
export const diagKey = (id: string) => 'diag.' + id

const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const matchingOptions = (v: unknown, count: number): v is string[] => Array.isArray(v) && v.length === count && v.every(nonempty)

export function parseDiagnosis(text: string, options: number): Diagnosis | null {
  try {
    const first = text.indexOf('{'), last = text.lastIndexOf('}')
    if (first < 0 || last < first) return null
    const j: unknown = JSON.parse(text.slice(first, last + 1))
    if (!j || typeof j !== 'object') return null
    const { questionZh, optionsZh, why, words } = j as Record<string, unknown>
    if (!nonempty(questionZh) || !matchingOptions(optionsZh, options) || !matchingOptions(why, options) || !Array.isArray(words)) return null
    const glossary = new Map<string, { en: string; zh: string }>()
    for (const w of words as unknown[]) {
      if (!w || typeof w !== 'object') continue
      const { en, zh } = w as Record<string, unknown>
      if (!nonempty(en) || !nonempty(zh)) continue
      const term = en.trim().toLowerCase()
      if (!glossary.has(term)) glossary.set(term, { en: en.trim(), zh: zh.trim() })
      if (glossary.size === 6) break
    }
    if (!glossary.size) return null
    return { questionZh: questionZh.trim(), optionsZh: optionsZh.map(o => o.trim()), words: [...glossary.values()], why: why.map(w => w.trim()) }
  } catch { return null }
}

