import test from 'node:test'
import assert from 'node:assert/strict'
import writing from '../src/data/writing.json' with { type: 'json' }
import { checksFor, gradePrompt, migrateWritingProgress, readWrite, rubricFor, sentenceParts, stagesOpen, suggestedStage, wordCount, writeKey, writingMigrationKey, type WriteStage } from '../src/lib/writing.ts'
import { createInitialState, exportBackup, importBackup } from '../src/lib/store.ts'
import { packUnits } from '../src/lib/bridge.ts'

const stages = writing.stages as WriteStage[]
const by = (id: string) => stages.find(s => s.id === id)!
const record = (best?: number) => JSON.stringify({ day: '2026-11-24', words: 30, tries: best === undefined ? 0 : 1, ...(best === undefined ? { self: 1 } : { best }) })
const notesFor = (ids: string[], best?: number) => Object.fromEntries(ids.map(id => [writeKey(id), record(best)]))

test('十四階從完整句逐步到雅思：題數、最低字數與官方評分表對應', () => {
  const expected = [
    ['basic', 'gept-sentence', 5, 10], ['longer', 'gept-sentence', 5, 15],
    ['negq', 'gept-sentence', 4, 15], ['yesterday', 'gept-sentence', 4, 20],
    ['sentence', 'gept-sentence', 4], ['steps', 'gept-paragraph', 4, 40],
    ['paragraph', 'gept-paragraph', 3], ['opinion', 'gept-paragraph', 4, 80],
    ['multi', 'gept-essay', 3], ['numbers', 'gept-essay', 3, 80],
    ['task1', 'ielts-task1', 2], ['twosides', 'gept-essay', 3, 150],
    ['task2', 'ielts-task2', 3], ['bridge', 'gept-essay', 12],
  ] as const
  assert.deepEqual(stages.map(s => s.id), expected.map(s => s[0]))
  for (const [id, rubric, count, min] of expected) {
    const s = by(id)
    assert.equal(rubricFor(s).id, rubric, id)
    assert.equal(s.tasks.length, count, id)
    if (min !== undefined) assert.ok(s.tasks.every(t => t.min === min), id + ' 最低字數')
    assert.ok(s.goal.trim())
    if (min !== undefined) assert.ok(s.criteria.length >= 3 && s.criteria.length <= 5, id + ' 要求')
  }
  assert.equal(stages.filter(s => s.pack).length, 1)
  assert.equal(by('bridge').pack, true)
  assert.deepEqual(stages.map(s => s.name[0]), [...'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭'])
  assert.equal(stages.reduce((total, s) => total + s.tasks.length, 0), 59)
})

test('每一階（含橋接）有文法重點、例句及可理解的改錯說明', () => {
  for (const s of stages) {
    assert.ok(s.grammar?.title.trim(), s.id + ' 文法標題')
    assert.ok(s.grammar.points.length >= 2 && s.grammar.points.length <= 4, s.id + ' 文法重點')
    assert.ok(s.grammar.points.every(p => p.trim()), s.id)
    assert.ok(s.grammar.examples.length >= 3 && s.grammar.examples.length <= 5, s.id + ' 例句')
    assert.ok(s.grammar.examples.every(e => e.en.trim() && e.zh.trim()), s.id)
    for (const m of s.grammar.mistakes ?? []) assert.ok(m.bad.trim() && m.good.trim() && m.why.trim(), s.id + ' 常見錯誤')
  }
})

test('題目 id 不重複、範文達字數；數字暖身有可畫的小圖表', () => {
  const tasks = stages.flatMap(s => s.tasks)
  assert.equal(new Set(tasks.map(t => t.id)).size, tasks.length)
  assert.equal(new Set(stages.map(s => s.id)).size, stages.length)
  for (const t of tasks) {
    assert.ok(t.prompt.trim() && t.zh.trim() && t.sample.trim(), t.id)
    assert.ok(wordCount(t.sample) >= t.min, t.id + ' 範文未達最低字數')
  }
  for (const t of by('numbers').tasks) {
    assert.ok(t.chart?.title.trim(), t.id + ' 圖表標題')
    assert.ok(t.chart.points.length >= 3, t.id + ' 圖表數據')
    assert.ok(t.chart.points.every(p => p.label.trim() && Number.isFinite(p.value)), t.id)
  }
})

test('單句階段逐句評分：未指定項目就固定三句，指定項目與範文句數相符', () => {
  for (const s of stages.filter(s => rubricFor(s).id === 'gept-sentence')) for (const t of s.tasks) {
    assert.deepEqual(checksFor(s, t), [], t.id + ' 不另列整段檢查項')
    const parts = sentenceParts(t)
    const specified = /\bUse (.+)\.\s*$/i.exec(t.prompt)
    if (!specified) {
      assert.match(t.prompt, /\bWrite three sentences\b/i, t.id)
      assert.deepEqual(parts, ['第 1 句', '第 2 句', '第 3 句'])
    } else {
      assert.ok(parts.every(p => p.startsWith('用 ') && p.endsWith(' 的句子')), t.id)
      assert.equal(new Set(parts).size, parts.length, t.id + ' 指定項目不可重複')
    }
    assert.equal(t.sample.split(/[.!?]+/).filter(s => s.trim()).length, parts.length, t.id + ' 範文示範每個指定句子')
  }
  assert.deepEqual(sentenceParts({ prompt: 'Write three sentences. Use am, is, and are.' }), ['用 am 的句子', '用 is 的句子', '用 are 的句子'])
  assert.deepEqual(sentenceParts({ prompt: 'Write four sentences. Use am, is, are, and likes.' }), ['用 am 的句子', '用 is 的句子', '用 are 的句子', '用 likes 的句子'])
})

test('最初四階範文先寫簡單句；前三階不提前用過去式', () => {
  for (const id of ['basic', 'longer', 'negq', 'yesterday']) {
    const s = by(id)
    for (const t of s.tasks) assert.doesNotMatch(t.sample, /\b(?:and|but|so|because)\b/i, t.id + ' 連接詞留到第五階')
    if (id !== 'yesterday') for (const t of s.tasks) assert.doesNotMatch(t.sample, /\b(?:was|were|did|didn't|went|ate|had|visited|studied|worked|yesterday)\b/i, t.id + ' 過去式留到第四階')
  }
})

test('批改包含這一階教過的文法，但仍只照官方評分表', () => {
  for (const s of stages) {
    const t = s.tasks[0], prompt = gradePrompt(s, t, t.prompt)
    assert.ok(prompt.includes(s.grammar!.title), s.id)
    for (const p of s.grammar!.points) assert.ok(prompt.includes(p), s.id + ' ' + p)
    assert.match(prompt, /不要因為沒用到更難的文法扣分/)
    assert.match(prompt, /分數仍只照下面的官方評分表/)
    assert.ok(prompt.includes(rubricFor(s).title), s.id)
  }
  const optional: WriteStage = { id: 'custom', name: '', goal: '', criteria: [], tasks: by('basic').tasks }
  assert.doesNotThrow(() => gradePrompt(optional, optional.tasks[0], optional.tasks[0].prompt))
})

test('新使用者完整走十三階：每階過兩題才開下一階，不因舊階段名稱跳過新階段', () => {
  const ladder = stages.filter(s => !s.pack)
  let notes = createInitialState('2026-11-24').notes
  for (const [i, s] of ladder.entries()) {
    const open = stagesOpen(stages, notes, 1)
    assert.deepEqual(ladder.map(x => open[x.id]), ladder.map((_, j) => j <= i), s.id)
    assert.equal(suggestedStage(stages, notes), s.id)
    notes = { ...notes, ...notesFor([s.tasks[0].id], s.ielts ? 6 : 4) }
    if (i + 1 < ladder.length) assert.equal(stagesOpen(stages, notes, 1)[ladder[i + 1].id], false, s.id + ' 一題未達標')
    notes = { ...notes, ...notesFor([s.tasks[1].id], s.ielts ? 6 : 4) }
  }
  assert.equal(suggestedStage(stages, notes), 'task2')
  assert.equal(stagesOpen(stages, notes, 1).bridge, false)
})

test('只要有作答紀錄，該階與之前新增的階段保持打開，建議不倒退', () => {
  for (const id of ['sentence', 'paragraph', 'numbers', 'task2']) {
    const at = stages.findIndex(s => s.id === id)
    const notes = { [writingMigrationKey]: '[]', ...notesFor([by(id).tasks[0].id]) }
    const open = stagesOpen(stages, notes, 1)
    assert.ok(stages.slice(0, at + 1).every(s => open[s.id]), id)
    assert.equal(suggestedStage(stages, notes), id)
    if (id !== 'task2') assert.equal(open[stages[at + 1].id], false, '自評紀錄保留該階，不等於通過下一階')
  }
  assert.equal(suggestedStage(stages, { 'write.s1': '{invalid' }), 'basic')
  const bridgeOnly = notesFor([by('bridge').tasks[0].id], 4)
  assert.equal(suggestedStage(stages, bridgeOnly), 'basic')
  assert.equal(stagesOpen(stages, bridgeOnly, 1).bridge, false)
  assert.equal(stagesOpen(stages, bridgeOnly, packUnits[0]).bridge, true)
})

test('舊版 sentence 已過兩題：新增初階與 steps 不鎖回 sentence、paragraph', () => {
  const notes = notesFor(['s1', 's2'], 4)
  const before = { ...notes }
  const open = stagesOpen(stages, notes, 1)
  for (const id of ['basic', 'longer', 'negq', 'yesterday', 'sentence', 'steps', 'paragraph']) assert.equal(open[id], true, id)
  assert.equal(open.opinion, false)
  assert.equal(suggestedStage(stages, notes), 'paragraph')
  assert.deepEqual(notes, before, '讀取不修改舊紀錄')
  for (const best of [undefined, 3]) {
    const attempted = notesFor(['s1'], best)
    assert.equal(stagesOpen(stages, attempted, 1).sentence, true)
    assert.equal(stagesOpen(stages, attempted, 1).paragraph, false, '尚未開過的階段不憑空算過')
    assert.equal(suggestedStage(stages, attempted), 'sentence')
  }
})

test('舊版更後面的已解鎖階段也保留；一次性匯入不改任何原作答資料', () => {
  const old = createInitialState('2026-11-24')
  delete old.notes[writingMigrationKey]
  Object.assign(old.notes, notesFor(['s1', 's2', 'p1', 'p2', 'm1', 'm2'], 4))
  const original = { ...old.notes }
  const upgraded = importBackup(JSON.stringify(old))
  for (const [key, value] of Object.entries(original)) assert.equal(upgraded.notes[key], value, key)
  assert.deepEqual(JSON.parse(upgraded.notes[writingMigrationKey]), ['sentence', 'paragraph', 'multi', 'task1'])
  assert.equal(stagesOpen(stages, upgraded.notes, 1).task1, true)
  assert.equal(suggestedStage(stages, upgraded.notes), 'task1')
  assert.deepEqual(importBackup(exportBackup(upgraded)), upgraded, '再次開啟或還原不重做遷移')
  upgraded.notes[writeKey('b1')] = record(4)
  assert.equal(suggestedStage(stages, upgraded.notes), 'task1', '回頭補基礎也不把建議往前拉')
  assert.equal(stagesOpen(stages, upgraded.notes, 1).task1, true)
  assert.deepEqual(readWrite(upgraded.notes, 's1'), JSON.parse(original['write.s1']))
  assert.equal(migrateWritingProgress(stages, upgraded.notes), upgraded.notes, '已遷移時不改 notes')
})
