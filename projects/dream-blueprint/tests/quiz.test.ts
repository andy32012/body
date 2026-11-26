import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceQuiz, nextQuizItem, quizSummary, readQuizRecord, recordQuizAnswer, recordQuizCause, type QuizItem } from '../src/lib/quiz.ts'
import { addSayCard, fixToCard, readSayCard, sayCardSentence } from '../src/lib/sayCards.ts'

const q = (id: string, kind: string): QuizItem => ({ id, kind, en: id, zh: id, options: ['a', 'b', 'c'], answerIndex: 1, explanation: '' })
const items = [q('e1', 'vocabulary'), q('e2', 'vocabulary'), q('n1', 'nursing'), q('n2', 'nursing')]

test('英文和護理分開，各自記住做到第幾題', () => {
  let notes: Record<string, string> = {}
  assert.equal(nextQuizItem(items, 'english', notes, '2026-11-21')?.item.id, 'e1')
  assert.equal(nextQuizItem(items, 'nursing', notes, '2026-11-21')?.item.id, 'n1')
  notes = advanceQuiz(notes, 'nursing')
  assert.equal(nextQuizItem(items, 'nursing', notes, '2026-11-21')?.item.id, 'n2')
  assert.equal(nextQuizItem(items, 'english', notes, '2026-11-21')?.item.id, 'e1')
})
test('答錯的題目會記下原因，隔一天先回來；重做答對就離開待重做', () => {
  let notes = recordQuizAnswer({}, items[2], 0, '2026-11-21', true)
  notes = advanceQuiz(notes, 'nursing')
  notes = recordQuizCause(notes, 'n1', '看不懂英文')
  const rec = readQuizRecord(notes, 'n1')
  assert.deepEqual([rec?.correct, rec?.misses, rec?.zh, rec?.causes], [false, 1, true, ['看不懂英文']])
  assert.equal(nextQuizItem(items, 'nursing', notes, '2026-11-21')?.retry, false)
  const back = nextQuizItem(items, 'nursing', notes, '2026-11-22')
  assert.deepEqual([back?.item.id, back?.retry], ['n1', true])
  notes = recordQuizAnswer(notes, items[2], 1, '2026-11-22')
  assert.equal(nextQuizItem(items, 'nursing', notes, '2026-11-23')?.item.id, 'n2')
  const sum = quizSummary(items, 'nursing', notes)
  assert.deepEqual([sum.answered, sum.wrongNow, sum.topCause?.cause], [1, 0, '看不懂英文'])
})
test('批改的錯誤變成整句複習卡；同一句英文不會重複加入', () => {
  const card = fixToCard({ wrong: 'I go yesterday', right: 'I went yesterday', why: '過去式', zh: '我昨天去了。', en: 'I went there yesterday.' })
  assert.equal(card?.zh, '我昨天去了。')
  assert.equal(fixToCard({ wrong: 'he go', right: 'he goes', why: '' })?.zh, '把這段英文改對：he go')
  assert.equal(fixToCard({ wrong: '', right: '', why: '' }), null)
  let state = { notes: {} as Record<string, string>, cards: [] as never[] }
  state = addSayCard(state, card!, '2026-11-21')
  state = addSayCard(state, { ...card!, en: 'i went there yesterday' }, '2026-11-21')
  assert.equal(state.cards.length, 1)
  const [key, value] = Object.entries(state.notes)[0]
  const sentence = sayCardSentence(key.slice(4), readSayCard(value)!)
  assert.deepEqual(sentence.grammar, ['短文錯句'])
  assert.match(sentence.why, /你在短文裡寫成：I go yesterday/)
})

test('國考科目頁按「練這科」：只出那一科的護理英文題，不動整個題庫的順序', async () => {
  const { nextSubjectQuiz, quizPosKey, recordQuizAnswer } = await import('../src/lib/quiz.ts')
  const data = (await import('../src/data/quiz.json')).default as (import('../src/lib/quiz.ts').QuizItem & { subjects?: string[] })[]
  const exam = (await import('../src/data/exam-subjects.json')).default
  for (const s of exam.subjects) {
    const mine = data.filter(q => q.kind === 'nursing' && q.subjects?.includes(s.name))
    if (!mine.length) { assert.equal(nextSubjectQuiz(data, s.name, {}, '2026-11-26'), null); continue }
    let notes: Record<string, string> = {}
    const seen = new Set<string>()
    for (let i = 0; i < mine.length; i++) {
      const next = nextSubjectQuiz(data, s.name, notes, '2026-11-26')!
      assert.ok(next.item.subjects?.includes(s.name), s.name + ' 出的是這一科的題目')
      seen.add(next.item.id)
      notes = recordQuizAnswer(notes, next.item, next.item.answerIndex, '2026-11-26', false)
    }
    assert.equal(seen.size, mine.length, s.name + ' 每一題都會出到')
    assert.equal(notes[quizPosKey('nursing')], undefined, '全部題庫的進度不動')
  }
})

test('練一科：同一天做完一輪就說今天做完了，不會一直回到第一題；上面的題數也是這一科的（稽核 D-01、D-02）', async () => {
  const { nextSubjectQuiz, quizSummary, recordQuizAnswer, subjectDoneToday, subjectQuizzes } = await import('../src/lib/quiz.ts')
  const bank = (await import('../src/data/quiz.json', { with: { type: 'json' } })).default as Parameters<typeof subjectQuizzes>[0]
  const subject = bank.find(q => q.subjects?.length)?.subjects?.[0]
  assert.ok(subject)
  const list = subjectQuizzes(bank, subject!)
  let notes: Record<string, string> = {}
  const today = '2026-11-26'
  const seen: string[] = []
  for (let i = 0; i < list.length + 3; i++) {
    const next = nextSubjectQuiz(bank, subject!, notes, today)
    if (!next) break
    seen.push(next.item.id)
    notes = recordQuizAnswer(notes, next.item, i === 0 ? (next.item.answerIndex + 1) % next.item.options.length : next.item.answerIndex, today, false)
  }
  assert.deepEqual(seen, list.map(q => q.id), '每題一次，照順序，不重複')
  assert.equal(subjectDoneToday(bank, subject!, notes, today), true)
  const s = quizSummary(bank, 'nursing', notes, subject)
  assert.equal(s.total, list.length, '題數是這一科的')
  assert.equal(s.answered, list.length)
  assert.equal(s.wrongNow, 1)
  // Tomorrow: the wrong one first, then the rest in order (not the first one again and again).
  const tomorrow = '2026-11-27'
  const first = nextSubjectQuiz(bank, subject!, notes, tomorrow)!
  assert.equal(first.retry, true)
  notes = recordQuizAnswer(notes, first.item, first.item.answerIndex, tomorrow, false)
  const second = nextSubjectQuiz(bank, subject!, notes, tomorrow)!
  assert.equal(second.item.id, list[1].id)
  notes = recordQuizAnswer(notes, second.item, second.item.answerIndex, tomorrow, false)
  assert.equal(nextSubjectQuiz(bank, subject!, notes, tomorrow)?.item.id, list[2]?.id)
})
