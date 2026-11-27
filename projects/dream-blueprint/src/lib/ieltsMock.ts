/** Full IELTS Academic mock tests (the official practice tests, taken on paper or on the official sites): each one is
 *  kept with its date, the band of each skill he got, whether it was timed like the real test, and whether it was a
 *  test he had done before. The overall band follows the official rounding. Kept in the progress notes, so it syncs
 *  and goes into backups with everything else. */
export const mockKey = 'ielts.mocks'
export const skills = ['listening', 'reading', 'writing', 'speaking'] as const
export type MockSkill = typeof skills[number]
export const skillNames: Record<MockSkill, string> = { listening: '聽力', reading: '閱讀', writing: '寫作', speaking: '口說' }
export type MockEntry = { day: string; timed: boolean; redo: boolean; id?: string; at?: number } & Partial<Record<MockSkill, number>>

/** Official free practice for the Academic test (all four skills, real question types, listening played once). */
export const officialPractice = [
  { name: '雅思官方：學術組範例題（四科）', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test' },
  { name: '英國文化協會：學術組免費模擬考', url: 'https://takeielts.britishcouncil.org/en-gb/prepare/ielts-free-practice-mock-tests/academic' },
]

/** A band IELTS can give: 0–9 in half steps. */
export const validBand = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 9 && Number.isInteger(n * 2)
function calendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function clean(v: unknown): MockEntry | null {
  if (!v || typeof v !== 'object') return null
  const e = v as Record<string, unknown>
  if (!calendarDay(e.day)) return null
  const out: MockEntry = { day: e.day, timed: e.timed === true, redo: e.redo === true }
  for (const s of skills) if (validBand(e[s])) out[s] = e[s] as number
  if (!skills.some(skill => out[skill] !== undefined)) return null
  if (typeof e.id === 'string' && e.id) out.id = e.id
  if (typeof e.at === 'number' && Number.isSafeInteger(e.at) && e.at > 0) out.at = e.at
  return out
}
function readEntries(text: string): MockEntry[] {
  try {
    const raw = JSON.parse(text) as unknown
    return Array.isArray(raw) ? raw.map(clean).filter((e): e is MockEntry => !!e) : []
  } catch { return [] }
}
const newestFirst = (a: MockEntry, b: MockEntry) =>
  b.day.localeCompare(a.day) || (b.at ?? 0) - (a.at ?? 0) || (a.id ?? '').localeCompare(b.id ?? '')

/** Every mock, newest first. Broken saved data reads as none. */
export function readMocks(notes: Record<string, string>): MockEntry[] {
  return readEntries(notes[mockKey] ?? '[]').sort(newestFirst)
}
/** One more mock (impossible bands are left out). Nothing is ever removed by adding. */
export function addMock(notes: Record<string, string>, entry: MockEntry): Record<string, string> {
  const e = clean(entry)
  if (!e) return notes
  const at = Date.now()
  const id = globalThis.crypto?.randomUUID?.() ?? at.toString(36) + '-' + Math.random().toString(36).slice(2)
  return { ...notes, [mockKey]: JSON.stringify([{ ...e, id, at }, ...readMocks(notes)].sort(newestFirst)) }
}

export function mergeMockEntries(older: string, newer: string): string {
  const entries = new Map<string, MockEntry>()
  for (const text of [older, newer]) {
    const occurrences = new Map<string, number>()
    for (const entry of readEntries(text)) {
      if (entry.id) {
        entries.set('id:' + entry.id, entry)
        continue
      }
      // Older saves could contain repeated, identical results. Preserve as many as either copy recorded.
      const key = JSON.stringify([entry.day, entry.timed, entry.redo, ...skills.map(skill => entry[skill])])
      const occurrence = (occurrences.get(key) ?? 0) + 1
      occurrences.set(key, occurrence)
      entries.set('legacy:' + key + '/' + occurrence, entry)
    }
  }
  return JSON.stringify([...entries.values()].sort(newestFirst))
}

/** The overall band: the mean of the four, rounded the official way (.25 up to .5, .75 up to the next whole band). */
export function overallBand(e: Partial<Record<MockSkill, number>>): number | undefined {
  if (!skills.every(s => validBand(e[s]))) return undefined
  const mean = skills.reduce((t, s) => t + (e[s] as number), 0) / 4
  const whole = Math.floor(mean), part = mean - whole
  return part < 0.25 ? whole : part < 0.75 ? whole + 0.5 : whole + 1
}

/** Month goals about IELTS listening or full mocks show the tools: the official practice and the score log. */
export const mockGoal = (text: string) => /雅思.*(模考|聽力)|模考/.test(text)
