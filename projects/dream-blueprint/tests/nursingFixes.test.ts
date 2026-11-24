import test from 'node:test'
import assert from 'node:assert/strict'
import bridge from '../src/data/bridge.json'
import curriculum from '../src/data/curriculum.json'
import nursingWords from '../src/data/nursing-words.json' with { type: 'json' }
import nursingListening from '../src/data/nursing-listening.json' with { type: 'json' }
import nursingReading from '../src/data/nursing-reading.json' with { type: 'json' }
import reading from '../src/data/reading.json'

const word = (en: string) => (nursingWords as { en: string; zh: string; ex: string; exZh: string }[]).find(w => w.en === en)!
const dialogue = (id: string) => (nursingListening as { id: string; scene: string; dialogue: { en: string; zh: string }[]; words: { en: string; zh: string }[] }[]).find(d => d.id === id)!

test('a near miss is stopped before it reaches the patient', () => {
  const chunk = bridge.flatMap(p => p.chunks).find(c => c.en === 'a near miss')!
  assert.ok(!/^Giving insulin to the wrong patient/.test(chunk.ex))
  assert.match(chunk.ex, /stopped before giving/)
  assert.match(chunk.zh, /到達病人前/)
})

test('no clinical conclusion from one lab number', () => {
  const hb = word('hemoglobin')
  assert.ok(!/needs blood|輸血/.test(hb.ex + hb.exZh))
  assert.match(hb.ex, /g\/dL/)
})

test('shortness of breath is difficulty breathing; tachypnea is a fast rate, taught separately', () => {
  assert.equal(word('shortness of breath').zh, '呼吸困難（喘）')
  assert.match(word('tachypnea').zh, /呼吸過速/)
  assert.equal(dialogue('nl-19').words.find(w => w.en === 'short of breath')!.zh, '呼吸困難（喘）')
  const u36 = JSON.stringify(curriculum.units.find(u => u.id === 36))
  assert.ok(!u36.includes('呼吸急促'))
})

test('teach-back is 回述法; operating room sentence has its verb', () => {
  assert.match(word('teach-back').zh, /^回述法/)
  assert.equal(word('operating room').ex, 'Take off your jewelry before entering the operating room.')
})

test('IV infiltration is scoped to a plain saline drip, not every IV', () => {
  const d = dialogue('nl-12')
  assert.match(d.scene, /生理食鹽水/)
  assert.ok(!d.dialogue.some(l => l.en === 'Not if we fix it early. I\'ll stop the IV, take it out, and start a new one in your other arm.'))
  assert.ok(d.dialogue.some(l => /saline drip/.test(l.en)))
})

test('times, ages and germs are translated exactly', () => {
  assert.ok(dialogue('nl-17').dialogue.some(l => l.zh === '回診時間是下週二上午十點。'))
  const flu = reading.find(r => r.id === 'a2-flu-notice')!
  assert.ok(flu.paras.join(' ').includes('adults aged sixty-five and older'))
  const hands = reading.find(r => JSON.stringify(r.paras).includes('Germs are very small'))!
  assert.ok(!hands.zh.includes('細菌'))
  for (const id of ['n-a2-clean-hands', 'n-b1-isolation']) {
    const a = (nursingReading as { id: string }[]).find(r => r.id === id)!
    assert.ok(!JSON.stringify(a).includes('細菌'), id)
  }
})
