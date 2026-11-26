/** A QR link carries encrypted keys after #. The high-entropy secret is displayed separately
 *  on the sending device. The receiving page checks the encrypted deadline locally. */
export interface PairKeys { claude: string; openai?: string; model?: string }
interface Sealed { v: 2; s: string; i: string; d: string }
const ITER = 210000
export const pairDurationMs = 10 * 60 * 1000
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const codeLength = 26
const payloadPattern = /^[A-Za-z0-9_-]{40,16384}$/
const enc = new TextEncoder(), dec = new TextDecoder()
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

async function derive(code: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export function randomCode() {
  // 32 symbols divide the range of a byte evenly. Each independent symbol contributes five bits.
  return Array.from(crypto.getRandomValues(new Uint8Array(codeLength)), n => alphabet[n & 31]).join('')
}
export function normalizePairCode(value: string): string | null {
  const code = value.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  return code.length === codeLength && /^[0-9A-HJKMNP-TV-Z]+$/.test(code) ? code : null
}

export async function seal(keys: PairKeys, code: string, now = Date.now()): Promise<string> {
  const secret = normalizePairCode(code)
  if (!secret || !keys.claude.trim()) throw new Error('沒有可用的配對資料')
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await derive(secret, salt)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ ...keys, exp: now + pairDurationMs }))))
  const sealed: Sealed = { v: 2, s: b64(salt), i: b64(iv), d: b64(data) }
  return b64(enc.encode(JSON.stringify(sealed)))
}

function readSealed(payload: string) {
  if (!payloadPattern.test(payload)) return 'broken'
  try {
    const sealed: Partial<Record<keyof Sealed, unknown>> | null = JSON.parse(dec.decode(unb64(payload)))
    if (sealed?.v === 1) return 'legacy'
    if (sealed?.v !== 2 || typeof sealed.s !== 'string' || typeof sealed.i !== 'string' || typeof sealed.d !== 'string') return 'broken'
    const salt = unb64(sealed.s), iv = unb64(sealed.i), data = unb64(sealed.d)
    if (salt.length !== 16 || iv.length !== 12 || data.length <= 16) return 'broken'
    return { salt, iv, data }
  } catch { return 'broken' }
}

export function pairingLinkError(payload: string) {
  const packet = readSealed(payload)
  return typeof packet === 'string' ? packet : undefined
}

export type OpenResult = { ok: true; keys: PairKeys } | { ok: false; reason: 'code' | 'expired' | 'broken' | 'legacy' }
export async function open(payload: string, code: string, now?: number): Promise<OpenResult> {
  const packet = readSealed(payload)
  if (typeof packet === 'string') return { ok: false, reason: packet }
  const secret = normalizePairCode(code)
  if (!secret) return { ok: false, reason: 'code' }
  let decrypted: ArrayBuffer
  try {
    const key = await derive(secret, packet.salt)
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packet.iv }, key, packet.data)
  } catch { return { ok: false, reason: 'code' } }
  try {
    const plain: Partial<Record<keyof PairKeys | 'exp', unknown>> | null = JSON.parse(dec.decode(decrypted))
    if (!plain || typeof plain.exp !== 'number' || !Number.isFinite(plain.exp)) return { ok: false, reason: 'broken' }
    if ((now ?? Date.now()) >= plain.exp) return { ok: false, reason: 'expired' }
    if (typeof plain.claude !== 'string' || !plain.claude.trim()) return { ok: false, reason: 'broken' }
    const keys: PairKeys = { claude: plain.claude }
    if (typeof plain.openai === 'string' && plain.openai.trim()) keys.openai = plain.openai
    if (typeof plain.model === 'string' && plain.model.trim()) keys.model = plain.model
    return { ok: true, keys }
  } catch { return { ok: false, reason: 'broken' } }
}
export const pairPrefix = '#pair='
/** Read a pairing link from the address bar and remove it right away, so it doesn't stay in history. */
let taken: string | null = null
export function takePairing(): string | null {
  if (location.hash.startsWith(pairPrefix)) {
    taken = location.hash.slice(pairPrefix.length) || null
    history.replaceState(null, '', location.pathname + '#today')
  }
  // The same link read twice on one load (React may run the first render twice) gives the same answer.
  return taken
}
export const clearPairing = () => { taken = null }
/** Accept a whole pasted link, or just the part after #pair=. */
export function payloadFrom(text: string): string | null {
  const t = text.trim()
  const i = t.indexOf(pairPrefix)
  const p = i >= 0 ? t.slice(i + pairPrefix.length) : t
  return payloadPattern.test(p) ? p : null
}
/** Tell the open app that a pairing link should be shown (from Settings or a link opened in a running tab). */
export const pairEvent = 'dream-blueprint:pair'
export const pairKeysEvent = 'dream-blueprint:keys'
/** Only success flags, never the actual keys, are included in the local UI event. */
export type PairedFields = { claude: boolean; model: boolean; openai: boolean }
