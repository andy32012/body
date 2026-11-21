/** Move the Claude (and voice) keys to another device without ever putting them on the website.
 *  The computer encrypts them with a random 6-digit code (PBKDF2 + AES-GCM) into a QR link; the link
 *  part after # is never sent to the server. The tablet scans it, types the code, and stores the keys
 *  in its own browser. The link stops working after 10 minutes. */
export interface PairKeys { claude: string; openai?: string; model?: string }
interface Sealed { v: 1; s: string; i: string; d: string }
const ITER = 210000
const TTL = 10 * 60 * 1000
const enc = new TextEncoder(), dec = new TextDecoder()
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

async function derive(code: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
  return String(n).padStart(6, '0')
}
export async function seal(keys: PairKeys, code: string, now = Date.now()): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await derive(code, salt)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ ...keys, exp: now + TTL }))))
  const sealed: Sealed = { v: 1, s: b64(salt), i: b64(iv), d: b64(data) }
  return b64(enc.encode(JSON.stringify(sealed)))
}
export type OpenResult = { ok: true; keys: PairKeys } | { ok: false; reason: 'code' | 'expired' | 'broken' }
export async function open(payload: string, code: string, now = Date.now()): Promise<OpenResult> {
  let sealed: Sealed
  try { sealed = JSON.parse(dec.decode(unb64(payload))) } catch { return { ok: false, reason: 'broken' } }
  if (sealed?.v !== 1) return { ok: false, reason: 'broken' }
  try {
    const key = await derive(code.trim(), unb64(sealed.s))
    const plain = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.i) }, key, unb64(sealed.d))))
    if (typeof plain.exp !== 'number' || now > plain.exp) return { ok: false, reason: 'expired' }
    if (typeof plain.claude !== 'string' || !plain.claude) return { ok: false, reason: 'broken' }
    return { ok: true, keys: { claude: plain.claude, openai: plain.openai || undefined, model: plain.model || undefined } }
  } catch { return { ok: false, reason: 'code' } }
}
export const pairPrefix = '#pair='
/** Read a pairing link from the address bar and remove it right away, so it doesn't stay in history. */
let taken: string | null | undefined
export function takePairing(): string | null {
  if (taken !== undefined) return taken
  if (!location.hash.startsWith(pairPrefix)) return (taken = null)
  taken = location.hash.slice(pairPrefix.length) || null
  history.replaceState(null, '', location.pathname + location.search + '#today')
  return taken
}
