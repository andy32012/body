import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lessonFinished, markLessonStep, promptFor, readLessonRecord, variationsFor, type Lesson } from '../src/lib/lesson.ts'
import { matchesReference } from '../src/lib/evidence.ts'

const lessons = JSON.parse(readFileSync(new URL('../src/data/lessons.json', import.meta.url), 'utf8')) as Lesson[]
const curriculum = JSON.parse(readFileSync(new URL('../src/data/curriculum.json', import.meta.url), 'utf8'))

test('每個單元（47 個主線＋B1→B2 橋接）都有今天這一堂的內容：目標、對話、兩題聽力、十句換個說法、每天一題開放題', () => {
  assert.equal(lessons.length, curriculum.units.length)
  assert.ok(lessons.length >= 53, '47 個主線單元加上至少 6 個橋接單元')
  for (const l of lessons) {
    const unit = curriculum.units.find((u: { id: number }) => u.id === l.unit)
    assert.equal(unit.cando, l.cando, '單元 ' + l.unit + ' 的目標要和課表一致')
    assert.ok(l.dialogue.length >= 4 && l.dialogue.every(d => d.en && d.zh && d.who), '單元 ' + l.unit + ' 對話')
    assert.equal(l.questions.length, 2)
    for (const q of l.questions) assert.ok(q.options.length === 3 && q.answer >= 0 && q.answer < 3, '單元 ' + l.unit + ' 題目')
    assert.equal(l.variations.length, 10, '單元 ' + l.unit + '：第 1–5 天每天兩句')
    assert.equal(l.prompts.length, 5, '單元 ' + l.unit + '：第 1–5 天每天一題')
    for (const p of l.prompts) assert.ok(p.en && p.zh && p.sample, '單元 ' + l.unit + ' 開放題')
  }
  assert.ok(lessons[43].prompts[0].chart?.points.length, '第 44 課（描述數字的變化）要有圖表題')
  assert.deepEqual(lessons[44].prompts[0].scaffold?.length, 4, '第 45 課（表達意見）要有意見＋理由＋例子＋結論的骨架')
})
test('一堂課的步驟會記下來；換天或換課就重新開始', () => {
  let notes = markLessonStep({}, '2026-11-21', 1, 1, 'listen')
  notes = markLessonStep(notes, '2026-11-21', 1, 1, 'pattern')
  notes = markLessonStep(notes, '2026-11-21', 1, 1, 'pattern')
  assert.deepEqual(readLessonRecord(notes, '2026-11-21')?.steps, ['listen', 'pattern'])
  assert.equal(lessonFinished(notes, '2026-11-21'), false)
  notes = markLessonStep(notes, '2026-11-21', 1, 1, 'done', { corrected: true })
  assert.equal(lessonFinished(notes, '2026-11-21'), true)
  notes = markLessonStep(notes, '2026-11-21', 1, 2, 'listen')
  assert.deepEqual(readLessonRecord(notes, '2026-11-21')?.steps, ['listen'])
  // 第 1 天是前兩句，第 2 天接下來兩句……一週五天十句，不會重複。
  assert.deepEqual(variationsFor(lessons[0], 1), lessons[0].variations.slice(0, 2))
  assert.deepEqual(variationsFor(lessons[0], 2), lessons[0].variations.slice(2, 4))
  assert.deepEqual(variationsFor(lessons[0], 5), lessons[0].variations.slice(8, 10))
  assert.equal(new Set([1, 2, 3, 4, 5].flatMap(d => variationsFor(lessons[0], d))).size, 10)
  assert.equal(promptFor(lessons[0], 1), lessons[0].prompts[0])
  assert.equal(promptFor(lessons[0], 4), lessons[0].prompts[3])
})

test('換個說法：一個單元的十句都不一樣，也不跟這單元的每日句、小關卡、備用句重複；表達題每天不同', () => {
  const zh = (t: string) => t.replace(/[，。？！、\s]/g, '')
  for (const l of lessons) {
    const unit = curriculum.units.find((u: { id: number }) => u.id === l.unit)
    const taken = [...unit.days, ...unit.checkpoint, ...unit.backup] as { zh: string; reference: string[] }[]
    assert.equal(new Set(l.variations.map(v => zh(v.zh))).size, 10, '單元 ' + l.unit + ' 中文重複')
    assert.equal(new Set(l.variations.map(v => v.en.toLowerCase())).size, 10, '單元 ' + l.unit + ' 英文重複')
    for (const v of l.variations) {
      assert.ok(!taken.some(s => zh(s.zh) === zh(v.zh)), '單元 ' + l.unit + '「' + v.zh + '」已經是這單元的句子')
      assert.ok(!taken.some(s => [v.en, ...(v.alt ?? [])].some(a => matchesReference(a, s.reference))), '單元 ' + l.unit + ' ' + v.en + ' 已經是這單元的答案')
      assert.ok(/[.?!]$/.test(v.en), v.en)
      for (const a of v.alt ?? []) assert.ok(matchesReference(a, [v.en, ...(v.alt ?? [])]), a)
    }
    assert.equal(new Set(l.prompts.map(p => p.en)).size, 5, '單元 ' + l.unit + ' 表達題重複')
  }
})

test('Emma 的課堂模式：用今天上過的那一課，帶最近的錯句', async () => {
  const { emmaLesson, emmaLessonInstructions } = await import('../src/lib/emmaLesson.ts')
  const notes = {
    'lesson.2026-11-21': JSON.stringify({ unit: 1, day: 1, steps: ['done'] }),
    'say.say-a1': JSON.stringify({ zh: '舊的', en: 'Old one.' }),
    'say.say-b2': JSON.stringify({ zh: '新的', en: 'I am at home.', wrong: 'I at home' }),
  }
  const l = emmaLesson({ notes, curriculum: { unit: 1, day: 2 } }, '2026-11-21')
  assert.deepEqual([l?.unit, l?.day], [1, 1])
  assert.equal(l?.mistakes[0], '"I at home" → "I am at home."')
  assert.match(emmaLessonInstructions(l!, 'Introduce yourself.'), /fix at most one or two things/)
  const noLesson = emmaLesson({ notes: {}, curriculum: { unit: 3, day: 4 } }, '2026-11-21')
  assert.deepEqual([noLesson?.unit, noLesson?.day], [3, 4])
})

test('單字意思現代化：常見字不再出現奇怪的舊義', () => {
  const levels = JSON.parse(readFileSync(new URL('../src/data/levels.json', import.meta.url), 'utf8')) as { en: string; zh: string }[]
  const zh = (en: string) => levels.find(w => w.en === en)?.zh
  assert.equal(zh('apple'), '蘋果')
  assert.equal(zh('commute'), '通勤')
  assert.match(zh('monitor') ?? '', /監測/)
  assert.match(zh('appoint(ment)') ?? '', /預約/)
  assert.equal(zh('exercise'), '運動、練習')
  assert.ok(!levels.some(w => /傢伙/.test(w.zh) && w.en === 'apple'))
})

test('單字四種能力：分開記錄，拼字接受 / 和 () 的寫法', async () => {
  const { markSkill, readSkills, skillSummary, spellingMatches, orderForSkill } = await import('../src/lib/wordSkills.ts')
  let notes = markSkill({}, 'nurse', 'read', '2026-11-21')
  notes = markSkill(notes, 'nurse', 'listen', '2026-11-21')
  notes = markSkill(notes, 'cough', 'read', '2026-11-21')
  assert.deepEqual(readSkills(notes, 'nurse'), { read: '2026-11-21', listen: '2026-11-21' })
  assert.deepEqual(skillSummary(notes, ['nurse', 'cough', 'fever']), { read: 2, listen: 1, say: 0, write: 0 })
  // 說出還沒有錄音核對：按「我說對了」記成自評（sayself），不是確認過的 say；舊的 say 也算自評。
  const said = markSkill(notes, 'fever', 'say', '2026-11-22')
  assert.deepEqual(readSkills(said, 'fever'), { sayself: '2026-11-22' })
  assert.equal(skillSummary(said, ['fever']).say, 1)
  assert.equal(skillSummary({ 'skill.cough': JSON.stringify({ say: '2026-11-01' }) }, ['cough']).say, 1)
  assert.deepEqual(orderForSkill(['nurse', 'cough'], w => w, notes, 'listen'), ['cough', 'nurse'])
  assert.ok(spellingMatches(' Actress ', 'actor/actress'))
  assert.ok(spellingMatches('agreement', 'agree(ment)') && spellingMatches('agree', 'agree(ment)'))
  assert.ok(!spellingMatches('agre', 'agree(ment)'))
})

test('臨床情境：四步、記錄錯的原因，錯過的之後再出現', async () => {
  const { nextScenario, saveCase, causeSummary, readCase } = await import('../src/lib/scenarios.ts')
  const all = JSON.parse(readFileSync(new URL('../src/data/scenarios.json', import.meta.url), 'utf8'))
  assert.ok(all.length >= 8)
  for (const c of all) assert.deepEqual(c.steps.map((s: { kind: string }) => s.kind), ['cues', 'problem', 'action', 'evaluate'])
  let notes: Record<string, string> = {}
  assert.equal(nextScenario(all, notes).id, all[0].id)
  notes = saveCase(notes, all[0].id, '2026-11-20', [{ kind: 'cues', correct: false, cause: '看不懂英文' }, { kind: 'problem', correct: true }], true)
  assert.equal(nextScenario(all, notes).id, all[1].id)
  for (const c of all.slice(1)) notes = saveCase(notes, c.id, '2026-11-21', [{ kind: 'cues', correct: true }], false)
  assert.equal(nextScenario(all, notes).id, all[0].id, '全做過以後，先回到答錯的')
  assert.equal(readCase(notes, all[0].id)?.usedZh, true)
  assert.deepEqual(causeSummary(all, notes).count, { '看不懂英文': 1 })
})

test('上到一半的課：關掉再開、隔天回來都接得回原本的步驟', async () => {
  const { updateLesson, activeLesson, resumeTarget, resumePhase, moveLesson, lessonKey, activeKey, sentenceFrame } = await import('../src/lib/lesson.ts')
  let notes = updateLesson({}, '2026-11-21', 1, 2, { phase: 'write', hints: { 'u1-d2': { h: 3, r: true } } }, 'listen')
  assert.equal(notes[activeKey], '2026-11-21')
  assert.equal(resumePhase(activeLesson(notes)!.rec), 'write')
  // Core not saved: continues only while the curriculum still points at it.
  assert.ok(resumeTarget(notes, { unit: 1, day: 2 }, '2026-11-22'))
  assert.equal(resumeTarget(notes, { unit: 1, day: 3 }, '2026-11-22'), null)
  // Core saved: same day continues at 表達; later only when asked.
  notes = updateLesson(notes, '2026-11-21', 1, 2, { phase: 'express' }, 'pattern')
  assert.equal(resumePhase(activeLesson(notes)!.rec), 'express')
  assert.ok(resumeTarget(notes, { unit: 1, day: 3 }, '2026-11-21'))
  assert.equal(resumeTarget(notes, { unit: 1, day: 3 }, '2026-11-22'), null)
  assert.ok(resumeTarget(notes, { unit: 1, day: 3 }, '2026-11-22', true))
  const moved = moveLesson(notes, '2026-11-21', '2026-11-22')
  assert.equal(moved.date, '2026-11-22')
  assert.ok(moved.notes[lessonKey('2026-11-22')] && !moved.notes[lessonKey('2026-11-21')])
  assert.equal(JSON.parse(moved.notes[lessonKey('2026-11-22')]).hints['u1-d2'].h, 3, '提示紀錄跟著走，不會變回沒看過')
  const done = updateLesson(moved.notes, '2026-11-22', 1, 2, {}, 'done')
  assert.equal(done[activeKey], undefined)
  assert.equal(sentenceFrame('I am a nursing student.'), 'I a_ a n______ s______.')
})

test('學對記對：多堂沒做完都找得到、提示不會忘、重送不等於改好', async () => {
  const { updateLesson, pendingLessons, resumeTarget, moveLesson, readHints, writeHint, issuesFixed, lessonKey } = await import('../src/lib/lesson.ts')
  // Two earlier lessons with 表達 left; a third lesson started today moves the active pointer.
  let notes = updateLesson({}, '2026-11-18', 3, 1, {}, 'pattern')
  notes = updateLesson(notes, '2026-11-19', 3, 2, {}, 'pattern')
  notes = updateLesson(notes, '2026-11-21', 3, 3, {}, 'listen')
  notes = { ...notes, 'lesson.heard.3': '{"day":"2026-11-21"}', 'lesson.active': '2026-11-21' }
  assert.deepEqual(pendingLessons(notes).map(p => p.date), ['2026-11-19', '2026-11-18'])
  assert.equal(resumeTarget(notes, { unit: 3, day: 3 }, '2026-11-21', true, '2026-11-18')?.rec.day, 1)
  // Today already has its own lesson, so the old one is not copied over it.
  const kept = moveLesson(notes, '2026-11-18', '2026-11-21')
  assert.equal(kept.date, '2026-11-18')
  assert.equal(JSON.parse(kept.notes[lessonKey('2026-11-21')]).day, 3)
  // Hints outside the guided lesson.
  let n2 = writeHint({}, '2026-11-21', 'u3-c1', { h: 2, r: true })
  n2 = writeHint(n2, '2026-11-21', 'u3-c2', { h: 1, r: false })
  assert.equal(readHints(n2, '2026-11-21')['u3-c1'].h, 2)
  assert.deepEqual(readHints({ 'hints.2026-11-21': 'oops' }, '2026-11-21'), {})
  // Retried vs fixed.
  const prev = { verdict: 'small' as const, corrected: '', fixes: [{ wrong: 'go', right: 'went', why: '' }, { wrong: 'a', right: 'an', why: '' }] }
  assert.equal(issuesFixed({ verdict: 'small', corrected: '', fixes: [{ wrong: 'x', right: 'y', why: '' }], resolved: [0], still: [1] }, prev), false)
  assert.equal(issuesFixed({ verdict: 'small', corrected: '', fixes: [{ wrong: 'x', right: 'y', why: '' }], resolved: [0, 1], still: [] }, prev), true)
  assert.equal(issuesFixed({ verdict: 'good', corrected: '', fixes: [] }, prev), true)
  assert.equal(issuesFixed({ verdict: 'small', corrected: '', fixes: [{ wrong: 'x', right: 'y', why: '' }] }, prev), false, '沒有逐項判斷就不算改好')
})

test('護理英文清單只算護理題，或做完一個情境', async () => {
  const { answeredOn } = await import('../src/lib/quiz.ts')
  const { casesFinishedOn } = await import('../src/lib/scenarios.ts')
  const rec = (day: string) => JSON.stringify({ day, picked: 0, correct: true, tries: 1, misses: 0 })
  const notes = { 'quiz.ans.q-001': rec('2026-11-21'), 'quiz.ans.n-1': rec('2026-11-21'), 'quiz.ans.n-2': rec('2026-11-20'),
    'case.c1': JSON.stringify({ day: '2026-11-21', results: [1, 2, 3, 4].map(() => ({ kind: 'cues', correct: true })), tries: 1 }),
    'case.c2': JSON.stringify({ day: '2026-11-21', results: [{ kind: 'cues', correct: true }], tries: 1 }) }
  assert.equal(answeredOn(notes, '2026-11-21'), 2)
  assert.equal(answeredOn(notes, '2026-11-21', new Set(['n-1', 'n-2'])), 1)
  assert.equal(casesFinishedOn(notes, '2026-11-21'), 1)
})

test('Claude 跟著現在的題目；中文拆解的格式不對就不用', async () => {
  const { taskPrompt } = await import('../src/lib/taskContext.ts')
  const { parseDiagnosis } = await import('../src/lib/diagnosis.ts')
  assert.equal(taskPrompt(null), '')
  const p = taskPrompt({ label: '中翻英：我很累。', detail: '參考答案：I am tired.', draft: 'I tired' })
  assert.ok(p.includes('中翻英：我很累。') && p.includes('「I tired」') && p.includes('不要直接給整句答案'))
  assert.ok(taskPrompt({ label: 'x', detail: 'y', draft: '  ' }).includes('還沒開始寫'))
  const ok = parseDiagnosis('好的 {"questionZh":"護理師應該先做什麼？","optionsZh":["讓他睡","測血糖","給胰島素"],"words":[{"en":"first","zh":"首先"},{"en":3}],"why":["a","b","c"]}', 3)
  assert.equal(ok?.optionsZh[1], '測血糖')
  assert.equal(ok?.words.length, 1)
  assert.equal(parseDiagnosis('{"questionZh":"x","optionsZh":["a"]}', 3), null, '選項數量要對得上')
  assert.equal(parseDiagnosis('not json', 3), null)
})

test('閱讀和寫作：建議程度、過關條件、批改格式', async () => {
  const { suggestedLevel, nextReading, saveRead, readSummary, passed } = await import('../src/lib/reading.ts')
  const { default: reading } = await import('../src/data/reading.json', { with: { type: 'json' } })
  const all = reading as Parameters<typeof suggestedLevel>[0]
  for (const p of all) for (const q of p.qs) {
    assert.ok(q.answer >= 0 && q.answer < q.options.length, p.id)
    if (q.evidence) assert.ok(p.paras.join(' ').includes(q.evidence), p.id + ' 證據要在文章裡')
  }
  let notes: Record<string, string> = {}
  assert.equal(suggestedLevel(all, notes), 'A1')
  const a1 = all.filter(p => p.level === 'A1')
  for (const p of a1.slice(0, 3)) notes = saveRead(notes, p.id, { day: '2026-11-21', picks: p.qs.map(q => q.answer), correct: p.qs.length, total: p.qs.length })
  assert.equal(suggestedLevel(all, notes), 'A1', '篇數多的級別，過關三篇還不往上')
  assert.equal(nextReading(all, 'A1', notes)?.id, a1[3].id, '先讀沒讀過的')
  let many = notes
  for (const p of a1.slice(0, 12)) many = saveRead(many, p.id, { day: '2026-11-21', picks: p.qs.map(q => q.answer), correct: p.qs.length, total: p.qs.length })
  assert.equal(suggestedLevel(all, many), 'A2', '十五篇裡過關十二篇（八成）才往上')
  const { levelTarget } = await import('../src/lib/reading.ts')
  assert.deepEqual([1, 4, 5, 8, 15].map(levelTarget), [1, 3, 3, 7, 12], '五篇以下的級別維持三篇')
  notes = saveRead(notes, a1[3].id, { day: '2026-11-21', picks: [9, 9, 9, 9], correct: 0, total: 4, causes: { 0: '單字不認得' }, zh: true })
  assert.equal(passed({ day: '', picks: [], correct: 4, total: 4, zh: true, tries: 1 }), false, '看過中文不算過關')
  assert.equal(readSummary(all, notes).topCause, '單字不認得')
  const { parseFeedback, wordCount, taskDone, suggestedStage, readWrite, selfChecked } = await import('../src/lib/writing.ts')
  assert.equal(wordCount("I'm a nurse. It's 3 o'clock."), 6)
  // 範文要示範怎麼達標：每一篇都至少到題目要求的字數，Task 2 也有範文。
  const { default: w } = await import('../src/data/writing.json', { with: { type: 'json' } })
  for (const st of w.stages) for (const t of st.tasks) assert.ok(wordCount(t.sample) >= t.min, t.id + ' 範文 ' + wordCount(t.sample) + ' 字，少於 ' + t.min)
  const f = parseFeedback('{"criteria":[{"score":6,"comment":"ok"},{"score":5.5}],"band":6,"next":"加總覽","fixes":[{"wrong":"a","right":"b","why":"c"},{"x":1}]}', ['A', 'B'], true)
  assert.equal(f?.criteria[1].name, 'B'); assert.equal(f?.criteria[1].score, 5.5); assert.equal(f?.fixes.length, 1); assert.equal(f?.band, 6)
  // 項目要對得上這一階的評分項目：同名兩次、不認得的名字都不算；順序亂了照名字放回去。
  const ielts = ['Task Response：回答所有部分', 'Coherence & Cohesion：段落分明', 'Lexical Resource：用字', 'Grammatical Range & Accuracy：句型']
  const four = (names: string[], scores: number[], band: number) => JSON.stringify({ criteria: names.map((name, i) => ({ name, score: scores[i], comment: '' })), band, next: '' })
  assert.equal(parseFeedback(four(['X', 'X', 'X', 'X'], [6, 6, 6, 6], 6), ielts, true), null)
  assert.equal(parseFeedback(four(['Task Response', 'Task Response', 'Lexical Resource', 'Grammatical Range & Accuracy'], [6, 6, 6, 6], 6), ielts, true), null)
  const moved = parseFeedback(four(['Lexical Resource', 'Task Response', 'Coherence and Cohesion', 'Grammatical Range & Accuracy'], [5, 7, 6, 6], 6), ielts, true)
  assert.deepEqual(moved?.criteria.map(c => c.score), [7, 6, 5, 6])
  assert.equal(moved?.criteria[0].name, ielts[0])
  // band 要跟四項平均差不多：四項都 4 卻給 8 不算。
  assert.equal(parseFeedback(four(ielts, [4, 4, 4, 4], 8), ielts, true), null)
  assert.equal(parseFeedback(four(ielts, [6, 6, 5.5, 6], 6), ielts, true)?.band, 6)
  // 前幾階是 1–5 的整數，3.5 不算。
  assert.equal(parseFeedback('{"criteria":[{"score":3.5},{"score":4}]}', ['A', 'B']), null)
  assert.equal(parseFeedback('{"criteria":[{"name":"主題句","score":4},{"name":"文法正確","score":3}]}', ['主題句：第一句說出整段要講什麼', '文法正確（主詞動詞、時態）'])?.criteria[1].score, 3)
  assert.equal(parseFeedback('nope', ['A']), null)
  // 不合法的分數一律算評估失敗：band 99、缺 band、分數是字串、少一項、不是 .5 的倍數。
  assert.equal(parseFeedback('{"criteria":[{"score":6},{"score":6}],"band":99}', ['A', 'B'], true), null)
  assert.equal(parseFeedback('{"criteria":[{"score":6},{"score":6}]}', ['A', 'B'], true), null)
  assert.equal(parseFeedback('{"criteria":[{"score":6},{"score":"5.5"}],"band":6}', ['A', 'B'], true), null)
  assert.equal(parseFeedback('{"criteria":[{"score":6}],"band":6}', ['A', 'B'], true), null)
  assert.equal(parseFeedback('{"criteria":[{"score":6.3},{"score":6}],"band":6}', ['A', 'B'], true), null)
  // 前面幾階是 1–5 分，不給雅思分數。
  assert.equal(parseFeedback('{"criteria":[{"score":4},{"score":5}],"band":7}', ['A', 'B'])?.band, undefined)
  assert.equal(parseFeedback('{"criteria":[{"score":4},{"score":7}]}', ['A', 'B']), null)
  assert.equal(taskDone({ day: '', words: 0, tries: 1, best: 5 }, true), false)
  assert.equal(taskDone({ day: '', words: 0, tries: 1, best: 4 }, false), true)
  // 自己打勾是自評完成，不算過關；舊紀錄裡不可能的分數讀進來就丟掉。
  assert.equal(taskDone({ day: '', words: 0, tries: 0, self: 1 }, false), false)
  assert.equal(selfChecked({ day: '', words: 0, tries: 0, self: 1 }), true)
  assert.equal(readWrite({ 'write.t1a': JSON.stringify({ day: '', words: 0, tries: 1, best: 99 }) }, 't1a')?.best, undefined)
  assert.equal(taskDone({ day: '', words: 0, tries: 1, best: 7 }, false), false, '1–5 分的階段，7 分是壞紀錄')
  assert.equal(readWrite({ 'write.s1': JSON.stringify({ day: '', words: 0, tries: 1, last: { criteria: 'oops' } }) }, 's1')?.last, undefined)
  // Task 2 三種題目各有自己的結構：問題＋解決方法題不用表態。
  const { essayKind, criteriaFor } = await import('../src/lib/writing.ts')
  const t2 = (w.stages as Parameters<typeof suggestedStage>[0]).find(s => s.id === 'task2')!
  assert.deepEqual(t2.tasks.map(t => essayKind(t.prompt)), ['discuss', 'problem', 'extent'])
  const t2b = criteriaFor(t2, t2.tasks[1])[0]
  assert.match(t2b, /問題和解決方法/)
  assert.doesNotMatch(t2b, /立場/)
  assert.equal(wordCount('Résumé café 37.5 well-known'), 4)
  const { default: writing } = await import('../src/data/writing.json', { with: { type: 'json' } })
  assert.equal(suggestedStage(writing.stages as Parameters<typeof suggestedStage>[0], {}), 'sentence')
})

test('配對 QR：要對的配對碼、10 分鐘內才打得開', async () => {
  const { seal, open, randomCode } = await import('../src/lib/pairing.ts')
  const code = randomCode()
  assert.match(code, /^\d{6}$/)
  const t = 1_800_000_000_000
  const p = await seal({ claude: 'sk-ant-test', model: 'claude-sonnet-5-5' }, code, t)
  assert.ok(!p.includes('sk-ant'), '連結裡看不到金鑰')
  const ok = await open(p, code, t + 60_000)
  assert.ok(ok.ok && ok.keys.claude === 'sk-ant-test' && ok.keys.model === 'claude-sonnet-5-5')
  const wrong = await open(p, code === '000000' ? '111111' : '000000', t)
  assert.deepEqual(wrong, { ok: false, reason: 'code' })
  assert.deepEqual(await open(p, code, t + 11 * 60_000), { ok: false, reason: 'expired' })
  assert.deepEqual(await open('garbage!!', code, t), { ok: false, reason: 'broken' })
})

test('單元小關卡那天算上完今天的課：清單打勾，生活主題不會排在同一天', async () => {
  const { mainLessonDone, courseMovedOn, updateLesson } = await import('../src/lib/lesson.ts')
  const { dueTopic } = await import('../src/lib/topics.ts')
  const day = '2026-11-28'
  const checkpoint = { id: 'x', day, energy: 'normal', advanced: true, sentenceId: 'u1-c3' }
  const before = { notes: {}, curriculum: { unit: 2 }, sessions: [] as typeof checkpoint[] }
  assert.equal(dueTopic(before, day)?.topic.id, 't1', '上完單元 1，隔天起輪到生活主題 1')
  const after = { ...before, sessions: [checkpoint] }
  assert.equal(courseMovedOn(after.sessions, day), true)
  assert.equal(mainLessonDone(after, day), true, '小關卡沒有課堂紀錄，也算今天的課上完了')
  assert.equal(dueTopic(after, day), null, '同一天只排一堂')
  assert.equal(dueTopic(after, '2026-11-30')?.topic.id, 't1', '下一個上課日才輪到生活主題')
  // A guided lesson whose last step is still open is not done yet.
  const open = { notes: updateLesson({}, day, 1, 2, {}, 'pattern'), sessions: [{ id: 'y', day, energy: 'normal', advanced: true, sentenceId: 'u1-d2' }] }
  assert.equal(mainLessonDone(open, day), false)
  assert.equal(mainLessonDone({ ...open, notes: updateLesson(open.notes, day, 1, 2, {}, 'done') }, day), true)
  assert.equal(mainLessonDone({ notes: {}, sessions: [{ id: 'library-' + day, day, energy: 'low', advanced: false, sentenceId: '' }] }, day), false, '只在練習頁加練不算')
})
