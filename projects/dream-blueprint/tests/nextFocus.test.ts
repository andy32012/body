import test from 'node:test'
import assert from 'node:assert/strict'
import { nextFocus } from '../src/lib/nextFocus.ts'
import { addEvidence } from '../src/lib/evidence.ts'

const day = '2026-11-21'
const ev = (notes: Record<string, string>, unit: number, level: 'assisted' | 'independent' | 'delayed' | 'pending', skill: 'write' | 'listen', source: 'pattern' | 'listen' | 'vary' | 'express', d = day) =>
  addEvidence(notes, unit, { day: d, level, skill, source, item: source + unit + d })

test('紀錄不夠時直接說不夠，不亂下結論；累爆的日子不加東西', () => {
  assert.equal(nextFocus({ notes: {}, sessions: [] }, day, 'normal').kind, 'probe')
  assert.equal(nextFocus({ notes: {}, sessions: [] }, day, 'low').kind, 'none')
})
test('只聽常要看字 → 先練聽（從原本的時間裡挪 5 分鐘）', () => {
  let notes: Record<string, string> = {}
  notes = ev(notes, 1, 'assisted', 'listen', 'listen', '2026-11-19')
  notes = ev(notes, 2, 'assisted', 'listen', 'listen', '2026-11-20')
  const f = nextFocus({ notes, sessions: [] }, day, 'normal')
  assert.equal(f.kind, 'listen'); assert.equal(f.minutes, 5); assert.match(f.reason, /2 次要看字/)
})
test('同一個句型兩週內錯三句 → 對比重練；自己寫常要提示 → 多寫；都自己寫對 → 提示晚一點', () => {
  const sessions = [{ day: '2026-11-18', translations: [{ grammar: ['be 動詞'], rating: 'again' as const }, { grammar: ['be 動詞'], rating: 'minor' as const }] },
    { day: '2026-11-20', translations: [{ grammar: ['be 動詞'], rating: 'again' as const }] }]
  assert.equal(nextFocus({ notes: {}, sessions }, day, 'normal').kind, 'contrast')
  let notes: Record<string, string> = {}
  notes = ev(notes, 1, 'assisted', 'write', 'pattern', '2026-11-19'); notes = ev(notes, 1, 'assisted', 'write', 'vary', '2026-11-20'); notes = ev(notes, 1, 'independent', 'write', 'express', '2026-11-20')
  assert.equal(nextFocus({ notes, sessions: [] }, day, 'normal').kind, 'none')
  notes = ev(notes, 2, 'assisted', 'write', 'pattern', day); notes = ev(notes, 2, 'assisted', 'write', 'vary', day); notes = ev(notes, 2, 'assisted', 'write', 'express', day)
  const f = nextFocus({ notes, sessions: [] }, day, 'normal')
  assert.equal(f.kind, 'produce'); assert.match(f.reason, /3 次要看提示/)
  let good: Record<string, string> = {}
  for (const d of ['2026-11-19', '2026-11-20', day]) good = ev(good, 1, 'independent', 'write', 'pattern', d)
  assert.equal(nextFocus({ notes: good, sessions: [] }, day, 'normal').kind, 'raise')
})
