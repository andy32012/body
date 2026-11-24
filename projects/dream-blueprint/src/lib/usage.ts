/** What this device has spent on Claude and on OpenAI's live voice, by month, kept in this browser only (not in the
 *  progress backup). Claude's figure comes from the token counts each API reply returns; the voice figure from how
 *  long each call was connected. Both are estimates: the bill in each provider's console is what counts. */

/** USD per million tokens (platform.claude.com/docs/en/about-claude/pricing, 2026-11). */
export const claudePrices: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number; longInput?: number; longOutput?: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  // Haiku 5.5 costs more per token when one request's prompt (cache reads and writes included) is over 100,000 tokens.
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01, longInput: 0.5, longOutput: 2.5 },
}
/** GPT-Live-1.1 while connected (active), USD per minute. Silence while connected is still billed. */
export const LIVE_PER_MINUTE = 0.05
/** The Claude monthly cap set in the Claude Console, and the amounts that raise a warning on this device. */
export const CLAUDE_CAP = 100
export const ALERTS = [70, 85] as const

export interface ClaudeUsage { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }
export interface MonthUsage {
  claude: { calls: number; input: number; output: number; cacheWrite: number; cacheRead: number; usd: number }
  live: { sessions: number; ms: number; usd: number }
  /** Warnings already shown this month (70, 85). */
  alerted: number[]
}
export type UsageBook = Record<string, MonthUsage>

const KEY = 'dream-blueprint.usage'
const empty = (): MonthUsage => ({ claude: { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, usd: 0 }, live: { sessions: 0, ms: 0, usd: 0 }, alerted: [] })
const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0

/** "2026-11" in this device's local time. */
export const monthKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')

export function claudeCost(model: string, u: ClaudeUsage) {
  const p = claudePrices[model] ?? claudePrices['claude-opus-5-5']
  const input = n(u.input_tokens), output = n(u.output_tokens), write = n(u.cache_creation_input_tokens), read = n(u.cache_read_input_tokens)
  const long = !!p.longInput && input + write + read > 100_000
  const scale = long ? p.longInput! / p.input : 1
  return (input * p.input * scale + output * (long ? p.longOutput! : p.output) + write * p.cacheWrite * scale + read * p.cacheRead * scale) / 1_000_000
}
export const liveCost = (ms: number) => ms / 60_000 * LIVE_PER_MINUTE

export function addClaude(book: UsageBook, model: string, u: ClaudeUsage, month: string): UsageBook {
  const m = book[month] ?? empty()
  const c = m.claude
  return { ...book, [month]: { ...m, claude: {
    calls: c.calls + 1, input: c.input + n(u.input_tokens), output: c.output + n(u.output_tokens),
    cacheWrite: c.cacheWrite + n(u.cache_creation_input_tokens), cacheRead: c.cacheRead + n(u.cache_read_input_tokens),
    usd: c.usd + claudeCost(model, u),
  } } }
}
export function addLive(book: UsageBook, ms: number, month: string): UsageBook {
  const m = book[month] ?? empty()
  const add = n(ms)
  return { ...book, [month]: { ...m, live: { sessions: m.live.sessions + 1, ms: m.live.ms + add, usd: m.live.usd + liveCost(add) } } }
}
/** The highest warning this month's Claude spending has reached and that has not been shown yet. */
export function dueAlert(m: MonthUsage | undefined): number | null {
  if (!m) return null
  const reached = ALERTS.filter(a => m.claude.usd >= a && !m.alerted.includes(a))
  return reached.length ? reached[reached.length - 1] : null
}
/** Marks this warning and every lower one as shown, so 85 does not bring back 70. */
export function markAlerted(book: UsageBook, month: string, amount: number): UsageBook {
  const m = book[month] ?? empty()
  return { ...book, [month]: { ...m, alerted: [...new Set([...m.alerted, ...ALERTS.filter(a => a <= amount)])] } }
}

export function readUsage(): UsageBook {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!raw || typeof raw !== 'object') return {}
    const out: UsageBook = {}
    for (const [k, v] of Object.entries(raw as Record<string, Partial<MonthUsage>>)) {
      if (!/^\d{4}-\d{2}$/.test(k) || !v || typeof v !== 'object') continue
      const e = empty()
      out[k] = { claude: { ...e.claude, ...(v.claude ?? {}) }, live: { ...e.live, ...(v.live ?? {}) }, alerted: Array.isArray(v.alerted) ? v.alerted.filter(a => typeof a === 'number') : [] }
    }
    return out
  } catch { return {} }
}
function writeUsage(book: UsageBook) {
  try { localStorage.setItem(KEY, JSON.stringify(book)) } catch { /* private mode: the estimate is skipped */ }
  try { window.dispatchEvent(new Event('dream-usage')) } catch { /* not in a browser */ }
}

/** Called after every Claude reply. Returns a warning amount (70 or 85) the first time this month reaches it. */
export function recordClaude(model: string, u: ClaudeUsage | undefined, now = new Date()): number | null {
  if (!u) return null
  const month = monthKey(now)
  let book = addClaude(readUsage(), model, u, month)
  const alert = dueAlert(book[month])
  if (alert !== null) book = markAlerted(book, month, alert)
  writeUsage(book)
  if (alert !== null) try { window.dispatchEvent(new CustomEvent('dream-usage-alert', { detail: alert })) } catch { /* not in a browser */ }
  return alert
}
export function recordLive(ms: number, now = new Date()) {
  writeUsage(addLive(readUsage(), ms, monthKey(now)))
}
