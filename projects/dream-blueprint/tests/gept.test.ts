import test from 'node:test'
import assert from 'node:assert/strict'
import { compareReading, missedWords, spokenWords } from '../src/lib/readAloud.ts'
import { answerSeconds, geptLevels, parseGeptFeedback, parsePhotoQuestions, picturePrompt, questionsPrompt, readGept, saveGept } from '../src/lib/gept.ts'
import data from '../src/data/gept-speaking.json' with { type: 'json' }

const words = (t: string) => t.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length

test('朗讀比對：念對的字算聽出來，漏念或聽不出來的字標出來', () => {
  const text = 'My little brother bought a bag of fried chicken.'
  const all = compareReading(text, 'my little brother bought a bag of fried chicken')
  assert.equal(all.heard, all.total)
  assert.equal(all.ratio, 1)
  const some = compareReading(text, 'my little brother bought bag of fry chicken')
  assert.deepEqual(some.marks.filter(m => m.word && !m.heard).map(m => m.text), ['a', 'fried'])
  assert.equal(some.total, 9)
  assert.deepEqual(missedWords(some), ['a', 'fried'])
  assert.equal(compareReading(text, '').heard, 0, '沒聲音就一個字都沒聽到')
})

test('朗讀比對：縮寫、數字、標點、所有格都照念法比', () => {
  assert.deepEqual(spokenWords("I'm"), ['i', 'am'])
  assert.deepEqual(spokenWords('125'), ['one', 'hundred', 'twenty', 'five'])
  assert.deepEqual(spokenWords("Tom's"), ['tom'])
  assert.deepEqual(spokenWords('bike-sharing'), ['bike', 'sharing'])
  const r = compareReading("I'm 8 years old, and it's nine o'clock.", 'I am eight years old and it is 9 o’clock')
  assert.equal(r.heard, r.total)
  assert.ok(r.marks.some(m => !m.word && m.text === ' '), '空白和標點原樣保留在畫面上')
  assert.equal(r.marks.map(m => m.text).join(''), "I'm 8 years old, and it's nine o'clock.")
})

test('英檢口說格式：中級三部分、回答時間 15／30 秒；初級三部分、每題 15 秒；都是 4 級分通過', () => {
  assert.deepEqual(geptLevels.intermediate.parts.map(p => p.name), ['朗讀短文', '回答問題', '看圖敘述'])
  assert.deepEqual(geptLevels.elementary.parts.map(p => p.name), ['複誦', '朗讀句子與短文', '回答問題'])
  assert.deepEqual([0, 4, 5, 9].map(i => answerSeconds('intermediate', i)), [15, 15, 30, 30])
  assert.deepEqual([0, 6].map(i => answerSeconds('elementary', i)), [15, 15])
  assert.match(questionsPrompt('intermediate'), /4 級分通過/)
  assert.match(questionsPrompt('elementary'), /只評「回答問題時的語法和字彙/)
  assert.match(questionsPrompt('intermediate'), /聽不到聲音/)
})

test('英檢口說題組：題數、長度和圖都齊全', async () => {
  const { hasScene } = await import('../src/components/GeptScene.tsx')
  for (const s of data.elementary) {
    assert.equal(s.repeat.length, 5, s.id)
    assert.equal(s.readSentences.length, 5, s.id)
    assert.equal(s.questions.length, 7, s.id)
    assert.ok(words(s.readPassage) >= 50 && words(s.readPassage) <= 90, s.id + ' 短文 ' + words(s.readPassage) + ' 字')
    for (const t of [...s.repeat, ...s.readSentences, ...s.questions]) assert.match(t, /^[A-Z].*[.?!]$/, t)
  }
  for (const s of data.intermediate) {
    assert.equal(s.passages.length, 2, s.id)
    assert.equal(s.questions.length, 10, s.id)
    for (const p of s.passages) assert.ok(words(p) >= 80 && words(p) <= 130, s.id + ' 短文 ' + words(p) + ' 字')
    assert.equal(s.picture.questions.length, 4, s.id)
    assert.ok(hasScene(s.picture.scene), s.picture.scene)
    assert.ok(s.picture.describe.length > 100)
  }
  const ids = [...data.elementary, ...data.intermediate].map(s => s.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('Claude 的英檢回饋：分數、每題、好的、要改的、修正卡（最多三張）', () => {
  const fb = parseGeptFeedback([
    '[分數] 3.5 ||| 大致有回答，但時態常錯。',
    '[題] 1 ||| 回答得好，可以多說一句原因。',
    '[題] 2 ||| 可以說 Could I borrow your notebook?',
    '[好] 第 6 題講了自己的例子。',
    '[改] 過去的事要用過去式。',
    '[卡] I go to Tainan last week ||| I went to Tainan last week. ||| 我上週去台南。 ||| 上週要用過去式 ||| 過去式（不規則動詞）',
    '[卡] a ||| b ||| c ||| d',
    '[卡] e ||| f ||| g ||| h',
    '[卡] i ||| j ||| k ||| l',
  ].join('\n'))
  assert.equal(fb.score, 3.5)
  assert.equal(fb.items.length, 2)
  assert.match(fb.good, /例子/)
  assert.match(fb.fix, /過去式/)
  assert.equal(fb.cards.length, 3)
  assert.equal(fb.cards[0].tag, '過去式（不規則動詞）')
  assert.equal(parseGeptFeedback('[分數] 9 ||| 亂寫').score, undefined, '超過 5 分不收')
  assert.equal(parseGeptFeedback('[分數] 4').score, 4)
})

test('自己的照片：Claude 出四個提示問題和一段描述；看圖評分會帶描述', () => {
  const r = parsePhotoQuestions('[問] Where are these people?\n[問] What are they doing?\n[描述] Two students are eating noodles.\n其他')
  assert.deepEqual(r.questions, ['Where are these people?', 'What are they doing?'])
  assert.equal(r.describe, 'Two students are eating noodles.')
  assert.match(picturePrompt({ describe: 'A park.', questions: ['Where?'] }), /圖片內容：A park\./)
})

test('練習紀錄：每一回記日期和分數', () => {
  let notes: Record<string, string> = {}
  notes = saveGept(notes, 'intermediate', 'i1', { d: '2026-11-24', q: 3.5 })
  notes = saveGept(notes, 'intermediate', 'i1', { p: 4 })
  assert.deepEqual(readGept(notes, 'intermediate', 'i1'), { d: '2026-11-24', q: 3.5, best: 3.5, p: 4 }, '問答也記最好的一次')
  assert.deepEqual(readGept(notes, 'elementary', 'e1'), {})
})

test('口說分數看不懂就不算：-5、3.8、無法評分都不會變成一個分數（稽核 SV-06）', async () => {
  const { parseGeptFeedback } = await import('../src/lib/gept.ts')
  const score = (line: string) => parseGeptFeedback('[分數] ' + line + ' ||| 理由').score
  assert.equal(score('-5'), undefined)
  assert.equal(score('3.8'), undefined)
  assert.equal(score('無法評分'), undefined)
  assert.equal(score('6'), undefined)
  assert.equal(score('4'), 4)
  assert.equal(score('4.5'), 4.5)
  assert.equal(score('4 級分'), 4)
  assert.equal(score('0'), 0)
})

test('初級問答拿過 4 級分打開中級：之後同一回重做分數比較低，中級也不會又鎖起來（稽核 SV-07）', async () => {
  const { geptLevelsOpen, saveGept, readGept } = await import('../src/lib/gept.ts')
  let notes: Record<string, string> = {}
  notes = saveGept(notes, 'elementary', 'e1', { q: 4, d: '2026-11-20' })
  assert.equal(geptLevelsOpen(notes, ['e1']).intermediate, true)
  notes = saveGept(notes, 'elementary', 'e1', { q: 3, d: '2026-11-26' })
  assert.equal(readGept(notes, 'elementary', 'e1').q, 3, '最近一次照實記')
  assert.equal(readGept(notes, 'elementary', 'e1').best, 4)
  assert.equal(geptLevelsOpen(notes, ['e1']).intermediate, true, '打開過就不會再鎖')
  // A record from before best was kept: its q still opens it.
  assert.equal(geptLevelsOpen({ 'gept.speak.elementary.e2': JSON.stringify({ q: 4 }) }, ['e2']).intermediate, true)
})

test('朗讀照官方時間：整個朗讀部分一起默讀 1 分鐘，初級 1 分鐘、中級 2 分鐘念完；兩段都念到才算這一回做完（稽核 SV-05、D-SV-02）', async () => {
  const { readSeconds, geptRoundDone } = await import('../src/lib/gept.ts')
  assert.deepEqual(readSeconds.elementary, { silent: 60, aloud: 60 })
  assert.deepEqual(readSeconds.intermediate, { silent: 60, aloud: 120 })
  const el = { repeat: ['a', 'b', 'c'] }
  assert.equal(geptRoundDone({ r: 60, q: 4, rr: 3 }, 'elementary', el, 2), false, '以前的紀錄看不出兩段都念了')
  assert.equal(geptRoundDone({ r: 60, rp: [90, 0], q: 4, rr: 3 }, 'elementary', el, 2), false, '只念了句子，短文沒念')
  assert.equal(geptRoundDone({ r: 80, rp: [90, 70], q: 4, rr: 2 }, 'elementary', el, 2), false, '複誦只做了兩句')
  assert.equal(geptRoundDone({ r: 80, rp: [90, 70], q: 4, rr: 3 }, 'elementary', el, 2), true)
  assert.equal(geptRoundDone({ r: 80, rp: [90, 70], q: 4 }, 'intermediate', {}, 2), false, '中級還要看圖敘述')
  assert.equal(geptRoundDone({ r: 80, rp: [90, 70], q: 4, p: 3 }, 'intermediate', {}, 2), true)
})
