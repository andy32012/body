import { useEffect, useState } from 'react'
import { chooseDraft, draftVersions, watchDraft } from '../lib/drafts'

/** Each version stays available after closing a tab, until the learner explicitly chooses one. */
export default function DraftVersions({ id, text, onChoose, disabled = false }: {
  id: string; text: string; onChoose: (text: string) => void; disabled?: boolean
}) {
  const [saved, setSaved] = useState(() => ({ id, versions: draftVersions(id) }))
  useEffect(() => {
    const refresh = () => setSaved({ id, versions: draftVersions(id) })
    const stop = watchDraft(id, refresh)
    refresh()
    return stop
  }, [id])
  if (saved.id !== id || !saved.versions.some(v => v.text !== text)) return null
  const alternatives = [...new Set(saved.versions.map(v => v.text))].filter(value => value !== text)
  function select(value: string) {
    chooseDraft(id, value, saved.versions)
    onChoose(value)
  }
  return <details className="pr-reference">
    <summary>這一題有其他分頁的草稿，查看並選擇</summary>
    <p>選定後會把選的文字放進作答欄，並取代這裡列出的其他版本。</p>
    {text.trim() && <button type="button" className="pr-link" disabled={disabled} onClick={() => select(text)}>保留作答欄的版本</button>}
    {alternatives.map(value => <section key={value}>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} lang="en">{value}</p>
      <button type="button" className="pr-link" disabled={disabled} onClick={() => select(value)}>使用上面這版草稿</button>
    </section>)}
  </details>
}
