import { useState } from 'react'
import { askTutor, tutorKey } from '../lib/tutor'
import './tutor.css'

import { diagKey, parseDiagnosis, type Diagnosis } from '../lib/diagnosis'

/** After a wrong nursing answer: read the question and options in Chinese and choose again.
 *  Right in Chinese means the English was the problem; still wrong means the nursing concept was. */
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
  const [again, setAgain] = useState<number>()
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
  function repick(i: number) {
    if (again !== undefined) return
    setAgain(i)
    if (!cause) onCause(i === answer ? '看不懂英文' : '護理觀念不熟')
  }
  if (!open) return <button type="button" className="pr-link dg-open" onClick={load}>用中文再選一次：分出是英文還是觀念的問題</button>
  return <section className="dg" aria-live="polite">
    {busy && <p className="tu-wait">翻成中文中……</p>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {diag && <>
      <strong>看中文，你現在會選哪個？</strong>
      <p>{diag.questionZh}</p>
      <div className="pr-options">{diag.optionsZh.map((o, i) => <button key={i} type="button" disabled={again !== undefined} aria-pressed={again === i}
        className={again === undefined ? undefined : i === answer ? 'qz-right' : i === again ? 'qz-wrong' : undefined} onClick={() => repick(i)}>{o}</button>)}</div>
      {again !== undefined && <>
        <p className="dg-verdict" data-kind={again === answer ? 'english' : 'concept'}>{again === answer
          ? '看中文就選對了：這題卡在英文。把下面這幾個字記起來，下次看英文就懂。'
          : '看中文還是選' + (again === picked ? '一樣的' : '錯') + '：這題卡在護理觀念，英文不是主要問題。看一下每個選項為什麼對或錯。'}</p>
        {again === answer && diag.words.length > 0 && <ul className="dg-words">{diag.words.map(w => <li key={w.en}><b lang="en">{w.en}</b> {w.zh}</li>)}</ul>}
        {again !== answer && diag.why.length > 0 && <ol className="dg-why">{diag.why.map((w, i) => <li key={i} data-ok={i === answer}><span lang="en">{options[i]}</span><small>{w}</small></li>)}</ol>}
        {cause && cause !== (again === answer ? '看不懂英文' : '護理觀念不熟') && <small>你剛剛選的是「{cause}」，會照你選的記。</small>}
      </>}
    </>}
  </section>
}
