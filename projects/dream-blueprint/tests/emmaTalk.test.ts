import test from 'node:test'
import assert from 'node:assert/strict'
import { guardStart, guardStep, quietHeard, quietStart, quietStep, HER_HEARD, GUARD_HOLD_MS, GUARD_MAX_MS } from '../src/lib/voiceTurns.ts'
import { emmaInstructions, emmaOpening, quietNudge } from '../src/lib/emmaPrompt.ts'
import { emmaLevel } from '../src/lib/cefr.ts'

test('防回音：Emma 出聲時麥克風關掉，她停下來一會兒才打開', () => {
  let g = guardStart()
  assert.equal(g.muted, false)
  g = guardStep(g, HER_HEARD + 0.2, 1000)
  assert.equal(g.muted, true, '她一出聲就關')
  g = guardStep(g, 0, 1100)
  assert.equal(g.muted, true, '字和字中間的短停頓不打開')
  g = guardStep(g, HER_HEARD + 0.2, 1200)
  g = guardStep(g, 0, 1300)
  g = guardStep(g, 0, 1300 + GUARD_HOLD_MS - 1)
  assert.equal(g.muted, true)
  g = guardStep(g, 0, 1300 + GUARD_HOLD_MS)
  assert.equal(g.muted, false, '她講完之後打開，換他說')
})

test('防回音：她的音量一直降不下來時不會把麥克風關到底', () => {
  let g = guardStart()
  for (let t = 0; t <= GUARD_MAX_MS + 200; t += 50) g = guardStep(g, 0.5, t)
  assert.equal(g.muted, false, '關太久就放開，不然她永遠聽不到他')
  g = guardStep(g, 0.5, GUARD_MAX_MS + 5000)
  assert.equal(g.muted, false, '音量沒降下來之前不再關')
  g = guardStep(g, 0, GUARD_MAX_MS + 6000)
  g = guardStep(g, 0, GUARD_MAX_MS + 6000 + GUARD_HOLD_MS)
  g = guardStep(g, 0.5, GUARD_MAX_MS + 8000)
  assert.equal(g.muted, true, '安靜過一次之後恢復正常')
})

test('冷場：兩邊都安靜一陣子就提醒 Emma 開口，沒人回應最多提醒兩次', () => {
  const after = 10000, times = 2
  let q = quietStart(0)
  let r = quietStep(q, { her: 0, you: 0, now: 9000 }, after, times)
  assert.equal(r.nudge, false)
  r = quietStep(r.state, { her: 0, you: 0, now: 10000 }, after, times)
  assert.equal(r.nudge, true, '安靜滿 10 秒')
  r = quietStep(r.state, { her: 0, you: 0, now: 10050 }, after, times)
  assert.equal(r.nudge, false, '不會連發')
  // 她照提醒說了一句（聲音＋逐字稿），他還是沒回
  q = quietHeard(r.state, 'assistant', 12000)
  r = quietStep(q, { her: 0.4, you: 0, now: 13000 }, after, times)
  r = quietStep(r.state, { her: 0, you: 0, now: 22900 }, after, times)
  assert.equal(r.nudge, false)
  r = quietStep(r.state, { her: 0, you: 0, now: 23000 }, after, times)
  assert.equal(r.nudge, true, '第二次')
  r = quietStep(r.state, { her: 0, you: 0, now: 60000 }, after, times)
  assert.equal(r.nudge, false, '沒人回就不再吵（他可能離開了）')
  // 他回話之後重新計算
  q = quietHeard(r.state, 'user', 61000)
  r = quietStep(q, { her: 0, you: 0, now: 71000 }, after, times)
  assert.equal(r.nudge, true)
})

test('冷場：他正在出聲或 Emma 正在說的時候不提醒', () => {
  let r = quietStep(quietStart(0), { her: 0, you: 0.5, now: 9000 }, 10000, 2)
  r = quietStep(r.state, { her: 0, you: 0, now: 15000 }, 10000, 2)
  assert.equal(r.nudge, false, '從他最後出聲算起')
  r = quietStep(r.state, { her: 0.5, you: 0, now: 18000 }, 10000, 2)
  r = quietStep(r.state, { her: 0, you: 0, now: 27000 }, 10000, 2)
  assert.equal(r.nudge, false, '從她最後出聲算起')
  r = quietStep(r.state, { her: 0, you: 0, now: 28000 }, 10000, 2)
  assert.equal(r.nudge, true)
})

test('Emma 的指示：她帶話題、不只回一個字、不被雜音打斷、冷場會再開口', () => {
  const text = emmaInstructions([], '', emmaLevel(1))
  for (const part of ['# Language', '# Taking turns', '# Backchannel policy', '# Interruption policy']) assert.ok(text.includes(part), part)
  assert.match(text, /You lead the conversation/)
  assert.match(text, /Never answer with only/)
  assert.match(text, /your own voice/i)
  assert.match(text, /about six seconds/)
  assert.match(text, /你怎麼不說話/)
  assert.ok(text.length < 4000, '指示要短，她才會照做')
})

test('Emma 的指示：雅思 Part 2 他要自己講一兩分鐘，不催他、可以「Mm-hm」', () => {
  const text = emmaInstructions([], 'Step 2: While he talks, do NOT interrupt.', emmaLevel(1), { longTurn: true })
  assert.doesNotMatch(text, /about six seconds/)
  assert.doesNotMatch(text, /# Backchannel policy/)
  assert.match(text, /# Interruption policy/)
  assert.match(text, /Step 2: While he talks/)
})

test('Emma 的指示：記得的事和當天的課都帶進去', () => {
  const text = emmaInstructions(['likes bubble tea'], 'Lesson: unit 3', emmaLevel(1))
  assert.match(text, /likes bubble tea/)
  assert.match(text, /Lesson: unit 3/)
})

test('開場和冷場提醒都叫她「現在就說」，而且用英文', () => {
  assert.match(emmaOpening(false), /Speak first/)
  assert.match(emmaOpening(false), /question/)
  assert.match(emmaOpening(true), /instructions/)
  assert.match(quietNudge, /Immediately/)
  assert.doesNotMatch(emmaOpening(false) + emmaOpening(true) + quietNudge, /[一-鿿]{3,}/)
})
