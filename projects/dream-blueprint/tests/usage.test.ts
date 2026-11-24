import test from 'node:test'
import assert from 'node:assert/strict'
import { addClaude, addLive, claudeCost, dueAlert, liveCost, markAlerted, monthKey, type UsageBook } from '../src/lib/usage'
import { BLOCK_MS, IDLE_STOP_MS, IDLE_WARN_MS, extend, heard, liveVerdict, startClock } from '../src/lib/liveLimits'

test('Claude cost comes from the tokens each reply reports, priced per model', () => {
  const u = { input_tokens: 4000, output_tokens: 600 }
  assert.equal(Number(claudeCost('claude-opus-5-5', u).toFixed(4)), 0.028, 'Opus: 4000 × $4 + 600 × $20 per million')
  assert.equal(Number(claudeCost('claude-sonnet-5-5', u).toFixed(4)), 0.014)
  assert.ok(claudeCost('claude-haiku-5-5', { input_tokens: 120_000 }) > claudeCost('claude-haiku-5-5', { input_tokens: 100_000 }) * 1.2 * 4, 'Haiku costs more past 100k')
  assert.equal(claudeCost('claude-opus-5-5', { cache_read_input_tokens: 1_000_000 }), 0.2)
})

test('the month adds up and warns once at US$70 and once at US$85', () => {
  const month = monthKey(new Date(2026, 10, 24))
  assert.equal(month, '2026-11')
  let book: UsageBook = {}
  // 2,500 Opus calls of 4k in / 600 out ≈ US$70
  for (let i = 0; i < 2510; i++) book = addClaude(book, 'claude-opus-5-5', { input_tokens: 4000, output_tokens: 600 }, month)
  assert.equal(book[month].claude.calls, 2510)
  assert.equal(dueAlert(book[month]), 70)
  book = markAlerted(book, month, 70)
  assert.equal(dueAlert(book[month]), null, 'not twice')
  for (let i = 0; i < 600; i++) book = addClaude(book, 'claude-opus-5-5', { input_tokens: 4000, output_tokens: 600 }, month)
  assert.equal(dueAlert(book[month]), 85)
  book = markAlerted(book, month, 85)
  assert.equal(dueAlert(book[month]), null)
})

test('OpenAI voice is counted apart from Claude, by connected minutes', () => {
  const book = addLive({}, 10 * 60_000, '2026-11')
  assert.equal(book['2026-11'].live.usd, 0.5)
  assert.equal(book['2026-11'].claude.usd, 0, 'not part of the Claude total')
  assert.equal(liveCost(60 * 60_000), 3)
})

test('live call: warn after 2 quiet minutes, end after 3; 20 minutes at a time unless extended', () => {
  const t0 = 1_000_000
  let c = startClock(t0)
  assert.deepEqual(liveVerdict(c, t0 + IDLE_WARN_MS - 1), { stop: null, warnIdle: false, warnLimit: false })
  assert.equal(liveVerdict(c, t0 + IDLE_WARN_MS).warnIdle, true)
  assert.equal(liveVerdict(c, t0 + IDLE_STOP_MS).stop, 'idle')
  // Talking keeps the call open until the 20-minute mark, warning in the last minute.
  for (let t = t0; t < t0 + BLOCK_MS; t += 60_000) c = heard(c, t)
  assert.equal(liveVerdict(c, t0 + BLOCK_MS - 30_000).warnLimit, true)
  assert.equal(liveVerdict(c, t0 + BLOCK_MS).stop, 'limit')
  const more = extend(c, t0 + BLOCK_MS - 30_000)
  assert.equal(more.until, t0 + 2 * BLOCK_MS, '繼續 adds 20 minutes to the current end')
  assert.equal(liveVerdict(heard(more, t0 + BLOCK_MS), t0 + BLOCK_MS + 1000).stop, null)
})
