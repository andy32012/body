import test from 'node:test'
import assert from 'node:assert/strict'
import { nextPassage, redoDue, redoKey, doneKey, type Passage } from '../src/lib/passages.ts'

const p = (n: number): Passage => ({ id: 'L1-A0' + n, level: 1, letter: 'A', n, zh: '第' + n + '段' })
const all = [p(1), p(2), p(3)]

test('按了「不會」的短文隔一天才回來，而且排在新的前面', () => {
  const notes = { [redoKey('L1-A01')]: '2026-11-20' }
  assert.equal(redoDue(notes, 'L1-A01', '2026-11-20'), false)
  assert.equal(nextPassage(all, 1, {}, notes, [], '', '2026-11-20')?.id, 'L1-A02')
  assert.equal(redoDue(notes, 'L1-A01', '2026-11-21'), true)
  assert.equal(nextPassage(all, 1, { [doneKey('L1-A02')]: true }, notes, [], '', '2026-11-21')?.id, 'L1-A01')
})
test('舊的「1」標記當作已經到期；全部做完只剩重做時還是會給', () => {
  assert.equal(redoDue({ [redoKey('L1-A03')]: '1' }, 'L1-A03', '2026-11-21'), true)
  const checks = { [doneKey('L1-A01')]: true, [doneKey('L1-A02')]: true }
  const notes = { [redoKey('L1-A03')]: '2026-11-21' }
  assert.equal(nextPassage(all, 1, checks, notes, [], '', '2026-11-21')?.id, 'L1-A03')
})
