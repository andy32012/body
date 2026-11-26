import test from 'node:test'
import assert from 'node:assert/strict'
import { addEvidence, bestLevel, judgeCheckpoint, judgeExpress, judgeVariation, judgeWritten, matchesReference, readEvidence, setEvidenceLevel } from '../src/lib/evidence.ts'

const refs = ['I am a nursing student.', "I'm a nursing student."]

test('完成和學會分開：看提示＝在協助下完成；沒人確認的「對了」＝答案待確認', () => {
  assert.equal(judgeWritten({ rating: 'correct', revealed: true, answer: 'I am a nursing student.', references: refs }), 'assisted')
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: "i'm a nursing student", references: refs }), 'independent')
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: 'I study nursing.', references: refs }), 'pending')
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: 'I study nursing.', references: refs, firstVerdict: 'good' }), 'independent')
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: 'I study nursing.', references: refs, firstVerdict: 'small' }), 'assisted')
  assert.equal(judgeWritten({ rating: 'minor', revealed: false, answer: 'x', references: refs }), 'assisted')
  assert.equal(judgeWritten({ rating: 'again', revealed: true, answer: '', references: refs }), null)
  // 未作答：空白就算按了「對了」或「小錯」，也不留下任何紀錄。
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: '   ', references: refs }), null)
  assert.equal(judgeWritten({ rating: 'minor', revealed: false, answer: '', references: refs, firstVerdict: 'good' }), null)
  assert.ok(matchesReference("He doesn't drink tea", ['He does not drink tea.']))
})
test('變化句、表達題、小關卡的判定', () => {
  assert.equal(judgeVariation('good', 'I am not a doctor. I am a nurse.', 'I am not a doctor. I am a nurse.'), 'independent')
  assert.equal(judgeVariation('good', "I'm not a doctor, I'm a nurse", 'I am not a doctor. I am a nurse.'), 'independent')
  assert.equal(judgeVariation('good', 'No doctor, nurse.', 'I am not a doctor. I am a nurse.'), 'pending')
  assert.equal(judgeVariation('good', '', 'I am not a doctor. I am a nurse.'), null)
  // 換個說法也能請 Claude 老師批改：第一次就對 → 獨立完成；被指出問題後改好、或老師給了答案 → 有提示完成
  const ref = 'I am not a doctor. I am a nurse.'
  assert.equal(judgeVariation('good', 'I am not a doctor, I am a nurse.', ref, { firstVerdict: 'good', checkedText: 'I am not a doctor, I am a nurse.' }), 'independent')
  assert.equal(judgeVariation('good', "I'm no doctor; I'm a nurse.", ref, { firstVerdict: 'good', checkedText: "I'm no doctor; I'm a nurse." }), 'independent', '跟參考句不同但老師第一次就說對')
  assert.equal(judgeVariation('good', ref, ref, { firstVerdict: 'small', checkedText: 'I am not doctor I am a nurse.' }), 'assisted', '老師指出少了 a，改好才對')
  assert.equal(judgeVariation('good', ref, ref, { firstVerdict: 'changed', checkedText: 'I am a doctor.' }), 'assisted')
  assert.equal(judgeVariation('good', ref, ref, { revealed: true }), 'assisted', '老師直接給了答案')
  assert.equal(judgeVariation('good', 'I am no doctor nurse.', ref, { firstVerdict: 'good', checkedText: "I'm no doctor; I'm a nurse." }), 'pending', '老師確認之後又改掉的那一版沒人看過')
  assert.equal(judgeVariation('small', ref, ref, { firstVerdict: 'good', checkedText: ref }), 'assisted')
  assert.equal(judgeVariation('again', ref, ref, { firstVerdict: 'good', checkedText: ref }), null)
  assert.equal(judgeExpress({ firstVerdict: 'good', help: ['zh'], answered: true }), 'independent')
  assert.equal(judgeExpress({ firstVerdict: 'good', help: ['frame'], answered: true }), 'assisted')
  assert.equal(judgeExpress({ help: [], answered: true }), 'pending')
  assert.equal(judgeCheckpoint(['independent', 'independent', 'assisted']), 'delayed')
  assert.equal(judgeCheckpoint(['independent', 'assisted', 'assisted']), 'assisted')
  assert.equal(judgeCheckpoint(['independent', 'pending', 'again' as never]), 'pending')
})
test('紀錄：同一天同一來源只留一筆；確認後清掉答案；寫和聽分開算最好的一次', () => {
  let notes = addEvidence({}, 1, { day: '2026-11-21', level: 'pending', source: 'pattern', skill: 'write', item: 'u1-d1', answer: 'I study nursing.' })
  notes = addEvidence(notes, 1, { day: '2026-11-21', level: 'pending', source: 'pattern', skill: 'write', item: 'u1-d1', answer: 'I study nursing.' })
  notes = addEvidence(notes, 1, { day: '2026-11-21', level: 'assisted', source: 'listen', skill: 'listen' })
  assert.equal(readEvidence(notes, 1).length, 2)
  notes = setEvidenceLevel(notes, 1, 0, 'independent')
  assert.equal(readEvidence(notes, 1)[0].answer, undefined)
  assert.equal(bestLevel(readEvidence(notes, 1), 'write'), 'independent')
  assert.equal(bestLevel(readEvidence(notes, 1), 'listen'), 'assisted')
})

test('中翻英回饋：意思變了是第四種判定；跟參考句比對只標出不一樣的地方', async () => {
  const { verdictOf } = await import('../src/lib/tutor.ts')
  const { compareWithReference } = await import('../src/lib/evidence.ts')
  assert.equal(verdictOf('你寫成退款了，題目是換貨。\n判定：意思不同'), 'changed')
  assert.equal(verdictOf('判定：對了'), 'good')
  // 意思變了，就算之後改對也不是當次獨立完成。
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: "I'd like a refund.", references: ['Could I exchange this for a bigger size?'], firstVerdict: 'changed' }), 'assisted')
  const d = compareWithReference('I wake up at seven.', ['I get up at seven.', "I get up at seven o'clock."])!
  assert.equal(d.same, false)
  assert.deepEqual(d.words.filter(w => w.extra).map(w => w.w), ['wake'])
  assert.deepEqual(d.missing, ['get'])
  assert.equal(compareWithReference("I'm a nursing student", ['I am a nursing student.'])!.same, true)
})

test('待確認的答案請 Claude 看：照「判定：對／錯」加「原因」才算；說錯留著原答和原因等重寫；看不出對錯就不動（審核 R005）', async () => {
  const { checkPending, teacherVerdict, pendingRef } = await import('../src/lib/evidence.ts')
  const pending = { day: '2026-11-26', level: 'pending' as const, source: 'vary' as const, skill: 'write' as const, answer: 'I nurse.', prompt: '我是護理師。', ref: 'I am a nurse.' }
  const start = addEvidence({}, 1, pending)
  const ref = pendingRef(pending)
  const right = '判定：對\n原因：主詞和動詞都對，意思也對。'
  const wrongBecause = (why: string) => '判定：錯\n原因：' + why
  assert.equal(teacherVerdict(right), 'right')
  assert.equal(teacherVerdict(wrongBecause('缺少動詞。')), 'wrong')
  assert.equal(teacherVerdict('對不起，這句需要重寫。'), 'unclear', '「對不起」不是說對')
  assert.equal(teacherVerdict('對。'), 'unclear', '沒照格式')
  assert.equal(teacherVerdict('判定：對'), 'unclear', '沒說原因')
  assert.equal(teacherVerdict('嗯，這句可以再想想'), 'unclear')
  // Right the first time: done alone.
  assert.equal(readEvidence(checkPending(start, 1, ref, right), 1)[0].level, 'independent')
  // Wrong: nothing gained, the question, his answer and the reason stay.
  const wrong = checkPending(start, 1, ref, wrongBecause('缺少動詞。'))
  const e = readEvidence(wrong, 1)[0]
  assert.equal(e.level, 'pending')
  assert.equal(e.wrong, '缺少動詞。')
  assert.equal(e.answer, 'I nurse.')
  assert.equal(e.prompt, '我是護理師。')
  assert.equal(bestLevel(readEvidence(wrong, 1)), null, '說錯的不算任何完成')
  // Rewritten right: done with help. Rewritten wrong again: the new answer and reason replace the old.
  const again = checkPending(wrong, 1, ref, wrongBecause('少了 a'), 'I am nurse.')
  assert.deepEqual([readEvidence(again, 1)[0].answer, readEvidence(again, 1)[0].wrong], ['I am nurse.', '少了 a'])
  const fixed = readEvidence(checkPending(again, 1, { ...ref, answer: 'I am nurse.' }, right, 'I am a nurse.'), 1)[0]
  assert.equal(fixed.level, 'assisted')
  assert.equal(fixed.answer, undefined)
  assert.equal(fixed.wrong, undefined)
  // Unclear: unchanged.
  assert.equal(checkPending(start, 1, ref, '這句不錯喔'), start)
  assert.equal(checkPending(start, 1, ref, '對不起，這句需要重寫。'), start)
})

test('待確認的批改落在送出的那一題、那一版答案：清單順序變了也不會寫到別題，答案改過就不落地（審核 R006）', async () => {
  const { checkPending, pendingRef } = await import('../src/lib/evidence.ts')
  const base = { day: '2026-11-26', level: 'pending' as const, source: 'vary' as const, skill: 'write' as const, prompt: '題目', ref: '參考' }
  const a = { ...base, item: 'a', answer: 'I nurse.' }, b = { ...base, item: 'b', answer: 'He doctor.' }
  const right = '判定：對\n原因：沒問題。'
  const sentA = pendingRef(a)
  let notes = addEvidence(addEvidence({}, 1, a), 1, b)
  notes = addEvidence(notes, 1, { ...a })
  assert.deepEqual(readEvidence(notes, 1).map(x => x.item), ['b', 'a'], 'A 重新存過，排到後面去了')
  const after = readEvidence(checkPending(notes, 1, sentA, right), 1)
  assert.equal(after.find(x => x.item === 'b')!.level, 'pending', 'B 沒有被改到')
  assert.equal(after.find(x => x.item === 'a')!.level, 'independent', '批改落在送出的 A')
  const changed = addEvidence(notes, 1, { ...a, answer: 'I am nurse.' })
  assert.equal(checkPending(changed, 1, sentA, right), changed, 'A 的答案已經改了：舊答案的批改不落地')
})

test('換個說法自己按「看答案」：用看答案前寫的判；還沒寫就看、看完照抄不算完成', () => {
  const ref = 'I am not a doctor. I am a nurse.'
  assert.equal(judgeVariation('good', ref, ref, { before: '' }), null, '空白看答案再抄：不算完成')
  assert.equal(judgeVariation('good', ref, ref, { before: ref }), 'independent', '先自己寫對再對答案：還是自己完成')
  assert.equal(judgeVariation('good', ref, ref, { before: 'I not doctor, I nurse.' }), 'assisted', '看了答案才改對：有提示完成')
  assert.equal(judgeVariation('good', 'No doctor, nurse.', ref, { before: 'No doctor, nurse.' }), 'pending', '沒改、跟參考句不同：待確認')
  assert.equal(judgeVariation('good', ref, ref, { revealed: true, before: 'I am doctor.' }), 'assisted', '上次已經看過答案')
})

test('非限定關係子句的逗號要寫：字都對但少了逗號，不算當次獨立完成，而且會說原因', async () => {
  const { clauseCommaNote } = await import('../src/lib/evidence.ts')
  const ref = ['Our head nurse, who is very kind, used to work in the US.']
  assert.equal(matchesReference('Our head nurse, who is very kind, used to work in the US.', ref), true)
  assert.equal(matchesReference('Our head nurse who is very kind used to work in the US.', ref), false, '兩個逗號都沒寫')
  assert.equal(matchesReference('Our head nurse, who is very kind used to work in the US.', ref), false, '少了後面那個')
  assert.match(clauseCommaNote('Our head nurse who is very kind used to work in the US.', ref) ?? '', /前後兩個逗號/)
  assert.match(clauseCommaNote('Our head nurse, who is very kind used to work in the US.', ref) ?? '', /結束的那個逗號/)
  // A clause at the end only needs the comma before which.
  const end = ["He didn't come to work, which made everyone worried."]
  assert.equal(matchesReference('He did not come to work, which made everyone worried', end), true)
  assert.equal(matchesReference("He didn't come to work which made everyone worried.", end), false)
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: 'Our head nurse who is very kind used to work in the US.', references: ref }), 'pending')
  // Other sentences are not affected by commas.
  assert.equal(matchesReference('Yes I am', ['Yes, I am.']), true)
})

test('Claude 判對以後把非限定子句的逗號刪掉：改過的這一版沒人確認過，不算獨立完成（稽核 CUR-02）', async () => {
  const { judgeWritten, sameEnglish } = await import('../src/lib/evidence.ts')
  const refs = ['My sister, who is a nurse, lives in Taipei.']
  const judged = (answer: string) => judgeWritten({ rating: 'correct', revealed: false, answer, references: refs, firstVerdict: 'good', checkedText: refs[0] })
  assert.equal(judged('My sister, who is a nurse, lives in Taipei.'), 'independent')
  assert.equal(judged('my sister, who is a nurse, lives in Taipei'), 'independent', '大小寫、句點不算改過')
  assert.notEqual(judged('My sister who is a nurse lives in Taipei.'), 'independent', '兩個逗號都刪掉')
  assert.notEqual(judged('My sister who is a nurse, lives in Taipei.'), 'independent', '刪掉第一個')
  assert.notEqual(judged('My sister, who is a nurse lives in Taipei.'), 'independent', '刪掉第二個')
  assert.equal(sameEnglish("I'm fine.", 'I am fine'), true)
  assert.equal(sameEnglish('Are you OK?', 'Are you OK'), false, '問號拿掉變成直述句，要再確認')
})
