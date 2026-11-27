import { useEffect, useState } from 'react'
import { chooseDraft, draftVersions, watchDraft, writeDraft } from '../lib/drafts'

/** Each version stays available after closing a tab, until the learner explicitly chooses one. */
export default function DraftVersions({ id, text, onChoose, disabled = false, legacyId, onChooseLegacy }: {
  id: string; text: string; onChoose: (text: string) => void; disabled?: boolean
  legacyId?: string; onChooseLegacy?: () => void
}) {
  const [saved, setSaved] = useState(() => ({
    id, legacyId, versions: draftVersions(id), legacy: legacyId ? draftVersions(legacyId) : [],
  }))
  useEffect(() => {
    const refresh = () => setSaved({
      id, legacyId, versions: draftVersions(id), legacy: legacyId ? draftVersions(legacyId) : [],
    })
    const stop = watchDraft(id, refresh)
    const stopLegacy = legacyId ? watchDraft(legacyId, refresh) : undefined
    refresh()
    return () => { stop(); stopLegacy?.() }
  }, [id, legacyId])
  if (saved.id !== id || saved.legacyId !== legacyId) return null
  const alternatives = [...new Set(saved.versions.map(v => v.text))].filter(value => value !== text)
  const legacy = [...new Set(saved.legacy.map(v => v.text))]
    .filter(value => value !== text && !alternatives.includes(value))
  function select(value: string) {
    chooseDraft(id, value, saved.versions)
    onChoose(value)
  }
  function restore(value: string) {
    writeDraft(id, value)
    onChoose(value)
    onChooseLegacy?.()
  }
  return <>
    {alternatives.length > 0 && <details className="pr-reference">
      <summary>這一題有其他分頁的草稿，查看並選擇</summary>
      <p>選定後會把選的文字放進作答欄，並取代這裡列出的其他版本。</p>
      {text.trim() && <button type="button" className="pr-link" disabled={disabled} onClick={() => select(text)}>保留作答欄的版本</button>}
      {alternatives.map(value => <section key={value}>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} lang="en">{value}</p>
        <button type="button" className="pr-link" disabled={disabled} onClick={() => select(value)}>使用上面這版草稿</button>
      </section>)}
    </details>}
    {legacy.length > 0 && <details className="pr-reference">
      <summary>查看舊版草稿</summary>
      <p>舊版沒有記下這段文字是哪一次練習寫的。確認是這一題的作答，再放進現在的作答欄。</p>
      {legacy.map(value => <section key={value}>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} lang="en">{value}</p>
        <button type="button" className="pr-link" disabled={disabled} onClick={() => restore(value)}>將這份舊草稿放入作答欄</button>
      </section>)}
    </details>}
  </>
}
