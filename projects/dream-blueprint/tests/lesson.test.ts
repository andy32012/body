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
