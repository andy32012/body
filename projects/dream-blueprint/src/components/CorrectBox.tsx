import { useEffect, useRef, useState } from 'react'
import { askTutor, ClaudeIncomplete, tutorKey, type TutorTurn } from '../lib/tutor'
import { fixToCard, type SayCard } from '../lib/sayCards'
import { updateStore } from '../lib/store'
import { dayKey } from '../lib/progress'
import { addWeak } from '../lib/weakPoints'
import type { RubricId } from '../lib/rubrics'
import { correctionPrompt, parseCorrection, verdictNames, type Result } from '../lib/correction'
export type { Result } from '../lib/correction'
import { RubricScore } from './RubricTable'
import { checkSequence } from '../lib/checks'
import { sameEnglish } from '../lib/evidence'
import './tutor.css'

/** One button: Claude rewrites the answer correctly underneath, then the learner can ask follow-ups.
 *  With onSave, each fix can become a review card so the mistake comes back later. */
export default function CorrectBox({ zh, reference, words, answer, run, onSave, onResult, onReveal, onError, onBusy, mode = 'translate', restore, previous, selfFix = false, rubric }: {
  zh: string; reference?: string; words?: string[]; answer: string; run: number
  /** The published table Claude grades by (全民英檢): a score with its level is shown, and the verdict follows it. */
  rubric?: RubricId
  /** `judged`: the exact text Claude judged, so the caller can tell when the answer was changed afterwards. Only the
   *  latest check of a box that is still on screen reports; a slower reply to an earlier check is dropped. */
  onSave?: (card: SayCard) => void; onResult?: (verdict: Result['verdict'], fixes: number, result: Result, judged: string) => void; mode?: 'translate' | 'open'
  /** While Claude is checking (the caller can hold its button, so one press is one check). */
  onBusy?: (busy: boolean) => void
  /** Feedback saved earlier (shown again after a reload, without asking Claude again). */
  restore?: { answer: string; result: Result }
  /** The feedback on the earlier try, so Claude can say which of those issues are now fixed. */
  previous?: Result
  /** Show one issue at a time (where, and why) before the full correction. */
  selfFix?: boolean
  onReveal?: () => void
  /** Claude could not be reached (no network, a refused key…), so the caller can offer another way on. */
  onError?: () => void
}) {
  const [saved, setSaved] = useState<number[]>([])
  const [turns, setTurns] = useState<TutorTurn[]>(() => restore ? [{ role: 'user', content: '我的翻譯：' + restore.answer }, { role: 'assistant', content: JSON.stringify(restore.result) }] : [])
  const [result, setResult] = useState<Result | null>(() => restore?.result ?? null)
  // Feedback shown again after a reload may be from before the tables: only a fresh check without a score gets the note.
  const [restored, setRestored] = useState(!!restore)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A reply that could not be read: kept folded away under the message, never shown as the feedback itself.
  const [raw, setRaw] = useState('')
  const [question, setQuestion] = useState('')
  const sys = correctionPrompt(zh, reference, words, mode, previous, rubric)
  // In self-fix mode the corrected text stays hidden until asked for; a restored result is shown in full.
  const [hints, setHints] = useState(() => restore || !selfFix ? -1 : 1)

  // Each check gets a number; a reply that comes back after a newer check started, or after the box left the screen
  // (another passage), is dropped instead of landing on what is shown now.
  const checks = useRef(checkSequence())
  const lastCheck = useRef(0)
  useEffect(() => { const c = checks.current; c.open(); return () => c.close() }, [])
  const setWaiting = (on: boolean) => { setBusy(on); onBusy?.(on) }
  // One check at a time: pressing again while one is on its way sends nothing (each check is a paid request).
  const inFlight = useRef(false)
  // The text the shown check is about: a draft edited afterwards is marked as not checked yet.
  const [graded, setGraded] = useState(() => restore?.answer ?? '')
  async function send(next: TutorTurn[], first: boolean, mine = lastCheck.current) {
    const current = () => checks.current.isCurrent(mine)
    setWaiting(true); setError(''); setRaw('')
    try {
      const reply = await askTutor(sys, next)
      if (!current()) return
      if (first) {
        const parsed = parseCorrection(reply, rubric)
        setRestored(false)
        setResult(parsed)
        if (parsed) onResult?.(parsed.verdict, parsed.fixes.length, parsed, answer.trim())
        // Each kind of mistake also goes on the shared weak-point list (a second try does not count the same ones again).
        if (parsed?.fixes.length && !previous) {
          const day = dayKey()
          updateStore(prev => ({ ...prev, notes: parsed.fixes.reduce((n, f) => typeof f.tag === 'string' ? addWeak(n, f.tag, day, { w: f.wrong || '（漏寫）', r: f.right }, 'write') : n, prev.notes) }))
        }
        setTurns([...next, { role: 'assistant', content: reply }])
        if (!parsed) { setError(rubric ? '這次 Claude 沒有照評分表給分（格式不對），這一次不算，再按一次批改就好。' : '這次 Claude 回的格式不對，這一次不算，再按一次批改就好。'); setRaw(reply) }
      } else setTurns([...next, { role: 'assistant', content: reply }])
    } catch (e) {
      if (!current()) return
      setError(e instanceof Error ? e.message : String(e))
      // A reply cut off or declined is Claude answering badly once, not Claude out of reach: pressing again is the way on.
      if (!(e instanceof ClaudeIncomplete)) onError?.()
    }
    finally { if (first) inFlight.current = false; if (current()) setWaiting(false) }
  }

  useEffect(() => {
    if (!run || inFlight.current) return
    setResult(null); setQuestion(''); setTurns([]); setError(''); setRaw(''); setSaved([]); setHints(selfFix ? 1 : -1)
    if (!tutorKey()) { setError('還沒連接 Claude：到「設定 → 連接 Claude」貼上 API 金鑰就能用。'); return }
    if (!answer.trim()) { setError('先寫一點英文再按批改。'); return }
    const first: TutorTurn[] = [{ role: 'user', content: '我的翻譯：' + answer.trim() }]
    inFlight.current = true
    setGraded(answer.trim())
    lastCheck.current = checks.current.start()
    setTurns(first); void send(first, true, lastCheck.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])
  if (!run && !restore && !result) return null

  const followUps = turns.slice(2)
  return <section className="tu-box" aria-live="polite">
    {busy && !result && <p className="tu-wait">{rubric ? 'Claude 照評分表批改中……' : 'Claude 批改中……'}</p>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {raw && <details className="tu-raw"><summary>看 Claude 這次回了什麼</summary><p>{raw}</p></details>}
    {result && graded && !sameEnglish(graded, answer) && <p className="tu-help tu-stale">下面是你改之前那一版的批改（<span lang="en">{graded}</span>）；改過的這一版還沒批改，再按一次批改就會看新的。</p>}
    {result && previous?.fixes.length && (result.resolved || result.still) ? <ul className="tu-progress" aria-label="上次的問題">
      {previous.fixes.map((f, i) => {
        const ok = result.resolved?.includes(i) ?? false
        return <li key={i} data-ok={ok}><span>{ok ? '✓ 改好了' : '✗ 還沒改好'}</span> <span lang="en">{f.wrong || '（漏寫）'} → {f.right}</span></li>
      })}
    </ul> : null}
    {result && rubric && (result.score !== undefined && result.rubric ? <RubricScore id={result.rubric} score={result.score} reason={result.reason} />
      : !restored && <p className="tu-help">這次 Claude 沒有照評分表給分（格式不對），判定先照它寫的；改好再批一次就會有分數。</p>)}
    {result && hints >= 0 && result.verdict !== 'good' && result.fixes.length > 0 && <section className="tu-self">
      <div className="tu-head"><strong>先自己改</strong><span className={'tu-badge tu-' + result.verdict}>{verdictNames[result.verdict]}</span></div>
      <p className="tu-help">有 {result.fixes.length} 個地方要改。先看提示自己改，改好再批一次；真的想不出來再看完整批改。</p>
      <ol className="tu-fixes">{result.fixes.slice(0, hints).map((f, i) => <li key={i}>
        <span>問題在：<b lang="en">{f.wrong || '（這裡漏寫了一部分）'}</b></span>
        <small>{f.why}</small>
      </li>)}</ol>
      <div className="pr-actions">
        {hints < result.fixes.length && <button type="button" onClick={() => setHints(hints + 1)}>下一個提示</button>}
        <button type="button" className="pr-link" onClick={() => { setHints(-1); onReveal?.() }}>看完整批改</button>
      </div>
    </section>}
    {result && (hints < 0 || result.verdict === 'good' || !result.fixes.length) && <>
      <div className="tu-head"><strong>Claude 批改</strong><span className={'tu-badge tu-' + result.verdict}>{verdictNames[result.verdict]}</span></div>
      <p className="tu-corrected" lang="en">{result.corrected}</p>
      {result.fixes.length > 0 && <ul className="tu-fixes">
        {result.fixes.map((f, i) => {
          const card = onSave ? fixToCard(f) : null
          return <li key={i}>
            <span lang="en"><s>{f.wrong || '（漏寫）'}</s> → <b>{f.right}</b></span>
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
      <form className="tu-ask" onSubmit={e => { e.preventDefault(); const q = question.trim(); if (!q || busy) return; setQuestion(''); void send([...turns, { role: 'user', content: q }], false) }}>
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="有問題就問，例如：為什麼用 were？" />
        <button type="submit" disabled={busy || !question.trim()}>問</button>
      </form>
    </>}
  </section>
}
