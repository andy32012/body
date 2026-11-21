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
