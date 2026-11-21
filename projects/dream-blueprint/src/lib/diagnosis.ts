/** Claude's Chinese reading of a missed nursing question, cached in notes as "diag.<id>". */
export interface Diagnosis { questionZh: string; optionsZh: string[]; words: { en: string; zh: string }[]; why: string[] }
export const diagKey = (id: string) => 'diag.' + id

export function parseDiagnosis(text: string, options: number): Diagnosis | null {
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    if (typeof j.questionZh !== 'string' || !Array.isArray(j.optionsZh) || j.optionsZh.length !== options) return null
    return { questionZh: j.questionZh, optionsZh: j.optionsZh.map(String), words: Array.isArray(j.words) ? j.words.filter((w: { en?: unknown; zh?: unknown }) => w && typeof w.en === 'string' && typeof w.zh === 'string').slice(0, 6) : [],
      why: Array.isArray(j.why) ? j.why.map(String) : [] }
  } catch { return null }
}

