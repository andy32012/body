import test from 'node:test'
import assert from 'node:assert/strict'
import curriculum from '../src/data/curriculum.json'
import { sentenceScoreOf, tutorSystem, verdictOf } from '../src/lib/tutor'

test('tutor prompt carries the sentence, rules and verdict format', () => {
  const s = curriculum.units[0].days[3]
  const prompt = tutorSystem(s, [])
  assert.ok(prompt.includes(s.zh))
  assert.ok(prompt.includes(s.reference[0]))
  assert.ok(prompt.includes('不要先給答案'))
  assert.ok(prompt.includes('判定：對了'))
})

test('verdict line is read from the reply', () => {
  assert.equal(verdictOf('很好\n判定：對了'), 'good')
  assert.equal(verdictOf('判定：小錯'), 'small')
  assert.equal(verdictOf('判定： 再試一次'), 'again')
  assert.equal(verdictOf('沒有判定'), null)
})

test('中翻英也照全民英檢初級單句寫作給 0–2 分：得分那一行讀得出來', () => {
  const prompt = tutorSystem(curriculum.units[0].days[3], [])
  assert.ok(prompt.includes('全民英檢初級寫作・單句寫作'))
  assert.ok(prompt.includes('2＝完全正確，沒有錯。'))
  assert.ok(prompt.includes('得分：0、1 或 2'))
  assert.equal(sentenceScoreOf('很好！\n得分：2\n判定：對了'), 2)
  assert.equal(sentenceScoreOf('得分: 0\n判定：再試一次'), 0)
  assert.equal(sentenceScoreOf('得分：1.5'), null, '不是表上的分數')
  assert.equal(sentenceScoreOf('判定：小錯'), null)
})


test('在「問 Claude」那格打改好的英文句子，算是再寫一次（會批改、可以往下一步）；真的問題照樣是問題', async () => {
  const { looksLikeTry, tutorSystem } = await import('../src/lib/tutor.ts')
  const refs = ['Is he your classmate?']
  assert.equal(looksLikeTry('Is he your classmate?', 'Is he is your classmate?', refs), true)
  assert.equal(looksLikeTry('為什麼不用 being？', 'Is he is your classmate?', refs), false)
  assert.equal(looksLikeTry('why not use being here', 'Is he is your classmate?', refs), false)
  assert.equal(looksLikeTry('ok', 'Is he is your classmate?', refs), false)
  const sys = tutorSystem({ id: 'u1-d3', zh: '你餓了嗎？', reference: ['Are you hungry?'], grammar: [], hints: [], why: '', newWords: [] }, [])
  assert.match(sys, /不要自己出下一句/)
})
