import { useRef, useState } from 'react'
import { askTutor, tutorKey } from '../lib/tutor'

const parts = new Set(['名詞', '動詞', '形容詞', '副詞', '介系詞', '連接詞', '代名詞', '限定詞', '助動詞', '感嘆詞', '片語'])
const SYSTEM = '你是英文老師。只回傳一個 JSON 物件，含 part（詞性）和 meaning（這個字在本段的繁體中文詞義，最多 24 字）。part 必須是以下之一：' +
  [...parts].join('、') + '。判斷不出詞義就回傳 null，不要用說明代替詞義。'

function validDefinition(part: unknown, meaning: unknown) {
  if (typeof part !== 'string' || !parts.has(part.trim()) || typeof meaning !== 'string') return null
  const text = meaning.trim()
  if (text.length > 24 || !/\p{Script=Han}/u.test(text) || /[\r\n<>。！？]/.test(text) ||
      /^(?:抱歉|很抱歉|對不起|無法|不能確定|請提供|請補充|未能|找不到|不確定|不清楚|沒有足夠)/.test(text)) return null
  return '（' + part.trim() + '）' + text
}

function replyDefinition(reply: string) {
  try {
    const unwrapped = reply.trim().replace(/^```(?:json)?\s*\n([\s\S]+?)\n```$/i, '$1')
    const parsed = JSON.parse(unwrapped)
    return validDefinition(parsed?.part, parsed?.meaning)
  } catch { return null }
}

function savedDefinition(raw: string) {
  const old = raw.match(/^[（(]([^()（）]+)[）)]([^\n\r]+)$/)
  return old ? validDefinition(old[1], old[2]) : null
}

/** The meaning a word has in this passage (word lists give several senses). */
export default function ContextMeaning({ word, context, cacheKey, notes, onSave }: {
  word: string; context: string; cacheKey: string; notes: Record<string, string>; onSave: (key: string, value: string) => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState<string>()
  const request = useRef(false)
  const saved = savedDefinition(notes[cacheKey] ?? '')
  async function ask() {
    if (request.current) return
    request.current = true
    setBusy(true)
    setFailed(false)
    let result = pending
    try {
      if (!result) {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 5 * 60_000)
        try {
          const reply = await askTutor(SYSTEM, [{ role: 'user', content: '短文：' + context + '\n單字：' + word }], controller.signal)
          result = replyDefinition(reply) ?? undefined
        } finally { window.clearTimeout(timeout) }
      }
      if (!result) { setFailed(true); return }
      setPending(result)
      await onSave(cacheKey, result)
      setPending(undefined)
    } catch { setFailed(true) }
    finally {
      request.current = false
      setBusy(false)
    }
  }
  return <>
    {(pending ?? saved) && <span className="ctx-meaning">這裡：{pending ?? saved}</span>}
    {(pending || tutorKey()) && <button type="button" className="ctx-ask" disabled={busy} onClick={() => void ask()}>
      {busy ? '處理中…' : pending ? '詞義尚未存下，重試儲存' : failed ? '沒查到詞義，再試一次' : saved ? '重新查詞義' : '這裡的意思'}
    </button>}
  </>
}
