import test from 'node:test'
import assert from 'node:assert/strict'
import { nextPassage, passageRound, redoDue, redoKey, doneKey, type Passage } from '../src/lib/passages.ts'

const p = (n: number): Passage => ({ id: 'L1-A0' + n, level: 1, letter: 'A', n, zh: '第' + n + '段' })
const all = [p(1), p(2), p(3)]

test('按了「不會」的短文隔一天才回來，而且排在新的前面', () => {
  const notes = { [redoKey('L1-A01')]: '2026-11-20' }
  assert.equal(redoDue(notes, 'L1-A01', '2026-11-20'), false)
  assert.equal(nextPassage(all, 1, {}, notes, [], '', '2026-11-20')?.id, 'L1-A02')
  assert.equal(redoDue(notes, 'L1-A01', '2026-11-21'), true)
  assert.equal(nextPassage(all, 1, { [doneKey('L1-A02')]: true }, notes, [], '', '2026-11-21')?.id, 'L1-A01')
})
test('舊的「1」標記當作已經到期；今天按了「不會」的，就算只剩它也等到明天（按鈕寫的是明天再來）', () => {
  assert.equal(redoDue({ [redoKey('L1-A03')]: '1' }, 'L1-A03', '2026-11-21'), true)
  const checks = { [doneKey('L1-A01')]: true, [doneKey('L1-A02')]: true }
  const notes = { [redoKey('L1-A03')]: '2026-11-21' }
  assert.equal(nextPassage(all, 1, checks, notes, [], '', '2026-11-21'), undefined)
  assert.deepEqual(passageRound(all, 1, checks, notes, [], '', '2026-11-21'), { left: 1, skipped: 0, waiting: 1 }, '畫面說明天再出現，不是「都做完了」')
  assert.equal(nextPassage(all, 1, checks, notes, [], '', '2026-11-22')?.id, 'L1-A03', '隔天就回來')
  // Only passed over with 換一段: not "all done", and the skipped ones can be brought back.
  assert.deepEqual(passageRound(all, 1, {}, {}, ['L1-A01', 'L1-A02', 'L1-A03']), { left: 3, skipped: 3, waiting: 0 })
  assert.deepEqual(passageRound(all, 1, { [doneKey('L1-A01')]: true, [doneKey('L1-A02')]: true, [doneKey('L1-A03')]: true }, {}), { left: 0, skipped: 0, waiting: 0 })
})

test('短文單字提示：每一個都指到文章裡真的出現的字，用的是這一段的意思', async () => {
  const { default: passages } = await import('../src/data/passages.json', { with: { type: 'json' } })
  let n = 0
  for (const p of passages as { id: string; en?: string; words?: { en: string; zh: string; form?: string }[] }[]) {
    for (const w of p.words ?? []) {
      n++
      assert.ok(w.form, p.id + ' ' + w.en + ' 沒有標出文章裡的字')
      assert.match(p.en ?? '', new RegExp('(?<![A-Za-z])' + w.form!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z])', 'i'), p.id + '：' + w.form + ' 不在文章裡')
      assert.ok(w.zh.trim(), p.id + ' ' + w.en + ' 沒有中文')
    }
  }
  assert.ok(n > 5000)
  const find = (id: string, en: string) => (passages as { id: string; words?: { en: string; zh: string; form?: string }[] }[]).find(p => p.id === id)!.words!.find(w => w.en === en)
  // 查核時指出的例子：照句子選意思，不是照字表最常見的意思。
  assert.equal(find('L1-A05', 'be')?.form, 'am')
  assert.match(find('L1-A05', 'be')!.zh, /be 動詞/)
  assert.equal(find('L1-E07', 'even')?.zh, '偶數的')
  assert.equal(find('L2-S19', 'see')?.form, 'saw')
  assert.match(find('L5-B10', 'bound')!.zh, /跳躍/)
  assert.match(find('L3-I05', 'ivory')!.zh, /乳白色/)
  assert.equal(find('L6-L07', 'lofty')?.zh, '高聳的')
  assert.equal(find('L4-G08', 'grammatical')?.zh, '合乎文法的')
  assert.equal(find('L1-P09', 'play')?.zh, '彈奏（樂器）')
  // 文章只有 card、wind/window，就不能列 car、win。
  assert.equal(find('L1-C01', 'car'), undefined)
  assert.equal(find('L1-W02', 'win'), undefined)
})
