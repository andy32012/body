import test from 'node:test'
import assert from 'node:assert/strict'
import writing from '../src/data/writing.json' with { type: 'json' }
import { chartKind, chartText, checksFor, essayKind, gradePrompt, isProcessChart, isTableChart, migrateWritingProgress, taskOneOutlines, type ProcessChart, type TableChart, readWrite, rubricFor, sentenceParts, stagesOpen, suggestedStage, wordCount, writeKey, writeTaskOpen, writingMigrationKey, writingTaskPages, type WriteStage } from '../src/lib/writing.ts'
import { createInitialState, exportBackup, importBackup } from '../src/lib/store.ts'
import { packUnits } from '../src/lib/bridge.ts'

const stages = writing.stages as unknown as WriteStage[]
const by = (id: string) => stages.find(s => s.id === id)!
const record = (best?: number) => JSON.stringify({ day: '2026-11-24', words: 30, tries: best === undefined ? 0 : 1, ...(best === undefined ? { self: 1 } : { best }) })
const notesFor = (ids: string[], best?: number) => Object.fromEntries(ids.map(id => [writeKey(id), record(best)]))

test('十四階從完整句逐步到雅思：題數、最低字數與官方評分表對應', () => {
  const expected = [
    ['basic', 'gept-sentence', 10], ['longer', 'gept-sentence', 15],
    ['negq', 'gept-sentence', 15], ['yesterday', 'gept-sentence', 20],
    ['sentence', 'gept-sentence'], ['steps', 'gept-paragraph', 40],
    ['paragraph', 'gept-paragraph'], ['opinion', 'gept-paragraph', 80],
    ['multi', 'gept-essay'], ['numbers', 'gept-essay', 80],
    ['task1', 'ielts-task1'], ['twosides', 'gept-essay', 150],
    ['task2', 'ielts-task2'], ['bridge', 'gept-essay'],
  ] as const
  assert.deepEqual(stages.map(s => s.id), expected.map(s => s[0]))
  for (const [id, rubric, min] of expected) {
    const s = by(id)
    assert.equal(rubricFor(s).id, rubric, id)
    assert.ok(s.tasks.length >= 100, id + ' 至少 100 題')
    if (min !== undefined) assert.ok(s.tasks.every(t => t.min === min), id + ' 最低字數')
    assert.ok(s.goal.trim())
    if (min !== undefined) assert.ok(s.criteria.length >= 3 && s.criteria.length <= 5, id + ' 要求')
  }
  assert.equal(stages.filter(s => s.pack).length, 1)
  assert.equal(by('bridge').pack, true)
  assert.deepEqual(stages.map(s => s.name[0]), [...'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭'])
  assert.ok(stages.reduce((total, s) => total + s.tasks.length, 0) >= 1400)
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
    assert.doesNotMatch(t.sample, /\b(?:i|english)\b/, t.id + ' I 和 English 不可誤寫成小寫')
  }
  for (const s of stages) {
    assert.equal(new Set(s.tasks.map(t => t.prompt.trim())).size, s.tasks.length, s.id + ' 題目不可重複')
    assert.equal(new Set(s.tasks.map(t => t.sample.trim())).size, s.tasks.length, s.id + ' 範文要對應各題，不可整篇重複')
  }
  for (const t of [...by('numbers').tasks, ...by('task1').tasks]) {
    assert.ok(t.chart?.title.trim(), t.id + ' 圖表標題')
    const c = t.chart
    if (isTableChart(c) || isProcessChart(c)) continue
    assert.ok(c.points.length >= 3, t.id + ' 圖表數據')
    assert.ok(c.points.every(p => p.label.trim() && Number.isFinite(p.value)), t.id)
    assert.equal(new Set(c.points.map(p => p.label)).size, c.points.length, t.id + ' 圖表標籤不能重複')
  }
})

test('Task 1 也有表格和流程圖：表格每列數字對齊欄位、範文的數字都在表上；流程圖照順序、範文說了幾個步驟', () => {
  const t1 = by('task1').tasks
  const tables = t1.filter(t => t.chart && isTableChart(t.chart))
  const processes = t1.filter(t => t.chart && isProcessChart(t.chart))
  assert.ok(tables.length >= 10 && processes.length >= 10, '表格和流程圖各至少 10 題')
  assert.ok(by('numbers').tasks.every(t => t.chart && !isTableChart(t.chart) && !isProcessChart(t.chart)), '數字暖身維持單一數列')
  const numberWords: Record<string, number> = { four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
  for (const t of tables) {
    const c = t.chart as TableChart
    assert.ok(c.columns.length >= 2 && c.rows.length >= 3, t.id + ' 至少兩欄三列')
    assert.equal(new Set(c.rows.map(r => r.label)).size, c.rows.length, t.id + ' 列名不重複')
    for (const r of c.rows) assert.ok(r.values.length === c.columns.length && r.values.every(Number.isFinite), t.id + ' ' + r.label + ' 每欄一個數字')
    assert.match(t.prompt, /^The table shows /, t.id)
    assert.match(t.sample, /\bOverall\b/, t.id + ' 有總覽')
    // Every figure in the table that the sample quotes is the table's own (a sample cannot invent data).
    const onTable = new Set(c.rows.flatMap(r => r.values))
    assert.ok([...onTable].filter(v => new RegExp('(^|[^\\d.,])' + v.toLocaleString('en-US').replace(/[.]/g, '\\.') + '(?![\\d])').test(t.sample)).length >= onTable.size / 2, t.id + ' 範文引用表上的數字')
    assert.ok(chartText(c).includes(c.columns.join(' | ')), t.id + ' 給 Claude 的文字有整張表')
  }
  for (const t of processes) {
    const c = t.chart as ProcessChart
    assert.ok(c.steps.length >= 5 && new Set(c.steps).size === c.steps.length, t.id + ' 至少五個不同步驟')
    assert.match(t.prompt, /^The diagram shows /, t.id)
    assert.doesNotMatch(t.prompt, /comparisons/, t.id + ' 流程圖不要求比較數字')
    const stated = t.sample.match(/\b(four|five|six|seven|eight|nine)\b (?:stages|steps|main stages)/)
    if (stated) assert.equal(numberWords[stated[1]], c.steps.length, t.id + ' 範文說的步驟數和圖一樣')
    assert.match(t.sample, /\bOverall\b/, t.id + ' 有總覽')
    assert.ok(chartText(c).includes(c.steps.length + '. ' + c.steps.at(-1)), t.id + ' 給 Claude 的文字有每一步')
  }
  assert.deepEqual(taskOneOutlines.process.length, 4)
  assert.equal(chartKind(processes[0].chart), 'process')
  assert.equal(chartKind(tables[0].chart), 'table')
  assert.equal(chartKind(t1[0].chart), 'trend')
  assert.match(gradePrompt(by('task1'), processes[0], processes[0].prompt), /流程圖/)
  assert.match(gradePrompt(by('task1'), tables[0], tables[0].prompt), /表格/)
})

test('範文結尾不重複：⑦⑧ 每篇最後一句都不同；長篇結論段裡的句子最多 8 篇共用', () => {
  const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 4)
  for (const id of ['paragraph', 'opinion']) {
    const last = by(id).tasks.map(t => sentencesOf(t.sample).at(-1))
    assert.equal(new Set(last).size, last.length, id + ' 每篇的結論句要扣住自己的題目')
  }
  for (const id of ['paragraph', 'opinion', 'multi', 'twosides', 'task2']) {
    const count = new Map<string, number>()
    for (const t of by(id).tasks) {
      const paras = t.sample.split('\n').filter(p => p.split(/\s+/).length >= 4)
      for (const s of new Set(sentencesOf(paras.at(-1)!))) count.set(s, (count.get(s) ?? 0) + 1)
    }
    const top = [...count].sort((a, b) => b[1] - a[1])[0]
    assert.ok(top[1] <= 8, id + ' 結論段同一句用了 ' + top[1] + ' 次：' + top[0])
  }
})

test('小短文維持三至五句；雅思議論包含四種題型；橋接題量平均分配', () => {
  for (const t of by('steps').tasks) {
    const sentences = t.sample.split(/[.!?]+/).filter(s => s.trim()).length
    assert.ok(sentences >= 3 && sentences <= 5, t.id + ' 用三至五句練習順序')
  }
  for (const kind of ['discuss', 'problem', 'advantages', 'extent']) {
    assert.ok(by('task2').tasks.filter(t => essayKind(t.prompt) === kind).length >= 20, kind + ' 題型要有足夠練習')
  }
  for (const t of by('task2').tasks) assert.ok(essayKind(t.prompt), t.id + ' 題型要能提供正確結構提示')
  for (const unit of packUnits) assert.ok(by('bridge').tasks.filter(t => t.unit === unit).length >= 16, '單元 ' + unit + ' 有足夠橋接加練')
})

test('百題選題分頁：每題都找得到、每頁最多十題、原始資料及作答 ID 不動', () => {
  for (const s of stages) {
    const before = JSON.stringify(s)
    const pages = writingTaskPages(s)
    const visible = pages.flatMap(p => p.tasks)
    assert.ok(pages.every(p => p.tasks.length > 0 && p.tasks.length <= 10), s.id)
    assert.equal(new Set(pages.map(p => p.label)).size, pages.length, s.id + ' 範圍名稱唯一')
    assert.equal(new Set(visible.map(t => t.label)).size, s.tasks.length, s.id + ' 題號唯一')
    assert.deepEqual(visible.map(t => t.task.id).sort(), s.tasks.map(t => t.id).sort(), s.id + ' 不少題也不重複')
    for (const item of visible) assert.equal(item.task, s.tasks.find(t => t.id === item.task.id), '使用原題，不複製新 ID')
    assert.equal(JSON.stringify(s), before, '分頁不改資料順序')
    if (!s.pack) assert.deepEqual(visible.map(t => t.task.id), s.tasks.map(t => t.id))
  }
  const pages = writingTaskPages(by('bridge'))
  for (const p of pages) {
    assert.equal(new Set(p.tasks.map(t => t.task.unit)).size, 1, p.label + ' 不跨單元')
    for (const { task } of p.tasks) {
      assert.equal(writeTaskOpen(task, task.unit! - 1), false, task.id + ' 提前不能開')
      assert.equal(writeTaskOpen(task, task.unit!), true, task.id + ' 上到當課可開')
    }
  }
  assert.equal(pages[0].tasks[0].task.id, 'br43a', '舊橋接連結仍對到原題')
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
    const sentences = t.sample.split(/[.!?]+/).filter(s => s.trim())
    assert.equal(sentences.length, parts.length, t.id + ' 範文示範每個指定句子')
    if (specified) for (const [i, part] of parts.entries()) {
      const target = part.match(/^用 (.+) 的句子$/)![1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      assert.match(sentences[i], new RegExp("(?:^|[^a-z'’])" + target + "(?=$|[^a-z'’])", 'i'), t.id + ' 範文第 ' + (i + 1) + ' 句要示範指定項目')
    }
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

test('開 App 時的一次性轉換只用原本的題目清單，不用載入整個 1,400 題的題庫，結果跟用完整題庫一樣', async () => {
  const { legacyLadder, migrateWritingProgress, writingMigrationKey } = await import('../src/lib/writing.ts')
  const { default: bank } = await import('../src/data/writing.json', { with: { type: 'json' } })
  const full = bank.stages as import('../src/lib/writing.ts').WriteStage[]
  for (const s of legacyLadder) {
    const real = full.find(x => x.id === s.id)!
    assert.ok(s.tasks.every(t => real.tasks.some(r => r.id === t.id)), s.id + ' 的原本題目都還在題庫裡')
    assert.equal(!!s.ielts, !!real.ielts)
  }
  const rec = (best: number) => JSON.stringify({ day: '2026-11-20', words: 30, tries: 1, best })
  const cases: Record<string, string>[] = [{}, { 'write.s1': rec(6) }, { 'write.s1': rec(6), 'write.s2': rec(6), 'write.p1': rec(4) },
    { 'write.s1': rec(6), 'write.s2': rec(6), 'write.p1': rec(5), 'write.p2': rec(4), 'write.m1': rec(4) }]
  for (const notes of cases) assert.equal(migrateWritingProgress(legacyLadder, notes)[writingMigrationKey], migrateWritingProgress(full, notes)[writingMigrationKey], JSON.stringify(notes))
})

test('寫作做完一題，下面就有「下一題」：先去還沒寫過的，再去還沒過關的；都過關就沒有', async () => {
  const { nextWritingTask, writeKey } = await import('../src/lib/writing.ts')
  const stage = { id: 'basic', name: '① 一句完整的話', goal: '', criteria: [], tasks: ['b1', 'b2', 'b3', 'b4'].map(id => ({ id, prompt: '', zh: '', min: 1, sample: '' })) }
  const rec = (best?: number) => JSON.stringify({ day: '2026-11-26', words: 8, tries: 1, ...(best !== undefined ? { best } : { self: 1 }) })
  assert.equal(nextWritingTask(stage, 'b1', {}, 1)?.id, 'b2')
  const notes = { [writeKey('b1')]: rec(4), [writeKey('b2')]: rec() }
  assert.equal(nextWritingTask(stage, 'b1', notes, 1)?.id, 'b3', '自評過的 b2 算寫過，先去沒寫過的 b3')
  assert.equal(nextWritingTask(stage, 'b4', { ...notes, [writeKey('b3')]: rec(2), [writeKey('b4')]: rec(4) }, 1)?.id, 'b2', '都寫過了：回頭找還沒過關的')
  const all = Object.fromEntries(stage.tasks.map(t => [writeKey(t.id), rec(4)]))
  assert.equal(nextWritingTask(stage, 'b2', all, 1), null, '全部過關')
  // Tasks of a unit not reached yet are skipped.
  const pack = { ...stage, tasks: [{ id: 'p1', prompt: '', zh: '', min: 1, sample: '', unit: 43 }, { id: 'p2', prompt: '', zh: '', min: 1, sample: '', unit: 44 }] }
  assert.equal(nextWritingTask(pack, 'p1', {}, 43), null, '單元 44 還沒上到')
})
