import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import reading from '../src/data/reading.json' with { type: 'json' }
import nursing from '../src/data/nursing-reading.json' with { type: 'json' }
import legacy from './fixtures/reading-legacy.json' with { type: 'json' }
import { wordCount } from '../src/lib/writing.ts'
import {
  levelTarget, nextReading, passed, readBands, readKey, readLevelsOpen, readRecord, readSteps,
  readStepKey, readStepProgress, readSummary, saveRead, suggestedLevel,
  type ReadPassage, type ReadStep,
} from '../src/lib/reading.ts'

const general = reading as ReadPassage[]
const nurses = nursing as ReadPassage[]
const ranges = {
  A1: { easy: [40, 60, 4, 4], mid: [60, 80, 5, 5], hard: [80, 100, 5, 5] },
  A2: { easy: [100, 120, 6, 6], mid: [120, 140, 6, 6], hard: [140, 160, 6, 6] },
  B1: { easy: [160, 190, 7, 7], mid: [190, 220, 7, 7], hard: [220, 260, 7, 7] },
  B2: { easy: [250, 300, 8, 8], mid: [300, 400, 8, 9], hard: [400, 600, 10, 10] },
} as const
const old = new Map([...legacy.reading, ...legacy.nursing].map(p => [p.id, p]))
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => JSON.stringify(key) + ':' + stable(v)).join(',') + '}'
  return JSON.stringify(value) ?? 'null'
}
const sha = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex')

test('閱讀教材分十二小級：各小級篇數、題數、字數與欄位完整', () => {
  assert.deepEqual(readSteps.map(readStepKey), ['A1-easy', 'A1-mid', 'A1-hard', 'A2-easy', 'A2-mid', 'A2-hard', 'B1-easy', 'B1-mid', 'B1-hard', 'B2-easy', 'B2-mid', 'B2-hard'])
  assert.deepEqual(readBands.map(b => b.name), ['簡單', '中等', '難'])
  for (const step of readSteps) {
    const here = general.filter(p => p.level === step.level && p.band === step.band && !p.unit)
    const minimum = step.level === 'A1' || step.level === 'A2' ? 12 : step.level === 'B1' ? 10 : 8
    assert.ok(here.length >= minimum, readStepKey(step) + ' 至少 ' + minimum + ' 篇一般文章；橋接不算')
  }
  const all = [...general, ...nurses]
  assert.equal(new Set(all.map(p => p.id)).size, all.length, '兩套教材的 id 不能重複')
  for (const p of all) {
    assert.ok(readBands.some(b => b.id === p.band), p.id + ' 有合法 band')
    assert.ok(p.title.trim() && p.zh.trim() && p.topic.trim() && p.paras.every(x => x.trim()), p.id + ' 有文章與中文大意')
    assert.ok(Math.abs(p.words - wordCount(p.paras.join(' '))) <= 5, p.id + ' 字數應算對')
    if (p.id.startsWith('n-')) continue // Nursing keeps its own shorter passages and six-question practice.
    const [low, high, minQuestions, maxQuestions] = ranges[p.level][p.band]
    assert.ok(p.qs.length >= minQuestions && p.qs.length <= maxQuestions, p.id + ' 題數要符合小級')
    if (!old.has(p.id)) {
      const words = wordCount(p.paras.join(' '))
      assert.ok(words >= low && words <= high, p.id + ' 新文章 ' + words + ' 字，應在 ' + low + '–' + high)
      assert.match(p.id, /^(a1|a2|b1|b2)-[a-z]+(?:-[a-z]+)*$/, p.id + ' 新 id 用小寫英文')
    }
  }
})

test('舊文章與原題逐題原封不動，新題只能接在最後，舊答案位置不會改掉', async () => {
  const byId = new Map([...general, ...nurses].map(p => [p.id, p]))
  // A passage whose content had to be corrected is listed in content-updates.json (the home page says 教材修正了): it
  // keeps its id, every old question in its place with the same answer position, and no question is removed.
  const updates = (await import('../src/data/content-updates.json', { with: { type: 'json' } })).default as { passages?: string[] }[]
  const corrected = new Set(updates.flatMap(u => u.passages ?? []))
  for (const entry of old.values()) {
    const p = byId.get(entry.id)!
    assert.ok(p, entry.id + ' 不能刪掉')
    if (corrected.has(p.id)) {
      assert.ok(p.qs.length >= entry.questions.length, p.id + ' 修正後題目不能變少')
      // The answer positions of the old questions, as they were before the correction (old picks stay readable).
      const answers: Record<string, number[]> = { 'n-b1-hypoglycemia': [0, 1, 0, 2, 1, 2], 'n-b1-pressure-injury': [1, 2, 0, 1, 0, 2],
        // 2026-11-26-audit4
        'a1-teeth': [0, 1, 2, 1, 1], 'a2-typhoon': [1, 2, 0, 2, 1, 2], 'br44-r1': [0, 1, 0, 1, 2, 1, 2, 0], 'br45-r2': [0, 1, 1, 1, 1, 2, 0, 2, 2],
        'br45-held': [0, 0, 0, 0, 1, 2, 1, 2], 'a1-easy-blue-bag': [0, 1, 2, 0], 'a1-mid-rainy-hall': [1, 2, 0, 1, 2],
        'b2-hard-warning-model': [0, 1, 0, 2, 2, 1, 0, 2, 1, 0], 'n-a2-night-shift': [1, 1, 1, 0, 2, 2] }
      assert.ok(answers[p.id], p.id + ' 修正的文章要在這裡記下原本的答案位置')
      assert.deepEqual(p.qs.slice(0, answers[p.id].length).map(q => q.answer), answers[p.id], p.id + ' 修正後答案位置不變')
      continue
    }
    const { band: _band, words: _words, qs, ...content } = p
    assert.equal(sha(content), entry.content, p.id + ' 原文章內容不改')
    assert.deepEqual(qs.slice(0, entry.questions.length).map(sha), entry.questions, p.id + ' 原題、順序、選項、答案和解析不改')
  }
})

test('閱讀新題：三選一、答案有效且分散、題目不重複、證據逐字出自文章', () => {
  for (const p of [...general, ...nurses]) {
    const text = p.paras.join(' ')
    const original = old.get(p.id)?.questions.length ?? 0
    assert.equal(new Set(p.qs.map(q => q.q.trim().toLowerCase())).size, p.qs.length, p.id + ' 同篇題目不重複')
    assert.ok(new Set(p.qs.map(q => q.answer)).size >= 2, p.id + ' 正解不能都在同一位置')
    for (const [i, q] of p.qs.entries()) {
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, p.id + ' 第 ' + (i + 1) + ' 題答案有效')
      assert.ok(q.q.trim() && q.why.trim(), p.id + ' 題目和解析不能空白')
      assert.equal(new Set(q.options).size, q.options.length, p.id + ' 選項不能重複')
      if (q.evidence) assert.ok(text.includes(q.evidence), p.id + ' 證據必須逐字出現在文章裡：' + q.evidence)
      if (i < original) continue // Published four-option headings and other old questions keep their original format.
      assert.equal(q.options.length, 3, p.id + ' 新題三選一')
      if (['detail', 'evidence', 'tfng'].includes(q.type)) assert.ok(q.evidence?.trim(), p.id + ' 新細節、證據、是非題要附原句')
      if (q.evidence) assert.ok(p.paras.some(para => para.includes(q.evidence!)), p.id + ' 新證據要在同一段內，畫面才標得出來')
      if (q.type === 'tfng') assert.deepEqual(q.options, ['True', 'False', 'Not Given'], p.id + ' 是非沒提到固定選項')
      if (q.type === 'reference' || q.type === 'vocab') {
        for (const quoted of q.q.matchAll(/["“]([^"”]+)["”]/g)) {
          const normalize = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'")
          assert.ok(normalize(text).includes(normalize(quoted[1])), p.id + ' 題目引用的詞真的要在文章裡：' + quoted[1])
        }
      }
    }
    if (!old.has(p.id)) {
      const types = new Set(p.qs.map(q => q.type))
      if (p.level === 'A1' && p.band === 'easy') assert.ok([...types].every(t => t === 'main' || t === 'detail'), p.id + ' 入門簡單只練主旨和細節')
      if (p.level === 'A1' && p.band === 'mid') {
        assert.ok(types.has('reference'), p.id + ' 中等加入代名詞')
        assert.ok([...types].every(t => ['main', 'detail', 'reference'].includes(t)), p.id + ' 猜字義等題型留到後面的小級')
      }
      if (p.level === 'A1' && p.band === 'hard') assert.ok(types.has('vocab'), p.id + ' 難加入猜字義')
      if (p.level === 'B1') assert.ok(types.has('evidence'), p.id + ' 中級要練找證據與推論')
      if (p.level === 'B1' && p.band === 'hard') assert.ok(types.has('tfng'), p.id + ' 中級難要練是非沒提到')
      if (p.level === 'B2') for (const type of ['tfng', 'heading', 'detail', 'vocab']) assert.ok(types.has(type as typeof p.qs[number]['type']), p.id + ' 雅思題型包含 ' + type)
    }
  }
})

const makePassages = (step: ReadStep, count = 12): ReadPassage[] => Array.from({ length: count }, (_, i) => ({ id: 'test-' + readStepKey(step) + '-' + i, ...step, title: 'Example', topic: '測試', paras: ['A nurse is here.'], words: 4, zh: '有一位護理師。', qs: [{ type: 'detail', q: 'Who is here?', options: ['A nurse', 'A student', 'A cook'], answer: 0, why: '文章寫有護理師。', evidence: 'A nurse is here.' }] }))
const attempt = (correct = 4, total = 4) => ({ day: '2026-11-24', picks: [0, 1, 2, 0], correct, total, tries: 1 })

test('讀過後面小級不鎖回去；建議從最簡單、還沒過關的小級開始；達標後繼續打開下一小級', () => {
  const all = readSteps.flatMap(s => makePassages(s))
  const band = { level: 'A2', band: 'mid' } as const
  const here = all.filter(p => p.level === band.level && p.band === band.band)
  let notes = { [readKey(here[0].id)]: JSON.stringify(attempt(0)) }
  assert.deepEqual(suggestedLevel(all, notes), { level: 'A1', band: 'easy' }, '只讀過一篇後面的，建議還是從最簡單的開始，一步一步來')
  for (const s of readSteps.slice(0, 5)) assert.equal(readLevelsOpen(all, notes)[readStepKey(s)], true, '曾讀過的位置和它前面都開著')
  assert.equal(readLevelsOpen(all, notes)['A2-hard'], false, '讀過不等於過關')
  for (const p of here.slice(0, 10)) notes = { ...notes, [readKey(p.id)]: JSON.stringify(attempt()) }
  assert.equal(readLevelsOpen(all, notes)['A2-hard'], true, '以前沒做過新增的前面小級，也能繼續往前')
  assert.deepEqual(suggestedLevel(all, notes), { level: 'A1', band: 'easy' }, '開著的可以自己選，建議仍是最前面還沒過關的')
  assert.equal(nextReading(all, band, {}, [here[0].id])?.id, here[1].id)
  assert.equal(nextReading(all, band, {}, here.map(p => p.id)), null, '跳過整個小級不偷換到其他小級')
  assert.equal(nextReading([here[0], all[0]], null, {}, [here[0].id])?.id, all[0].id, '單元 only 模式可選整包，不受小級限制')
})

test('更新前已開 A2 的人不用重讀新增文章；重做後仍保留，新的進度不走舊門檻', () => {
  const oldA1 = legacy.reading.filter(p => p.id.startsWith('a1-')).slice(0, 12)
  let notes: Record<string, string> = Object.fromEntries(oldA1.map(p => [readKey(p.id), JSON.stringify(attempt())]))
  for (const band of readBands) assert.equal(readLevelsOpen(general, notes)[readStepKey({ level: 'A2', band: band.id })], true, '舊版 A2 已開，三小級都保留')
  assert.deepEqual(suggestedLevel(general, notes), { level: 'A2', band: 'easy' })
  for (const p of oldA1) notes = saveRead(notes, p.id, { day: '2026-11-25', picks: [2, 2, 2, 2], correct: 0, total: 5 })
  assert.equal(readLevelsOpen(general, notes)['A2-easy'], true, '重做不會把舊成績的開放權限弄丟')
  assert.equal(readRecord(notes, oldA1[0].id)?.legacyBest?.total, 4, '保留原四題成績')
  assert.equal(passed(readRecord(notes, oldA1[0].id)), true, '較差的重做也不會抹掉過關')
  let fresh: Record<string, string> = {}
  for (const p of oldA1) fresh = saveRead(fresh, p.id, { day: '2026-11-25', picks: [0, 1, 2, 0], correct: 4, total: 4 })
  assert.equal(readRecord(fresh, oldA1[0].id)?.legacyBest, undefined, '新作答不假裝是舊成績')
  assert.equal(readLevelsOpen(general, fresh)['A2-hard'], false, '新用戶仍要依小級過關，不能用舊篇數跳過 A2')
  let short = Object.fromEntries(oldA1.map((p, i) => [readKey(p.id), JSON.stringify(attempt(i < 11 ? 4 : 0))]))
  short = saveRead(short, oldA1[11].id, { day: '2026-11-25', picks: [0, 1, 2, 0, 1], correct: 5, total: 5 })
  assert.equal(readRecord(short, oldA1[11].id)?.legacyBest?.correct, 0, '更新後進步也不能改寫舊版當時的成績')
  assert.equal(readLevelsOpen(general, short)['A2-hard'], false, '新過關的題目不會補滿舊門檻、直接打開整個 A2')
  const partialBackup = { [readKey('a2-cafe')]: JSON.stringify(attempt(0)) }
  assert.equal(readLevelsOpen(general, partialBackup)['A2-hard'], true, '舊備份即使只留後面級別的紀錄，原本整級開放的權限仍保留')
})

test('護理閱讀略過沒有文章的小級，建議從第一個有文章的小級開始', () => {
  const first = readSteps.find(s => nurses.some(p => p.level === s.level && p.band === s.band))!
  assert.equal(first.level, 'A2')
  assert.deepEqual(suggestedLevel(nurses, {}), first)
  assert.equal(readLevelsOpen(nurses, {})[readStepKey(first)], true)
  const sparse = [...makePassages({ level: 'A2', band: 'mid' }, 2), ...makePassages({ level: 'B1', band: 'hard' }, 4)]
  const notes = Object.fromEntries(sparse.slice(0, 2).map(p => [readKey(p.id), JSON.stringify(attempt())]))
  assert.equal(readLevelsOpen(sparse, notes)['B1-hard'], true)
  assert.deepEqual(suggestedLevel(sparse, notes), { level: 'B1', band: 'hard' })
  assert.equal(readStepProgress(sparse, { level: 'A2', band: 'mid' }, notes).target, levelTarget(2))
})

test('舊紀錄沒有回答後來新增的題，錯題統計不把那些題算錯', () => {
  const p = makePassages({ level: 'A1', band: 'easy' }, 1)[0]
  p.qs = [...p.qs, { type: 'vocab', q: 'What does nurse mean?', options: ['護理師', '老師', '廚師'], answer: 0, why: 'nurse 是護理師。' }, { ...p.qs[0], q: 'Another new question' }]
  const notes = { [readKey(p.id)]: JSON.stringify({ ...attempt(1, 1), picks: [0] }) }
  const summary = readSummary([p], notes)
  assert.deepEqual(summary.types, { detail: { right: 1, total: 1 } })
  assert.equal(summary.weakest, undefined)
  assert.equal(summary.done, 1)
  assert.equal(passed(readRecord(notes, p.id)), true, '原本 1/1 的過關不因現在多題而消失')
})

test('閱讀題的答案位置不會有規律：選項顯示時打散（每次打開一樣），存的還是原本的答案順序', async () => {
  const { shownPassage, savedPicks, shownPicks, savedCauses } = await import('../src/lib/reading.ts')
  const all = (await import('../src/data/reading.json')).default as import('../src/lib/reading.ts').ReadPassage[]
  const cyclic = (answers: number[], sizes: number[]) => answers.length >= 3 && answers.every((a, i) => (a - answers[0] + sizes[i] * 9) % sizes[i] === i % sizes[i])
  let before = 0, after = 0
  const tfOrders = new Map<string, Set<string>>()
  for (const p of all) {
    const shown = shownPassage(p)
    assert.deepEqual(shownPassage(p), shown, p.id + ' 每次打開順序一樣')
    shown.qs.forEach(q => {
      const orig = p.qs[q.from]
      assert.deepEqual([...q.options].sort(), [...orig.options].sort(), p.id + ' 選項一個不少')
      assert.equal(q.options[q.answer], orig.options[orig.answer], p.id + ' 正確答案還是同一個')
      if (q.type === 'tfng') assert.deepEqual(q.options, orig.options, 'True / False / Not Given 的順序不變')
    })
    assert.deepEqual(shown.qs.map(q => q.from).sort((a, b) => a - b), p.qs.map((_, i) => i), p.id + ' 每一題都在')
    // All right, saved in the data's order: exactly the data's answers; and read back as shown.
    const right = shown.qs.map(q => q.answer)
    assert.deepEqual(savedPicks(shown.qs, right), p.qs.map(q => q.answer))
    assert.deepEqual(shownPicks(shown.qs, p.qs.map(q => q.answer)), right)
    assert.deepEqual(Object.keys(savedCauses(shown.qs, { 0: '看太快' })), [String(shown.qs[0].from)])
    const mc = (qs: readonly { type: string; answer: number; options: string[] }[]) => qs.filter(q => q.type !== 'tfng')
    if (cyclic(mc(p.qs).map(q => q.answer), mc(p.qs).map(q => q.options.length))) before++
    if (cyclic(mc(shown.qs).map(q => q.answer), mc(shown.qs).map(q => q.options.length))) after++
    const tf = shown.qs.filter(q => q.type === 'tfng').map(q => q.options[q.answer])
    if (tf.length === 3) { const k = p.level + '-' + p.band; tfOrders.set(k, (tfOrders.get(k) ?? new Set()).add(tf.join(','))) }
  }
  assert.ok(before > 60, '原本的資料有規律（這個測試量得到）')
  assert.ok(after < all.length * 0.25, '打散後 A→B→C 輪流的篇數大幅減少：' + after)
  for (const [k, orders] of tfOrders) assert.ok(orders.size > 1, k + ' 的是非題答案順序不再每篇都一樣')
})
