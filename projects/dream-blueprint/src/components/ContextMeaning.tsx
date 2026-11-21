import { useState } from 'react'
import { askTutor, tutorKey } from '../lib/tutor'

const SYSTEM = '你是英文老師。用繁體中文說出這個英文字在這段短文裡的意思，格式「（詞性）意思」，8 到 14 個字，只寫這一個意思，不要其他文字。'

/** The meaning a word has in this passage (word lists give several senses). Asked once, then remembered. */
export default function ContextMeaning({ word, context, cacheKey, notes, onSave }: {
  word: string; context: string; cacheKey: string; notes: Record<string, string>; onSave: (key: string, value: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const saved = notes[cacheKey]
  if (saved) return <span className="ctx-meaning">這裡：{saved}</span>
  if (!tutorKey()) return null
  return <button type="button" className="ctx-ask" disabled={busy} onClick={async () => {
    setBusy(true); setFailed(false)
    try {
      const reply = (await askTutor(SYSTEM, [{ role: 'user', content: '短文：' + context + '\n單字：' + word }])).split('\n')[0].trim().slice(0, 30)
      if (reply) onSave(cacheKey, reply)
    } catch { setFailed(true) } finally { setBusy(false) }
  }}>{busy ? '查詢中…' : failed ? '再試一次' : '這裡的意思'}</button>
}
