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

test('Claude 回答前會先想，想的部分也算在回覆上限裡：上限留得夠，回覆被切斷或拒答時說清楚，半截的回覆不會被當成答案', async () => {
  const { askTutor, ClaudeIncomplete } = await import('../src/lib/tutor.ts')
  const storage = new Map<string, string>([['dream-blueprint.claude-key', 'sk-ant-test']])
  Object.assign(globalThis, { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } })
  const sent: { max_tokens: number }[] = []
  let reply: unknown = {}
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    sent.push(JSON.parse(init?.body ?? '{}'))
    return { ok: true, status: 200, statusText: 'OK', json: async () => reply }
  }) as unknown as typeof fetch
  const ask = () => askTutor('批改', [{ role: 'user', content: '我的翻譯：Are you OK? where pain? Is this your patient' }])

  // The thinking comes first (its text is empty by default); only the text blocks are the answer.
  reply = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '', signature: 'abc' }, { type: 'text', text: '{"verdict":"good"}' }] }
  assert.equal(await ask(), '{"verdict":"good"}')
  assert.ok(sent[0].max_tokens >= 8000, '上限 ' + sent[0].max_tokens + ' 太小：Claude 想的部分就會用掉大半，批改只寫到一半')

  // Cut off at the limit: the half-written reply (稽核截圖那種「Is this」停住的) is not handed on as if it were the answer.
  reply = { stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"verdict":"again","note":"第三句文法沒錯，但我不確定你的意思：「Is this' }] }
  await assert.rejects(ask(), (e: Error) => e instanceof ClaudeIncomplete && /沒寫完/.test(e.message) && /這一次不算/.test(e.message) && !e.message.includes('Is this'))

  // Declined by the safety check: no text at all, said plainly.
  reply = { stop_reason: 'refusal', content: [] }
  await assert.rejects(ask(), (e: Error) => e instanceof ClaudeIncomplete && /沒有回答/.test(e.message))

  // A finished reply is still taken as it is, also from a mock without stop_reason.
  reply = { content: [{ type: 'text', text: '好～' }] }
  assert.equal(await ask(), '好～')
})
