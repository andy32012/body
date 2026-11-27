import test from 'node:test'
import assert from 'node:assert/strict'
import { addWeak, easeWeak, mergeWeakNotes, normalizeLabel, readWeak, removeWeak, takeWeakLines, topWeak, unitLabels, weakLines, weakLinesEn, weakKey } from '../src/lib/weakPoints.ts'
import { emmaInstructions, emmaStudy } from '../src/lib/emmaPrompt.ts'
import { emmaLevel } from '../src/lib/cefr.ts'
import { parseSpeakFeedback, speakFeedbackPrompt } from '../src/lib/speakFeedback.ts'
import { addSayCard, hasSayCard, removeSayCard, sayCardSentence, readSayCard, fixToCard } from '../src/lib/sayCards.ts'
import { tutorSystem } from '../src/lib/tutor.ts'

const day = '2026-11-24'

test('弱點名稱：照課程的文法名稱對齊，看不懂的就不記', () => {
  assert.equal(unitLabels.length, 53)
  assert.equal(normalizeLabel('現在進行式'), '現在進行式')
  assert.equal(normalizeLabel('「現在完成式」'), '現在完成式', '引號拿掉')
  assert.equal(normalizeLabel('用字（weather / whether）'), '用字', '括號裡的說明不算')
  assert.equal(normalizeLabel('there is／there are'), 'there is／there are 和 it 當主詞', '名稱的大部分也對得到')
  assert.equal(normalizeLabel('the 的用法'), 'the')
  assert.equal(normalizeLabel('therefore'), null, 'the 不是 there 的開頭')
  assert.equal(normalizeLabel('時態'), null, '太籠統的字不要硬對到「敘事時態」')
  assert.equal(normalizeLabel('被動語態'), '被動語態')
  assert.equal(normalizeLabel('亂寫的東西'), null)
})

test('弱點清單：同一種錯累加、例句留最新三句；寫對一次扣一次，扣到零就拿掉', () => {
  let notes: Record<string, string> = {}
  notes = addWeak(notes, '現在進行式', '2026-11-20', { w: 'I eating.', r: 'I am eating.' })
  notes = addWeak(notes, '現在進行式', '2026-11-21', { w: 'She cooking.', r: 'She is cooking.' }, 'speak')
  notes = addWeak(notes, '現在進行式', '2026-11-22', { w: 'They playing.', r: 'They are playing.' }, 'drill')
  notes = addWeak(notes, '現在進行式', '2026-11-23', { w: 'He running.', r: 'He is running.' }, 'write')
  notes = addWeak(notes, '不在清單的名稱', day, { w: 'x', r: 'y' })
  const [item] = readWeak(notes)
  assert.equal(readWeak(notes).length, 1, '不在清單的名稱不會被記')
  assert.equal(item.n, 4)
  assert.deepEqual([item.first, item.last], ['2026-11-20', '2026-11-23'])
  assert.deepEqual(item.ex.map(e => e.w), ['He running.', 'They playing.', 'She cooking.'])
  notes = easeWeak(notes, '現在進行式')
  assert.equal(readWeak(notes)[0].n, 3)
  notes = easeWeak(easeWeak(easeWeak(notes, '現在進行式'), '現在進行式'), '現在進行式')
  assert.equal(readWeak(notes).length, 0)
  notes = addWeak(notes, 'the', day)
  const removed = removeWeak(notes, 'the')
  assert.equal(readWeak(removed).length, 0, '可以自己刪掉')
  assert.ok(JSON.parse(removed[weakKey]).every((w: { n: number }) => w.n === 0), '清單裡只剩歸零的（留著讓另一台的舊紀錄不會把它變回來）')
})

test('弱點排名：越常錯越前面，三週沒再錯就減半，太久沒錯的不再給老師看', () => {
  let notes: Record<string, string> = {}
  for (const d of ['2026-08-01', '2026-08-02']) notes = addWeak(notes, 'the', d)
  for (const d of ['2026-11-20', '2026-11-21', '2026-11-22']) notes = addWeak(notes, '過去式（不規則動詞）', d, { w: 'I goed home.', r: 'I went home.' })
  notes = addWeak(notes, '拼字', '2026-11-23')
  const top = topWeak(notes, day)
  assert.deepEqual(top.map(t => t.k), ['過去式（不規則動詞）', '拼字'], '八月的兩次早就淡掉了')
  assert.match(weakLines(notes, day)[0], /過去式（不規則動詞）（錯 3 次，例如他寫「I goed home\.」，應該是「I went home\.」）/)
  assert.match(weakLinesEn(notes, day)[0], /past simple of irregular verbs \(he said "I goed home\."/)
})

test('老師回覆裡的「弱點：」：整個名稱優先（名稱裡也有、和／），兩種用；分開', () => {
  const r = takeWeakLines('主詞後面少了 be 動詞。\n弱點：名詞單複數、a／an；拼字\n判定：小錯')
  assert.deepEqual(r.labels, ['名詞單複數、a／an', '拼字'])
  assert.equal(r.clean, '主詞後面少了 be 動詞。\n判定：小錯')
  assert.deepEqual(takeWeakLines('弱點：名詞單複數、a／an').labels, ['名詞單複數、a／an'])
  assert.deepEqual(takeWeakLines('弱點：現在進行式、拼字').labels, ['現在進行式', '拼字'])
})

test('Claude 老師的指示：帶最近的弱點，判錯時要寫一行「弱點：」', () => {
  const s = { id: 'u6-d1', zh: '我正在吃午餐。', reference: ['I am eating lunch.'], grammar: ['現在進行式'], hints: [], why: '', newWords: [] }
  const text = tutorSystem(s, ['1. be 動詞現在式'], ['the（錯 2 次）'])
  assert.match(text, /他最近常錯的地方.*the（錯 2 次）/)
  assert.match(text, /弱點：名稱/)
  assert.match(text, /課程的文法名稱：be 動詞現在式、/)
})

test('Emma 知道學過什麼：學過的先提示、沒學過的直接說對的；弱點也帶進去；雅思不帶', () => {
  const study = emmaStudy(12, ['the (he said "I like the music.", right: "I like music.")'])
  assert.match(study, /# What he has studied/)
  assert.match(study, /all the basics before these/, '前面的單元只總結，指示才不會太長')
  assert.match(study, /future \(will, be going to\)/, '最近學過的')
  assert.match(study, /Learning now: modal verbs/)
  assert.match(study, /Not learned yet: prepositions of time and place/)
  assert.match(study, /His weak points lately: the/)
  assert.match(study, /do not say the right sentence at once/)
  assert.match(study, /not learned yet: just say it back the right way/)
  const chat = emmaInstructions([], '', emmaLevel(12), { study })
  assert.match(chat, /follow "Correcting him" below/)
  assert.ok(chat.length < 5200, '加了學習狀況，指示還是要短')
  const first = emmaStudy(1, [])
  assert.match(first, /just started/)
  const ielts = emmaInstructions([], 'Step 2', emmaLevel(12), { longTurn: true })
  assert.doesNotMatch(ielts, /Correcting him/)
  assert.match(ielts, /casually say it back/)
})

test('聊完的固定回饋：用了幾次、最多三句修正、下次用的一句、一句鼓勵', () => {
  const prompt = speakFeedbackPrompt({ label: '現在進行式', rule: 'be + V-ing' }, 'Emma')
  for (const tag of ['[用了]', '[卡]', '[下次]', '[鼓勵]']) assert.ok(prompt.includes(tag), tag)
  const fb = parseSpeakFeedback([
    '[用了] 3 次 ||| I am studying now.',
    '[卡] I eating dinner ||| I am eating dinner. ||| 我正在吃晚餐。 ||| 少了 am ||| 現在進行式',
    '[卡] She go to school ||| She goes to school. ||| 她去上學。 ||| 第三人稱要加 s',
    '[卡] a ||| b ||| c ||| d ||| 拼字',
    '[卡] e ||| f ||| g ||| h',
    '[卡] 壞掉的一行',
    '[下次] I am working on my homework. ||| 我正在寫功課。',
    '[鼓勵] 你今天主動問了 Emma 兩個問題，超棒！',
    '流暢度和發音：只看逐字稿沒辦法評估。',
  ].join('\n'))
  assert.deepEqual(fb.used, { n: 3, example: 'I am studying now.' })
  assert.equal(fb.fixes.length, 3, '最多三句')
  assert.equal(fb.fixes[0].tag, '現在進行式')
  assert.equal(fb.fixes[1].tag, undefined)
  assert.deepEqual(fb.next, { en: 'I am working on my homework.', zh: '我正在寫功課。' })
  assert.match(fb.cheer!, /超棒/)
  assert.equal(fb.rest, '流暢度和發音：只看逐字稿沒辦法評估。')
  assert.deepEqual(parseSpeakFeedback('[用了] 0 ||| 無').used, { n: 0, example: '' })
})

test('口說錯句自動加進複習、可以拿掉；卡片帶弱點名稱，複習時算進那個弱點', () => {
  let s = { notes: {} as Record<string, string>, cards: [] as { id: string; box: 1; lastDay: string; due: string; mastered: boolean }[] }
  s = addSayCard(s, { zh: '我正在吃晚餐。', en: 'I am eating dinner.', wrong: 'I eating dinner', from: 'emma', tag: '現在進行式' }, day, '0')
  assert.ok(hasSayCard(s.notes, 'I am eating dinner'))
  assert.equal(s.cards.length, 1)
  const key = Object.keys(s.notes)[0]
  const sentence = sayCardSentence(key.slice(4), readSayCard(s.notes[key])!)
  assert.deepEqual(sentence.grammar, ['口說錯句', '現在進行式'])
  s = removeSayCard(s, 'I am eating dinner.')
  assert.equal(s.cards.length, 0)
  assert.deepEqual(s.notes, {})
  assert.equal(fixToCard({ wrong: 'goed', right: 'went', tag: '過去式（不規則動詞）' })?.tag, '過去式（不規則動詞）')
})

test('角色扮演（生活主題、單元任務、護理情境）保留自己的糾正規則，只帶學過什麼', () => {
  const play = emmaStudy(12, ['the'], false)
  assert.doesNotMatch(play, /Correcting him/)
  assert.match(play, /Keep your English mostly within what he has learned/)
  assert.match(emmaInstructions([], 'Role-play', emmaLevel(12), { study: play }), /casually say it back/)
})

test('弱點清單再多也不會超過一則筆記的長度上限', () => {
  let notes: Record<string, string> = {}
  const long = 'x'.repeat(400)
  for (let i = 0; i < 60; i++) for (const label of unitLabels.slice(0, 40).map(u => u.label)) notes = addWeak(notes, label, day, { w: long + i, r: long })
  assert.ok(notes[weakKey].length <= 30000, String(notes[weakKey].length))
  assert.ok(readWeak(notes).length >= 20)
})

test('錯句卡分得出數字：Take 5 mg. 和 Take 50 mg. 是兩張卡，刪一張不會刪到另一張（稽核 LIT-04）', async () => {
  const { addSayCard, hasSayCard, removeSayCard, sayIdentity } = await import('../src/lib/sayCards.ts')
  let s = { notes: {} as Record<string, string>, cards: [] as import('../src/lib/progress.ts').ReviewCard[] }
  s = addSayCard(s, { zh: '服用五毫克。', en: 'Take 5 mg.' }, '2026-11-26', 'a')
  assert.equal(hasSayCard(s.notes, 'Take 50 mg.'), false)
  s = addSayCard(s, { zh: '服用五十毫克。', en: 'Take 50 mg.' }, '2026-11-26', 'b')
  assert.equal(s.cards.length, 2)
  assert.equal(hasSayCard(s.notes, 'take 5 mg'), true, '大小寫和標點不同還是同一句')
  s = removeSayCard(s, 'Take 50 mg.')
  assert.equal(s.cards.length, 1)
  assert.equal(hasSayCard(s.notes, 'Take 5 mg.'), true, '另一張還在')
  assert.notEqual(sayIdentity('Go to room 12.'), sayIdentity('Go to room 120.'))
  assert.notEqual(sayIdentity('Give 2.5 mL.'), sayIdentity('Give 25 mL.'))
  assert.equal(sayIdentity('It costs 1,000 dollars.'), sayIdentity('It costs 1000 dollars'))
  assert.equal(sayIdentity("I don’t know."), sayIdentity("I don't know"))
  assert.notEqual(sayIdentity('I can go.'), sayIdentity('I cango.'))
})

// R014: a reply that is not the fixed format (or was cut off) is no feedback: nothing is saved and he can send the
// same transcript again.
test('Emma feedback counts only when every required line came back', async () => {
  const { speakFeedbackOk } = await import('../src/lib/speakFeedback.ts')
  const full = parseSpeakFeedback(['[用了] 1 ||| I am eating.', '[卡] I go yesterday ||| I went yesterday ||| 我昨天去了 ||| 過去的事用過去式 ||| 過去式', '[下次] I was reading. ||| 我那時在讀書', '[鼓勵] 你今天講了好多句！'].join('\n'))
  assert.equal(speakFeedbackOk(full, false), true)
  // Cut off before [下次] and [鼓勵], or free text only: not feedback.
  assert.equal(speakFeedbackOk(parseSpeakFeedback('[用了] 1 ||| I am eating.\n[卡] I go yesterday ||| I went yesterday ||| 我昨天去了 ||| 過去的事'), false), false)
  assert.equal(speakFeedbackOk(parseSpeakFeedback('Great job today! Keep going.'), false), false)
  // IELTS Part 2: the three judged lines and the fixed line about fluency and pronunciation.
  const part2 = parseSpeakFeedback(['內容和連貫：有回答到題目；可以多講一個例子。', '詞彙：用了 crowded；可以換掉重複的 good。', '文法範圍與正確度：時態大多對；過去式還會漏。', '流暢度和發音：只看逐字稿沒辦法評估，要聽錄音。'].join('\n'))
  assert.equal(speakFeedbackOk(part2, true), true)
  assert.equal(speakFeedbackOk(parseSpeakFeedback('內容和連貫：有回答到題目。'), true), false)
})

// R019: a weak point's example from a textbook item (the sentence will be practised again) shows only what he wrote;
// corrections of his own free speaking and writing still show. The handoff text he copies leaves the answers out too.
test('weak points do not show the textbook answer of items still being practised', async () => {
  const { addWeak, fixShown, readWeak, weakLines } = await import('../src/lib/weakPoints.ts')
  let notes: Record<string, string> = {}
  notes = addWeak(notes, 'be 動詞現在式', '2026-11-20', { w: 'I is a nurse.', r: 'I am a nurse.' }, 'self')
  notes = addWeak(notes, '用字', '2026-11-21', { w: 'I go yesterday.', r: 'I went yesterday.' }, 'speak')
  const [be] = readWeak(notes).filter(i => i.k === 'be 動詞現在式')
  const [past] = readWeak(notes).filter(i => i.k === '用字')
  assert.equal(fixShown(be.ex[0]), false)
  assert.equal(fixShown(past.ex[0]), true)
  // Claude's own prompts keep the answer; the copied handoff does not.
  assert.match(weakLines(notes, '2026-11-26', 5).join('；'), /I am a nurse\./)
  assert.doesNotMatch(weakLines(notes, '2026-11-26', 5, false).join('；'), /I am a nurse\./)
  assert.match(weakLines(notes, '2026-11-26', 5, false).join('；'), /I went yesterday\./)
  assert.match(weakLines(notes, '2026-11-26', 5, false).join('；'), /I is a nurse\./)
})

test('同一種錯記了很多次，清單也不會越存越長；兩台合併時同一次錯只算一次', () => {
  let notes: Record<string, string> = {}
  for (let i = 0; i < 200; i++) notes = addWeak(notes, '現在進行式', '2026-11-20', { w: 'I eating ' + i, r: 'I am eating.' })
  const [item] = readWeak(notes)
  assert.equal(item.n, 200, '次數一次都沒少')
  assert.ok(notes[weakKey].length < 2000, '舊的錯誤只留總數：' + notes[weakKey].length)
  // The other device synced these, then each side added its own mistake.
  const phone = addWeak(notes, '現在進行式', '2026-11-21', { w: 'She cooking', r: 'She is cooking.' }, 'speak')
  const tablet = addWeak(notes, '現在進行式', '2026-11-21', { w: 'They playing', r: 'They are playing.' }, 'write')
  const merged = mergeWeakNotes(phone, tablet)
  assert.equal(readWeak(merged)[0].n, 202, '兩台各一次，加上原本的 200 次')
})
