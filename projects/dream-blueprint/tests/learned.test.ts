import test from 'node:test'
import assert from 'node:assert/strict'
import curriculum from '../src/data/curriculum.json'
import { createInitialState } from '../src/lib/store'
import { learnedFor } from '../src/lib/learned'
import { tutorSystem } from '../src/lib/tutor'
import { markAssisted } from '../src/lib/grammarRetention'
import { topicKey } from '../src/lib/topics'

const unit = (id: number) => curriculum.units.find(u => u.id === id)!

test('a new learner: nothing passed yet, but the current unit and the next ones are named', () => {
  const state = createInitialState('2026-11-24')
  const s = unit(1).days[0]
  const ctx = learnedFor(state, s)
  assert.deepEqual(ctx.learned, [])
  assert.equal(ctx.current, unit(1).title)
  assert.ok(ctx.notYet.includes(unit(2).title))
  const prompt = tutorSystem(s, ctx)
  assert.ok(prompt.includes('還沒有（這是他的第一個單元）'))
  assert.ok(prompt.includes('正在上（今天已經教過，算學過）：' + unit(1).title))
})

test('with progress the tutor gets the passed units, not an empty list', () => {
  const state = createInitialState('2026-11-24')
  state.curriculum = { unit: 6, day: 2, retry: 0, stableUnits: [1, 2, 3] }
  state.notes = markAssisted(state.notes, 4, '2026-11-20')
  const s = unit(6).days[1]
  const ctx = learnedFor(state, s)
  assert.deepEqual(ctx.learned, [1, 2, 3, 4, 5].map(id => unit(id).title))
  assert.deepEqual(ctx.shaky, [unit(4).title])
  assert.equal(ctx.current, unit(6).title)
  assert.ok(!ctx.learned.includes(unit(7).title))
  assert.ok(ctx.notYet.includes(unit(7).title))
  const prompt = tutorSystem(s, ctx)
  for (const id of [1, 2, 3, 4, 5]) assert.ok(prompt.includes(unit(id).title), 'missing unit ' + id)
  assert.ok(prompt.includes('還不穩的：' + unit(4).title))
})

test('only what this sentence needs: words of this sentence, not the whole word list', () => {
  const state = createInitialState('2026-11-24')
  state.curriculum = { unit: 3, day: 1, retry: 0, stableUnits: [] }
  state.knownWords = ['hospital', 'zebra', 'banana']
  const s = { id: 'x', reference: ['The nurse is at the hospital.'], newWords: [] }
  const ctx = learnedFor(state, s)
  assert.ok(ctx.knownWords.includes('nurse'), 'nurse is taught in unit 1')
  assert.ok(ctx.knownWords.includes('hospital'))
  assert.ok(!ctx.knownWords.includes('zebra'), 'words outside this sentence stay out')
  assert.ok(!ctx.knownWords.includes('the') && !ctx.unknownWords.includes('the'), 'grammar words are not vocabulary')
})

test('words never met are flagged so the tutor teaches them instead of marking them wrong', () => {
  const state = createInitialState('2026-11-24')
  const s = { id: 'x', reference: ['She is a cardiologist.'], newWords: [] }
  assert.ok(learnedFor(state, s).unknownWords.includes('cardiologist'))
  const taught = { ...s, newWords: [{ en: 'cardiologist' }] }
  assert.ok(!learnedFor(state, taught).unknownWords.includes('cardiologist'), "today's new words are already listed separately")
})

test('finished life topics add the grammar they taught', () => {
  const state = createInitialState('2026-11-24')
  state.curriculum = { unit: 3, day: 1, retry: 0, stableUnits: [] }
  state.notes = { ...state.notes, [topicKey('t1')]: JSON.stringify({ done: { A: '2026-11-20', B: '2026-11-21' } }) }
  const ctx = learnedFor(state, unit(3).days[0])
  assert.equal(ctx.topicGrammar.length, 1)
})

test('the old call with a plain list still works', () => {
  const s = unit(1).days[0]
  assert.ok(tutorSystem(s, []).includes(s.zh))
  assert.ok(tutorSystem(s, ['be 動詞現在式']).includes('他已經過關的單元：be 動詞現在式'))
})
