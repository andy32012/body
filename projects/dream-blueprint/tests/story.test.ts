import test from 'node:test'
import assert from 'node:assert/strict'
import passageData from '../src/data/passages.json' with { type: 'json' }
import reading from '../src/data/reading.json' with { type: 'json' }
import type { Passage } from '../src/lib/passages.ts'
import { doneKey } from '../src/lib/passages.ts'
import { baseForms, dictationScore, dictationTotal, lookupWord, meaningQuestions, nextStory, readStory, saveStory, splitSentences, storyOrder, storyProgress } from '../src/lib/story.ts'
import { logSkill, practisedOn } from '../src/lib/bridge.ts'
import { plainReadCount, QUESTION_PASSAGES, type ReadPassage } from '../src/lib/reading.ts'
import { wordCount } from '../src/lib/writing.ts'

const all = passageData as Passage[]

test('短文切句：每一段都切得出句子，接起來等於原文，稱謂和縮寫不會被切開', () => {
  for (const p of all) {
    const parts = splitSentences(p.en ?? '')
    assert.ok(parts.length >= 2, p.id + ' 至少兩句')
    assert.equal(parts.join(' '), (p.en ?? '').trim().replace(/\s+/g, ' '), p.id + ' 接起來等於原文')
    for (const s of parts) {
      assert.ok(/[.!?]["”’']?$/.test(s), p.id + ' 每句以句尾標點結束：' + s)
      assert.ok(!/^(Mr|Mrs|Ms|Dr)\.$/.test(s), p.id + ' 稱謂不能自己一句')
      assert.ok(s.split(/\s+/).length <= 60, p.id + ' 一句不超過 60 個字（聽寫用）：' + s)
    }
  }
  assert.deepEqual(splitSentences('Dr. Lin is here. He said, "Wait." Then he left at 9 a.m. today!'),
    ['Dr. Lin is here.', 'He said, "Wait."', 'Then he left at 9 a.m. today!'])
})

test('短文讀聽的順序：翻譯過的先出，其他的從這一級最後一段往前，和中翻英的順序相反', () => {
  const level1 = all.filter(p => p.level === 1)
  const first = level1[0], last = level1[level1.length - 1]
  assert.equal(nextStory(all, 1, {}, {}, 'read')?.id, last.id, '沒翻譯過任何一段時，從最後一段開始')
  const checks = { [doneKey(first.id)]: true }
  assert.equal(nextStory(all, 1, checks, {}, 'read')?.id, first.id, '翻譯過的那一段先讀')
  let notes = saveStory({}, first.id, { r: '2026-11-23', q: [2, 3] })
  assert.deepEqual(readStory(notes, first.id), { r: '2026-11-23', q: [2, 3] })
  assert.equal(nextStory(all, 1, checks, notes, 'read')?.id, last.id, '讀過的不再排最前面')
  assert.equal(nextStory(all, 1, checks, notes, 'listen')?.id, first.id, '聽力的進度和閱讀分開算')
  assert.equal(nextStory(all, 1, checks, notes, 'dictate')?.id, first.id, '聽寫先出讀過或聽過的')
  assert.equal(nextStory(all, 1, checks, notes, 'read', [last.id])?.id, level1[level1.length - 2].id, '換一段會跳過')
  notes = saveStory(notes, first.id, { l: '2026-11-24', u: 2 })
  assert.deepEqual(readStory(notes, first.id), { r: '2026-11-23', q: [2, 3], l: '2026-11-24', u: 2 }, '同一段的閱讀和聽力紀錄並存')
  assert.deepEqual(storyProgress(all, 1, notes, 'read'), { done: 1, total: level1.length })
  assert.equal(storyOrder(all, 1, {}, {}, 'read').length, level1.length)
  assert.ok(!Object.keys(notes).some(k => k.startsWith('read.')), '短文紀錄不能用 read. 開頭，不然會被當成閱讀理解的紀錄')
})

test('點字查意思：先用這一段自己的意思，再查字表；變化形會找回原形', () => {
  const p = all[0]
  const hint = p.words![0]
  const found = lookupWord((hint.form ?? hint.en) + ',', p)
  assert.deepEqual(found && [found.en, found.zh, found.from], [hint.en, hint.zh, 'passage'])
  assert.equal(lookupWord('Walked', { words: [] })?.en, 'walk')
  assert.equal(lookupWord('studies', { words: [] })?.en, 'study')
  assert.equal(lookupWord('running', { words: [] })?.en, 'run')
  assert.equal(lookupWord('took', { words: [] })?.en, 'take')
  assert.equal(lookupWord('bigger', { words: [] })?.en, 'big')
  assert.ok(lookupWord('went', { words: [] })?.zh.includes('去'))
  assert.equal(lookupWord('left', { words: [] })?.from, 'table')
  assert.ok(lookupWord('left', { words: [] })!.zh.includes('leave'), 'left 同時提醒可能是 leave 的變化形')
  assert.equal(lookupWord('Xyzzyq', { words: [] }), null, '字表沒有的字查不到')
  assert.equal(lookupWord('2026', { words: [] }), null)
  assert.ok(baseForms('stopped').includes('stop') && baseForms('making').includes('make') && baseForms('easier').includes('easy'))
})

test('讀完考字義：只考沒查過的字，選項三個、答案在裡面，同一段每次出一樣的題', () => {
  let asked = 0
  for (const p of all.filter((_, i) => i % 37 === 0)) {
    const qs = meaningQuestions(p, all, new Set())
    assert.deepEqual(meaningQuestions(p, all, new Set()), qs, p.id + ' 題目固定')
    assert.ok(qs.length <= 3)
    for (const q of qs) {
      asked++
      assert.equal(q.options.length, 3, p.id + ' 三個選項')
      assert.equal(new Set(q.options).size, 3, p.id + ' 選項不重複')
      assert.equal(q.options[q.answer], q.zh, p.id + ' 答案對得上')
      assert.ok(p.words!.some(w => (w.form ?? w.en) === q.form), p.id + ' 考的是這段的字')
    }
  }
  assert.ok(asked > 50, '大部分段落出得了題')
  const p = all[0]
  const every = new Set(p.words!.flatMap(w => [(w.form ?? w.en).toLowerCase(), w.en.toLowerCase()]))
  assert.deepEqual(meaningQuestions(p, all, every), [], '全部查過就不考')
  const one = (p.words![0].form ?? p.words![0].en).toLowerCase()
  assert.ok(meaningQuestions(p, all, new Set([one]), 20).every(q => q.form.toLowerCase() !== one), '查過的字不會被考')
})

test('聽寫對答案：大小寫、標點、縮寫不算錯；少寫和多寫的字分開標出來', () => {
  const s = "I don't have a fever, but I'm tired."
  assert.deepEqual(dictationScore('i do not have a fever but i am tired', s).right, dictationScore(s, s).total)
  const part = dictationScore('I have a fever but tired today', s)
  assert.equal(part.total, 10)
  assert.equal(part.right, 6)
  assert.deepEqual(part.missing, ['do', 'not', 'i', 'am'])
  assert.deepEqual(part.words.filter(w => w.extra).map(w => w.w), ['today'])
  const blank = dictationScore('', s)
  assert.deepEqual([blank.right, blank.total, blank.missing.length], [0, 10, 10], '沒寫就是全部沒寫到')
  assert.deepEqual(dictationTotal([part, blank]), [6, 20])
})

test('短文讀聽算進每天的「聽或讀」：讀完記一天閱讀、整段聽完或聽寫記一天聽力', () => {
  let notes: Record<string, string> = {}
  assert.equal(practisedOn(notes, [], 'read', '2026-11-23'), false)
  notes = logSkill(saveStory(notes, all[0].id, { r: '2026-11-23' }), 'read', '2026-11-23')
  assert.equal(practisedOn(notes, [], 'read', '2026-11-23'), true)
  assert.equal(practisedOn(notes, [], 'listen', '2026-11-23'), false)
  notes = logSkill(saveStory(notes, all[0].id, { d: '2026-11-23', dq: [8, 10] }), 'listen', '2026-11-23')
  assert.equal(practisedOn(notes, [], 'listen', '2026-11-23'), true)
})

test('有題目的一般閱讀（A1–B1）篇數和 QUESTION_PASSAGES 一致，id 用程度開頭', () => {
  const graded = (reading as ReadPassage[]).filter(p => p.level !== 'B2' && !p.unit)
  assert.equal(graded.length, QUESTION_PASSAGES)
  for (const p of graded) assert.ok(p.id.startsWith(p.level.toLowerCase() + '-'), p.id)
  const notes = Object.fromEntries([...graded.slice(0, 3).map(p => ['read.' + p.id, '{}']), ['read.n-a2-falls', '{}'], ['read.br43-r1', '{}'], ['read.b2-telehealth', '{}']])
  assert.equal(plainReadCount(notes), 3, '護理閱讀、單元閱讀和 B2 不算在內')
})

test('閱讀理解：A1、A2 各至少 36 篇，字數標示正確，每題不重複選項，證據句在同一段裡', () => {
  const all = reading as ReadPassage[]
  for (const level of ['A1', 'A2'] as const) assert.ok(all.filter(p => p.level === level && !p.unit).length >= 36, level + ' 三小級各至少 12 篇')
  assert.equal(new Set(all.map(p => p.id)).size, all.length, 'id 不重複')
  for (const p of all.filter(x => x.level === 'A1' || x.level === 'A2')) {
    const count = wordCount(p.paras.join(' '))
    assert.ok(Math.abs(count - p.words) <= 5, p.id + ' 標的字數 ' + p.words + '，實際 ' + count)
    assert.ok(p.level === 'A1' ? count <= 100 : count <= 160, p.id + ' 超過這個級別最長的小級：' + count)
    assert.ok(p.zh.length > 30 && p.title && p.topic, p.id + ' 有標題、主題和中文大意')
    assert.ok(p.qs.length >= 4, p.id + ' 至少四題')
    for (const q of p.qs) {
      assert.equal(new Set(q.options).size, q.options.length, p.id + ' 選項不重複：' + q.q)
      assert.ok(q.why.length > 5, p.id + ' 每題有解說')
      if (q.evidence) assert.ok(p.paras.some(para => para.includes(q.evidence!)), p.id + ' 證據句要在同一段裡才標得出來：' + q.evidence)
    }
  }
})

test('聽寫多寫了字（例如加了 never，意思反過來）不會是滿分；寫錯一個字只算錯一次', async () => {
  const s = 'We recorded the number of penguins at the zoo.'
  const never = dictationScore('We never recorded the number of penguins at the zoo.', s)
  assert.equal(never.total, 9)
  assert.equal(never.extra, 1)
  assert.equal(never.right, 8, '多一個字就不是 9 / 9')
  const swapped = dictationScore('We recorded a number of penguins at the zoo.', s)
  assert.equal(swapped.right, 8, 'the 寫成 a：錯一個字')
  assert.equal(dictationScore("we recorded the number of penguins at the zoo", s).right, 9, '大小寫和標點不算錯')
})

test('聽寫「今天寫到這裡」：這段還不算做完，下次從停下來的那一句接著寫；最後一句寫完才算整段', async () => {
  const { dictationPatch } = await import('../src/lib/story.ts')
  const day = '2026-11-26'
  const stop = dictationPatch({}, 0, [{ right: 5, total: 6 }, { right: 4, total: 4 }], true, day)
  assert.deepEqual(stop, { dn: 2, dqp: [9, 10] })
  assert.equal(stop.d, undefined, '還沒做完')
  const notes = saveStory({}, 'p1', stop)
  const done = dictationPatch(readStory(notes, 'p1'), 2, [{ right: 3, total: 5 }], false, '2026-11-27')
  const after = readStory(saveStory(notes, 'p1', done), 'p1')
  assert.deepEqual(after, { d: '2026-11-27', dq: [12, 15] }, '三句都寫完才算，字數加起來')
  // Next time on the dictation tab, the passage stopped halfway comes back first.
  const all = (passageData as Passage[]).filter(p => p.level === 1 && p.en)
  const half = all[5]
  const n = saveStory({}, half.id, stop)
  assert.equal(nextStory(all, 1, {}, n, 'dictate')?.id, half.id)
})

test('短文聽力沒播完（播放失敗）：可以看文字學，但不算聽過、不算進聽力進度', () => {
  const all = (passageData as Passage[]).filter(p => p.en)
  const p = all.find(x => x.level === 1)!
  const notes = saveStory({}, p.id, { lt: '2026-11-26' })
  assert.equal(storyProgress(all, 1, notes, 'listen').done, 0)
  assert.equal(storyProgress(all, 1, saveStory({}, p.id, { l: '2026-11-26', u: 2 }), 'listen').done, 1)
})

test('點字查意思：不會把字形猜錯（ones 不是 on、caring 不是 car），常用的 could、would、one 沒網路也查得到', () => {
  const en = (w: string) => lookupWord(w, {})?.en
  assert.equal(en('notes'), 'note')
  assert.equal(en('hopes'), 'hope')
  assert.equal(en('bees'), 'bee')
  assert.equal(en('caring'), 'care')
  assert.equal(en('hoping'), 'hope')
  assert.equal(en('hopping'), 'hop', '雙寫子音還是原本那個字')
  assert.equal(en('using'), 'use')
  assert.equal(en('boxes'), 'box')
  assert.equal(en('goes'), 'go')
  assert.notEqual(en('ones'), 'on')
  for (const w of ['could', 'would', 'one', 'two']) assert.ok(lookupWord(w, {})?.zh, w + ' 查得到')
  assert.equal(lookupWord('could', {})?.from, 'extra', '不在字表裡的常用字標清楚，也不會變成單字卡')
  assert.equal(en('drew'), 'draw')
  assert.equal(en('led'), 'lead')
})

test('added、adding 查到 add（加），不是 ad（廣告）；hopping、planned 還是 hop、plan（稽核 LIT-D01）', async () => {
  const { lookupWord } = await import('../src/lib/story.ts')
  const en = (w: string) => lookupWord(w, { words: [] })?.en
  assert.equal(en('added'), 'add')
  assert.equal(en('adding'), 'add')
  assert.equal(en('called'), 'call')
  assert.equal(en('missed'), 'miss')
  assert.equal(en('hopping'), 'hop')
  assert.equal(en('planned'), 'plan')
  assert.equal(en('stopped'), 'stop')
  assert.equal(en('caring'), 'care')
})
