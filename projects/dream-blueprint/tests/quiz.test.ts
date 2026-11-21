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
