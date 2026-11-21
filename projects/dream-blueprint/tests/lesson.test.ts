import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lessonFinished, markLessonStep, readLessonRecord, variationFor, type Lesson } from '../src/lib/lesson.ts'

const lessons = JSON.parse(readFileSync(new URL('../src/data/lessons.json', import.meta.url), 'utf8')) as Lesson[]
const curriculum = JSON.parse(readFileSync(new URL('../src/data/curriculum.json', import.meta.url), 'utf8'))

test('42 個單元都有今天這一堂的內容：目標、對話、兩題聽力、兩個變化、開放題', () => {
  assert.equal(lessons.length, 42)
  for (const l of lessons) {
    const unit = curriculum.units.find((u: { id: number }) => u.id === l.unit)
    assert.equal(unit.cando, l.cando, '單元 ' + l.unit + ' 的目標要和課表一致')
    assert.ok(l.dialogue.length >= 4 && l.dialogue.every(d => d.en && d.zh && d.who), '單元 ' + l.unit + ' 對話')
    assert.equal(l.questions.length, 2)
    for (const q of l.questions) assert.ok(q.options.length === 3 && q.answer >= 0 && q.answer < 3, '單元 ' + l.unit + ' 題目')
    assert.equal(l.variations.length, 2)
    assert.ok(l.prompt.en && l.prompt.zh && l.prompt.sample, '單元 ' + l.unit + ' 開放題')
  }
  assert.ok(lessons[38].prompt.chart?.points.length, '第 39 課要有圖表題')
  assert.deepEqual(lessons[39].prompt.scaffold?.length, 4, '第 40 課要有意見＋理由＋例子＋結論的骨架')
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
  assert.equal(variationFor(lessons[0], 1), lessons[0].variations[0])
  assert.equal(variationFor(lessons[0], 2), lessons[0].variations[1])
  assert.equal(variationFor(lessons[0], 3), lessons[0].variations[0])
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
  assert.equal(suggestedLevel(all, notes), 'A2', '三篇過關就往上')
  assert.equal(nextReading(all, 'A1', notes)?.id, a1[3].id, '先讀沒讀過的')
  notes = saveRead(notes, a1[3].id, { day: '2026-11-21', picks: [9, 9, 9, 9], correct: 0, total: 4, causes: { 0: '單字不認得' }, zh: true })
  assert.equal(passed({ day: '', picks: [], correct: 4, total: 4, zh: true, tries: 1 }), false, '看過中文不算過關')
  assert.equal(readSummary(all, notes).topCause, '單字不認得')
  const { parseFeedback, wordCount, taskDone, suggestedStage } = await import('../src/lib/writing.ts')
  assert.equal(wordCount("I'm a nurse. It's 3 o'clock."), 5)
  const f = parseFeedback('{"criteria":[{"name":"TR","score":6,"comment":"ok"},{"score":"5.5"}],"band":6,"next":"加總覽","fixes":[{"wrong":"a","right":"b","why":"c"},{"x":1}]}', ['A', 'B'])
  assert.equal(f?.criteria[1].name, 'B'); assert.equal(f?.criteria[1].score, 5.5); assert.equal(f?.fixes.length, 1)
  assert.equal(parseFeedback('nope', ['A']), null)
  assert.equal(taskDone({ day: '', words: 0, tries: 1, best: 5 }, true), false)
  assert.equal(taskDone({ day: '', words: 0, tries: 1, best: 4 }, false), true)
  const { default: writing } = await import('../src/data/writing.json', { with: { type: 'json' } })
  assert.equal(suggestedStage(writing.stages as Parameters<typeof suggestedStage>[0], {}), 'sentence')
})
