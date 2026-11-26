import { useState } from 'react'
import { askTutor, tutorKey } from '../lib/tutor'
import './tutor.css'

import { diagKey, parseDiagnosis, type Diagnosis } from '../lib/diagnosis'

/** After a wrong nursing answer: the question, the options and the key words in Chinese, with why each option is right
 *  or wrong. The answer is already shown by then, so choosing again in Chinese could not tell the English from the
 *  nursing concept: he says himself where he thinks he got stuck (one question shows a likely reason, not a sure one). */
export default function DiagnoseBox({ id, context, question, options, answer, picked, notes, onSave, onCause, cause }: {
  id: string; context?: string; question: string; options: string[]; answer: number; picked: number
  notes: Record<string, string>; onSave: (key: string, value: string) => void
  /** Records why it went wrong; the learner's own choice is kept if already made. */
  onCause: (cause: string) => void; cause?: string
}) {
  const cached = (() => { const v = notes[diagKey(id)]; return v ? parseDiagnosis(v, options.length) : null })()
  const [diag, setDiag] = useState<Diagnosis | null>(cached)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!tutorKey()) return null
  async function load() {
    setOpen(true)
    if (diag) return
    setBusy(true); setError('')
    try {
      const system = [
        '你在幫台灣護理系學生（英文國中程度）分辨他答錯護理英文題，是因為看不懂英文，還是護理觀念不熟。',
        '把題目和每個選項翻成自然的繁體中文（翻譯不能暗示哪個是答案），列出題目裡最關鍵的 3–6 個英文字，並用繁體中文一句話說明每個選項為什麼對或錯。',
        '只輸出 JSON：{"questionZh":"題目中文","optionsZh":["選項中文",...],"words":[{"en":"英文字","zh":"中文"}],"why":["第1個選項為什麼對或錯",...]}',
      ].join('\n')
      const user = [context ? '情境：' + context : '', '題目：' + question, '選項：' + options.map((o, i) => (i + 1) + '. ' + o).join(' / '), '正確答案：第 ' + (answer + 1) + ' 個'].filter(Boolean).join('\n')
      const reply = await askTutor(system, [{ role: 'user', content: user }])
      const d = parseDiagnosis(reply, options.length)
      if (!d) { setError('拆解的格式怪怪的，再按一次試試。'); return }
      setDiag(d); onSave(diagKey(id), JSON.stringify(d))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const kinds = [['看不懂英文', '看中文就懂了：多半卡在英文'], ['護理觀念不熟', '看中文也不太確定：多半是護理觀念']] as const
  if (!open) return <button type="button" className="pr-link dg-open" onClick={load}>看中文對照：題目、選項和關鍵字</button>
  return <section className="dg" aria-live="polite">
    {busy && <p className="tu-wait">翻成中文中……</p>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {diag && <>
      <strong>這題的中文</strong>
      <p>{diag.questionZh}</p>
      <ol className="dg-why">{diag.optionsZh.map((o, i) => <li key={i} data-ok={i === answer}>
        <span>{o}{i === answer ? '（答案）' : i === picked ? '（你選的）' : ''}</span>{diag.why[i] && <small>{diag.why[i]}</small>}
      </li>)}</ol>
      {diag.words.length > 0 && <ul className="dg-words">{diag.words.map(w => <li key={w.en}><b lang="en">{w.en}</b> {w.zh}</li>)}</ul>}
      <p className="dg-ask">看了中文，你覺得剛剛卡在哪？答案已經看過了，單看這一題分不出確定的原因，照你自己的感覺選。</p>
      <div className="pr-options">{kinds.map(([k, label]) => <button key={k} type="button" aria-pressed={cause === k} disabled={!!cause && cause !== k} onClick={() => { if (!cause) onCause(k) }}>{label}</button>)}</div>
      {cause && !kinds.some(([k]) => k === cause) && <small>你剛剛選的是「{cause}」，會照你選的記。</small>}
    </>}
  </section>
}
