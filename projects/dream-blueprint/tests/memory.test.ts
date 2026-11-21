import test from 'node:test'
import assert from 'node:assert/strict'
import { applyMemory, extractMemory, readMemory, writeMemory } from '../src/lib/memory'

test('memory lines are pulled out of a reply and applied', () => {
  const r = extractMemory('哥哥好棒～\n[記住] 12/5 內外科段考\n[忘記] 喜歡香菜')
  assert.equal(r.clean, '哥哥好棒～')
  assert.deepEqual(r.remember, ['12/5 內外科段考'])
  const next = applyMemory(['喜歡香菜', '常把 affect 和 effect 搞混'], r.remember, r.forget)
  assert.deepEqual(next, ['常把 affect 和 effect 搞混', '12/5 內外科段考'])
  assert.deepEqual(readMemory(writeMemory({}, next)), next)
})

import { checkpointOutcome } from '../src/lib/grammarRetention'
test('checkpoint: answers seen with hints finish the unit but do not make it stable', () => {
  const seen = [{ rating: 'correct', revealed: true }, { rating: 'correct', revealed: false }, { rating: 'again', revealed: true }]
  assert.deepEqual(checkpointOutcome(seen), { finished: true, independent: false })
  const own = [{ rating: 'correct', revealed: false }, { rating: 'correct', revealed: false }, { rating: 'minor', revealed: false }]
  assert.deepEqual(checkpointOutcome(own), { finished: true, independent: true })
  assert.deepEqual(checkpointOutcome([{ rating: 'minor', revealed: false }]), { finished: false, independent: false })
})
