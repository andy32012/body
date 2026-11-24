import { useEffect, useRef, useState } from 'react'
import { askTutor, tutorKey, type TutorTurn } from '../lib/tutor'
import { fixToCard, type SayCard } from '../lib/sayCards'
import { isAbort } from '../lib/answerGate'
import { learnedFor, learnedLines } from '../lib/learned'
import { useAppStore } from '../lib/store'
import { FULL_ASK, chatTurns, correctionSystem, hintGivesAway, parseCorrection, stageFor, verdictNames, type Result, type Stage } from '../lib/correction'
import './tutor.css'

export type { Result } from '../lib/correction'

/** Claude checks the answer. With selfFix (every practice page uses it) the first two checks give hints only —
 *  where the mistake is and what kind, then a clearer hint — so he fixes it himself; the corrected text comes on the
 *  third check, or when he asks for it (看完整批改), which counts as seeing the answer.
 *  With onSave, each fix in the full correction can become a review card so the mistake comes back later. */
export default function CorrectBox({ zh, reference, words, answer, run, onSave, onResult, onReveal, onError, onOk, mode = 'translate', restore, previous, selfFix = false }: {
  zh: string; reference?: string; words?: string[]; answer: string; run: number
  onSave?: (card: SayCard) => void; onResult?: (verdict: Result['verdict'], fixes: number, result: Result) => void; mode?: 'translate' | 'open'
  /** Feedback saved earlier (shown again after a reload, without asking Claude again). */
  restore?: { answer: string; result: Result }
  /** The feedback on the earlier try, so Claude can say which of those issues are now fixed. */
  previous?: Result
  /** Hints first, the corrected text later (see above). */
  selfFix?: boolean
  onReveal?: () => void
  /** Claude could not be reached (no network, a refused key…), so the caller can offer another way on. */
  onError?: () => void
  /** A request worked again after a failure. */
  onOk?: () => void
}) {
  const { state } = useAppStore()
  const [saved, setSaved] = useState<number[]>([])
  const [turns, setTurns] = useState<TutorTurn[]>(() => restore ? [{ role: 'user', content: '我的翻譯：' + restore.answer }, { role: 'assistant', content: JSON.stringify(restore.result) }] : [])
  const [result, setResult] = useState<Result | null>(() => restore?.result ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  // How many checks this answer has had: the first two give hints only.
  const tries = useRef(restore ? 1 : 0)
  const [stage, setStage] = useState<Stage>(() => restore?.result.partial ? 'hint1' : 'full')
  // Hints are opened one at a time; -1 shows the whole result.
  const [hints, setHints] = useState(() => restore?.result.partial ? 1 : -1)
  const learned = learnedLines(learnedFor(state, { id: '', reference: [''], newWords: [] }))
  const sys = (s: Stage) => correctionSystem({ zh, reference, words, mode, previous, stage: s, learned })

  async function send(next: TutorTurn[], kind: 'first' | 'full' | 'chat', s: Stage) {
    setBusy(true); setError('')
    try {
      const reply = await askTutor(sys(s), next)
      onOk?.()
      if (kind === 'chat') { setTurns([...next, { role: 'assistant', content: reply }]); return }
      const parsed = parseCorrection(reply, kind === 'full' ? 'full' : s)
      setTurns([...next, { role: 'assistant', content: reply }])
      if (!parsed) { setError('老師回得格式怪怪的，下面是原文：\n' + reply); return }
      if (kind === 'full') { setResult({ ...parsed, verdict: result?.verdict ?? parsed.verdict }); setStage('full'); setHints(-1); return }
      setResult(parsed)
      onResult?.(parsed.verdict, parsed.fixes.length, parsed)
      // A third check that still finds mistakes hands over the corrected text: that is seeing the answer.
      if (s === 'full' && selfFix && parsed.verdict !== 'good' && parsed.fixes.length) onReveal?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (!isAbort(e)) onError?.()
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!run) return
    setResult(null); setQuestion(''); setTurns([]); setError(''); setSaved([])
    if (!tutorKey()) { setError('還沒連接 Claude：到「設定 → 連接 Claude」貼上 API 金鑰就能用。'); onError?.(); return }
    if (!answer.trim()) { setError('先寫一點英文再按批改。'); return }
    tries.current += 1
    const s = stageFor(tries.current, selfFix)
    setStage(s); setHints(s === 'full' ? -1 : 1)
    const first: TutorTurn[] = [{ role: 'user', content: '我的翻譯：' + answer.trim() }]
    setTurns(first); void send(first, 'first', s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])
  if (!run && !restore && !result) return null

  /** He asks for the corrected text after the hints: Claude is asked again in the full format. */
  function showFull() {
    if (busy) return
    onReveal?.()
    void send([...turns, { role: 'user', content: FULL_ASK }], 'full', stage)
  }

  // The request for the full correction and its JSON reply are not part of the chat shown below.
  const followUps = chatTurns(turns.slice(2))
  const hinting = !!result?.partial
  return <section className="tu-box" aria-live="polite">
    {busy && !result && <p className="tu-wait">批改中……</p>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {result && previous?.fixes.length && (result.resolved || result.still) ? <ul className="tu-progress" aria-label="上次的問題">
      {previous.fixes.map((f, i) => {
        const ok = result.resolved?.includes(i) ?? false
        return <li key={i} data-ok={ok}><span>{ok ? '✓ 改好了' : '✗ 還沒改好'}</span> <span lang="en">{f.wrong || '（漏寫）'}{f.right ? ' → ' + f.right : ''}</span></li>
      })}
    </ul> : null}
    {result && hinting && result.verdict !== 'good' && result.fixes.length > 0 && <section className="tu-self">
      <div className="tu-head"><strong>先自己改</strong><span className={'tu-badge tu-' + result.verdict}>{verdictNames[result.verdict]}</span></div>
      <p className="tu-help">有 {result.fixes.length} 個地方要改。照提示自己改，改好再批一次{stage === 'hint2' ? '（這次提示比較清楚）' : ''}；第三次還沒改好會給你完整批改。</p>
      <ol className="tu-fixes">{result.fixes.slice(0, hints < 0 ? undefined : hints).map((f, i) => <li key={i}>
        <span>問題在：<b lang="en">{f.wrong || '（這裡漏寫了一部分）'}</b>{f.type ? <> · {f.type}</> : null}</span>
        {f.learned === false && <small className="tu-new">這個還沒教過，先學起來：</small>}
        {/* A hint that quotes the answer is replaced by its kind, so the answer stays hidden. */}
        <small>{reference && f.hint && hintGivesAway(f.hint, [reference]) ? '這裡的' + (f.type ?? '寫法') + '再想一下。' : f.hint}</small>
      </li>)}</ol>
      {result.note && !(reference && hintGivesAway(result.note, [reference])) && <p className="tu-note">{result.note}</p>}
      <div className="pr-actions">
        {hints >= 0 && hints < result.fixes.length && <button type="button" onClick={() => setHints(hints + 1)}>下一個提示</button>}
        <button type="button" className="pr-link" disabled={busy} onClick={showFull}>{busy ? '老師在寫……' : '看完整批改'}</button>
      </div>
    </section>}
    {result && hinting && (result.verdict === 'good' || !result.fixes.length) && <>
      <div className="tu-head"><strong>批改</strong><span className={'tu-badge tu-' + result.verdict}>{verdictNames[result.verdict]}</span></div>
      <p className="tu-corrected" lang="en">{answer.trim()}</p>
      {result.note && <p className="tu-note">{result.note}</p>}
    </>}
    {result && !hinting && <>
      <div className="tu-head"><strong>批改</strong><span className={'tu-badge tu-' + result.verdict}>{verdictNames[result.verdict]}</span></div>
      <p className="tu-corrected" lang="en">{result.corrected}</p>
      {result.fixes.length > 0 && <ul className="tu-fixes">
        {result.fixes.map((f, i) => {
          const card = onSave ? fixToCard(f) : null
          return <li key={i}>
            <span lang="en"><s>{f.wrong || '（漏寫）'}</s>{f.right ? <> → <b>{f.right}</b></> : null}</span>
            <small>{f.why}</small>
            {card && <button type="button" className="tu-save" disabled={saved.includes(i)}
              onClick={() => { onSave?.(card); setSaved(list => [...list, i]) }}>{saved.includes(i) ? '已加入複習' : '加入複習'}</button>}
          </li>
        })}
      </ul>}
      {onSave && result.fixes.length > 1 && saved.length < result.fixes.length &&
        <button type="button" className="tu-save tu-save-all" onClick={() => {
          result.fixes.forEach((f, i) => { const card = fixToCard(f); if (card && !saved.includes(i)) onSave(card) })
          setSaved(result.fixes.map((_, i) => i))
        }}>全部加入複習</button>}
      {result.note && <p className="tu-note">{result.note}</p>}
      {followUps.map((t, i) => <div key={i} className={'tu-turn tu-' + t.role}>
        {t.content.split('\n').map((line, j) => line.trim() ? <p key={j}>{line}</p> : null)}
      </div>)}
      {busy && <p className="tu-wait">想一下……</p>}
      <form className="tu-ask" onSubmit={e => { e.preventDefault(); const q = question.trim(); if (!q || busy) return; setQuestion(''); void send([...turns, { role: 'user', content: q }], 'chat', 'full') }}>
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="有問題就問，例如：為什麼用 were？" />
        <button type="submit" disabled={busy || !question.trim()}>問</button>
      </form>
    </>}
  </section>
}
