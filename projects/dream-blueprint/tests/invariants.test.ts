import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import curriculum from '../src/data/curriculum.json' with { type: 'json' }
import schedule from '../src/data/curriculumSchedule.json' with { type: 'json' }
import lessons from '../src/data/lessons.json' with { type: 'json' }
import grammar from '../src/data/grammar.json' with { type: 'json' }
import bridge from '../src/data/bridge.json' with { type: 'json' }
import topics from '../src/data/topics.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }
import passages from '../src/data/passages.json' with { type: 'json' }
import reading from '../src/data/reading.json' with { type: 'json' }
import nursingReading from '../src/data/nursing-reading.json' with { type: 'json' }
import nursingListening from '../src/data/nursing-listening.json' with { type: 'json' }
import nursingWords from '../src/data/nursing-words.json' with { type: 'json' }
import sentences from '../src/data/sentences.json' with { type: 'json' }
import words from '../src/data/words.json' with { type: 'json' }
import quiz from '../src/data/quiz.json' with { type: 'json' }
import scenarios from '../src/data/scenarios.json' with { type: 'json' }
import wordParts from '../src/data/word-parts.json' with { type: 'json' }
import medicalParts from '../src/data/medical-parts.json' with { type: 'json' }
import cueCards from '../src/data/cue-cards.json' with { type: 'json' }
import pronunciation from '../src/data/pronunciation.json' with { type: 'json' }
import starters from '../src/data/starters.json' with { type: 'json' }
import gept from '../src/data/gept-speaking.json' with { type: 'json' }
import writing from '../src/data/writing.json' with { type: 'json' }
import examSubjects from '../src/data/exam-subjects.json' with { type: 'json' }
import rivals from '../src/data/rivals.json' with { type: 'json' }
import contentUpdates from '../src/data/content-updates.json' with { type: 'json' }
import cosmosD from '../src/data/cosmos-d.json' with { type: 'json' }
import cosmosG from '../src/data/cosmos-g.json' with { type: 'json' }
import cosmosN from '../src/data/cosmos-n.json' with { type: 'json' }
import cosmosP from '../src/data/cosmos-p.json' with { type: 'json' }
import cosmosS from '../src/data/cosmos-s.json' with { type: 'json' }
import examA1 from '../src/data/exam-reading-a1.json' with { type: 'json' }
import examA2 from '../src/data/exam-reading-a2.json' with { type: 'json' }
import examB1 from '../src/data/exam-reading-b1.json' with { type: 'json' }
import examB2 from '../src/data/exam-reading-b2.json' with { type: 'json' }

/**
 * Content only grows, and IDs never change: review cards, history, evidence and notes point at them, so a renamed
 * or deleted ID silently loses his progress. tests/fixtures/content-baseline.json records every ID and how many
 * teaching items there were; this test fails when one goes missing or a total gets smaller.
 * After adding content, `UPDATE_BASELINE=1 npx tsx --test tests/invariants.test.ts` records it too. The update only
 * ever adds IDs and raises totals. Never edit the baseline by hand to make a deletion pass.
 */
type Baseline = { ids: Record<string, string[]>; counts: Record<string, number> }
const baselineFile = new URL('./fixtures/content-baseline.json', import.meta.url)

const idsOf = (list: readonly { id: string | number }[]) => list.map(x => String(x.id))
const total = <T>(list: readonly T[], field: (x: T) => readonly unknown[] | undefined) => list.reduce((n, x) => n + (field(x)?.length ?? 0), 0)
const exams = [...examA1, ...examA2, ...examB1, ...examB2] as { id: string; qs: unknown[] }[]
const units = curriculum.units as { unit: number; days: { id: string }[]; checkpoint: { id: string }[]; backup: { id: string }[]; retrySentences: { id: string }[] }[]

function current(): Baseline {
  return {
    ids: {
      'curriculum units': units.map(u => String(u.unit)),
      'curriculum sentences': [...new Set(units.flatMap(u => [...u.days, ...u.checkpoint, ...u.backup, ...u.retrySentences].map(s => s.id)))],
      'lessons (units)': lessons.map(l => String(l.unit)),
      'grammar (units)': grammar.map(g => String(g.unit)),
      'bridge (units)': bridge.map(b => String(b.unit)),
      'topics and their sentences': topics.flatMap(t => [t.id, ...t.practice.map(p => p.id), ...t.review.practice.map(p => p.id)]),
      'words (levels.json)': (levels as { en: string }[]).map(w => w.en),
      passages: idsOf(passages),
      reading: idsOf(reading),
      'nursing reading': idsOf(nursingReading),
      'nursing listening': idsOf(nursingListening),
      'nursing words': (nursingWords as { en: string }[]).map(w => w.en),
      sentences: idsOf(sentences),
      'topic words': idsOf(words),
      quiz: idsOf(quiz),
      scenarios: idsOf(scenarios),
      'word parts': idsOf(wordParts),
      'medical parts': idsOf(medicalParts),
      'cue cards': idsOf(cueCards),
      pronunciation: idsOf(pronunciation),
      starters: idsOf(starters),
      'GEPT speaking': [...gept.elementary, ...gept.intermediate].map(s => s.id),
      writing: writing.stages.flatMap(s => [s.id, ...s.tasks.map(t => t.id)]),
      'exam subjects': idsOf(examSubjects.subjects),
      photos: [...cosmosD, ...cosmosG, ...cosmosN, ...cosmosP, ...cosmosS].map(p => p.id),
      rivals: idsOf(rivals.rivals),
      'content updates': idsOf(contentUpdates),
      'past exam reading': idsOf(exams),
    },
    counts: {
      'lesson dialogue lines': total(lessons, l => l.dialogue),
      'lesson questions': total(lessons, l => l.questions),
      'lesson variations': total(lessons, l => l.variations),
      'lesson prompts': total(lessons, l => l.prompts),
      'grammar steps': total(grammar, g => g.steps),
      'grammar mistakes': total(grammar, g => g.mistakes),
      'grammar drills': total(grammar, g => g.drills),
      'bridge chunks': total(bridge, b => b.chunks),
      'topic words': total(topics, t => t.words),
      'topic chunks': total(topics, t => t.chunks),
      'reading paragraphs': total(reading, r => r.paras),
      'reading questions': total(reading, r => r.qs),
      'nursing reading questions': total(nursingReading, r => r.qs),
      'nursing listening lines': total(nursingListening, l => l.dialogue),
      'nursing listening questions': total(nursingListening, l => l.questions),
      'pronunciation items': total(pronunciation, p => p.items),
      'scenario steps': total(scenarios, s => s.steps),
      'GEPT speaking questions': total([...gept.elementary, ...gept.intermediate], s => s.questions),
      'GEPT read-aloud sentences': total([...gept.elementary, ...gept.intermediate], s => s.readSentences),
      'past exam reading questions': total(exams, e => e.qs),
    },
  }
}

const now = current()
const baseline: Baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : { ids: {}, counts: {} }

test('教材只會變多：以前有的單元、句子、單字、文章、題目一個都沒少，ID 也沒改', () => {
  const missing = Object.entries(baseline.ids).flatMap(([part, list]) => {
    const have = new Set(now.ids[part] ?? [])
    return list.filter(id => !have.has(id)).map(id => '不見了（或 ID 被改了）' + part + '：' + id)
  })
  const smaller = Object.entries(baseline.counts).filter(([k, n]) => (now.counts[k] ?? 0) < n).map(([k, n]) => '變少了 ' + k + '：' + n + ' → ' + (now.counts[k] ?? 0))
  const problems = [...missing.slice(0, 50), ...smaller]
  assert.deepEqual(problems, [], '\n' + problems.join('\n'))
  assert.ok(Object.keys(baseline.ids).length >= 27 && baseline.ids['words (levels.json)']?.length >= 6000, '基準檔還在，也還記著全部的教材')
})

test('每個單元都有五天課、三句小關卡、五句備用句，單元從 1 號連續編下去', () => {
  assert.ok(units.length >= 53)
  assert.deepEqual(units.map(u => u.unit), units.map((_, i) => i + 1))
  for (const u of units) {
    const have = new Set([...u.days, ...u.checkpoint, ...u.backup].map(s => s.id))
    const need = [1, 2, 3, 4, 5].map(i => `u${u.unit}-d${i}`).concat([1, 2, 3].map(i => `u${u.unit}-c${i}`), [1, 2, 3, 4, 5].map(i => `u${u.unit}-r${i}`))
    assert.deepEqual(need.filter(id => !have.has(id)), [], '單元 ' + u.unit)
  }
  for (const [name, list] of [['課文', lessons], ['文法課', grammar]] as const)
    assert.deepEqual(list.map(x => x.unit).sort((a, b) => a - b), units.map(u => u.unit), name + '每個單元一份')
  assert.ok(schedule.preparedThroughUnit >= 53 && schedule.preparedThroughUnit <= units.length, '課表排到的單元都寫好了')
  assert.ok(gept.elementary.length >= 3 && gept.intermediate.length >= 3 && topics.length >= 9)
})

test('同一種東西的 ID 不重複；會變成複習卡的句子 ID 在不同教材之間也不撞', () => {
  const dupes = (list: string[]) => [...new Set(list.filter((x, i) => list.indexOf(x) !== i))]
  for (const [part, list] of Object.entries(now.ids)) assert.deepEqual(dupes(list), [], part)
  const cards = [...now.ids['curriculum sentences'], ...topics.flatMap(t => [...t.practice, ...t.review.practice].map(p => p.id)), ...now.ids.sentences]
  assert.deepEqual(dupes(cards), [])
})

test('更新基準（只在 UPDATE_BASELINE=1 時）：只加不減', { skip: process.env.UPDATE_BASELINE !== '1' }, () => {
  const merged: Baseline = { ids: {}, counts: {} }
  for (const part of new Set([...Object.keys(baseline.ids), ...Object.keys(now.ids)]))
    merged.ids[part] = [...new Set([...(baseline.ids[part] ?? []), ...(now.ids[part] ?? [])])]
  for (const k of new Set([...Object.keys(baseline.counts), ...Object.keys(now.counts)]))
    merged.counts[k] = Math.max(baseline.counts[k] ?? 0, now.counts[k] ?? 0)
  const lines = Object.entries(merged.ids).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(v))
  writeFileSync(baselineFile, '{\n "ids": {\n' + lines.join(',\n') + '\n },\n "counts": ' + JSON.stringify(merged.counts, null, 1).replace(/\n/g, '\n ') + '\n}\n')
})
