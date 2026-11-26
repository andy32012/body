import test from 'node:test'
import assert from 'node:assert/strict'
import { checkApplies, checkSequence } from '../src/lib/checks.ts'

test('較慢回來的舊批改不算：換到別段、又按了一次批改，舊的回覆都丟掉（稽核 LIT-01）', () => {
  const box = checkSequence()
  const a = box.start()
  const b = box.start()
  assert.equal(box.isCurrent(a), false, '又按了一次：前一次的回覆不算')
  assert.equal(box.isCurrent(b), true)
  box.close()
  assert.equal(box.isCurrent(b), false, '框框離開畫面（換到別段）以後回來的也不算')
})

test('批改只算它批的那一段、那一版答案：批完改了答案或換段，要再批一次（稽核 LIT-01）', () => {
  const judged = { id: 'p-1', answer: 'I like apples.' }
  assert.equal(checkApplies(judged, 'p-1', 'I like apples.  '), true)
  assert.equal(checkApplies(judged, 'p-1', ''), false, '批完把答案刪光')
  assert.equal(checkApplies(judged, 'p-1', 'Something else.'), false, '批完改成別的')
  assert.equal(checkApplies(judged, 'p-2', 'I like apples.'), false, '別段')
  assert.equal(checkApplies(undefined, 'p-1', 'I like apples.'), false)
})
