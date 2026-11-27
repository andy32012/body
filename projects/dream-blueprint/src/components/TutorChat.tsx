import { useEffect, useRef, useState } from 'react'
import { askTutor, ClaudeIncomplete, isSentenceFeedbackField, sentenceJudgement, tutorKey, tutorSystem, type TutorSentence, type TutorTurn } from '../lib/tutor'
import { RubricScore } from './RubricTable'
import { answered, questionMarkNote, sameEnglish } from '../lib/evidence'
import { updateStore, useAppStore } from '../lib/store'
import { dayKey } from '../lib/progress'
import { addWeak, easeWeak, takeWeakLines, weakLines } from '../lib/weakPoints'
import curriculum from '../data/curriculum.json'
import './tutor.css'

const verdictNames = { good: '對了', small: '小錯', again: '再試一次', changed: '意思不一樣' }

const squash = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '')
type ChatTurn = TutorTurn & { submission: boolean }
const isTry = (t: ChatTurn) => t.role === 'user' && t.submission
const submissionText = (content: string) => content.replace(/^(我的翻譯|我改成)：/, '')

/** onReveal fires when he asks for a clearer hint (or Claude's reply gives the answer away anyway): it counts as help. */
export default function TutorChat({ sentence, answer, onReveal, onVerdict, onError, autoSend = false, trackWeak = true }: {
  sentence: TutorSentence; answer: string; onReveal?: () => void
  /** Claude's verdict on each submitted try (1 = the first try, before any feedback), with the exact text it judged. */
  onVerdict?: (verdict: 'good' | 'small' | 'again' | 'changed', attempt: number, text: string) => void
  /** Claude could not be reached, so the caller can open another way on (the reference sentence). */
  onError?: () => void
  /** Send the answer for checking as soon as the box opens (「請 Claude 批改」 was pressed above). */
  autoSend?: boolean
  /** Update weak points only for the scored run, not when the learner revisits an already scored sentence. */
  trackWeak?: boolean
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  // The weak points this sentence has added (each kind once per sentence, however many tries it takes).
  const [noted, setNoted] = useState<string[]>([])
  const abort = useRef<AbortController | null>(null)
  // One check at a time: a second press while one is on its way sends nothing (each one is a paid request).
  const sending = useRef(false)
  const sentOnOpen = useRef(false)
  // The units before the current one are the rules he has learned: those get layered hints, the rest are taught directly.
  const { state } = useAppStore()
  useEffect(() => {
    if (!autoSend || sentOnOpen.current || !tutorKey() || !answered(answer)) return
    sentOnOpen.current = true
    void send('我的翻譯：' + answer.trim(), true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Leaving the sentence cancels a check still on its way, so a late reply never lands after he has moved on.
  useEffect(() => () => abort.current?.abort(), [])
  if (!tutorKey()) return null
  const learned = curriculum.units.filter(u => u.unit < state.curriculum.unit).map(u => u.unit + '. ' + u.title)

  async function send(content: string, submission = false) {
    if (!content.trim() || busy || sending.current) return
    const text = submissionText(content)
    if (submission && !answered(text)) return
    const punctuation = submission ? questionMarkNote(text, sentence.reference) : null
    if (punctuation) {
      setError(punctuation)
      return
    }
    sending.current = true
    const next: ChatTurn[] = [...turns, { role: 'user', content, submission }]
    setTurns(next); setBusy(true); setError('')
    abort.current = new AbortController()
    try {
      const today = dayKey()
      const messages = next.map(turn => ({
        role: turn.role,
        content: turn.role === 'user' && !turn.submission ? '我的問題：' + turn.content : turn.content,
      }))
      const reply = await askTutor(tutorSystem(sentence, learned, weakLines(state.notes, today)), messages, abort.current.signal)
      if (abort.current.signal.aborted) return
      const judgement = submission ? sentenceJudgement(reply) : null
      // A try has to come back as a real check (判定, a 0–2 score and why). Anything else is not counted or kept, and the
      // same sentence goes again; the first check that does count is the first try.
      if (submission && !judgement) {
        setTurns(turns)
        setError('Claude 這次沒有照格式給「得分」和「判定」，這次不算，也不會記錄。按下面的按鈕，把同一句再送一次。')
        return
      }
      setTurns([...next, { role: 'assistant', content: reply, submission }])
      const tries = next.filter(isTry).length
      const v = judgement?.verdict ?? null
      if (v) onVerdict?.(v, tries, text)
      // The shared weak-point list: what this try got wrong, or — written right the first time — one miss lighter.
      if (v && trackWeak) {
        const fresh = v === 'good' ? [] : takeWeakLines(reply).labels.filter(k => !noted.includes(k))
        if (fresh.length) {
          setNoted(n => [...n, ...fresh])
          updateStore(prev => ({ ...prev, notes: fresh.reduce((notes, k) => addWeak(notes, k, today, { w: text, r: sentence.reference[0] ?? '' }, 'tutor'), prev.notes) }))
        } else if (v === 'good' && tries === 1) {
          updateStore(prev => ({ ...prev, notes: sentence.grammar.reduce((notes, g) => easeWeak(notes, g), prev.notes) }))
        }
      }
      if (v !== 'good' && sentence.reference.some(r => squash(r).length > 6 && squash(reply).includes(squash(r)))) onReveal?.()
    } catch (e) {
      if (abort.current?.signal.aborted) return
      setTurns(turns)
      setError(e instanceof Error ? e.message : String(e))
      // A reply cut off or declined is not Claude out of reach: asking again is the way on, the reference stays hidden.
      if (!(e instanceof ClaudeIncomplete)) onError?.()
    } finally { sending.current = false; setBusy(false) }
  }

  const attempts = turns.filter(isTry).length
  const lastIndex = turns.map(t => t.role === 'assistant' && t.submission).lastIndexOf(true)
  const lastJudged = lastIndex < 1 ? null : sentenceJudgement(turns[lastIndex].content)
  const verdict = lastJudged?.verdict ?? null
  const sentText = lastIndex < 1 ? '' : submissionText(turns[lastIndex - 1].content)
  const edited = !!verdict && !!sentText && !sameEnglish(sentText, answer)

  return <section className="tu-box" aria-live="polite">
    <strong>Claude 老師</strong>
    {turns.map((t, i) => <div key={i} className={'tu-turn tu-' + t.role}>
      {t.content.split('\n').map((line, j) => line.trim() && !(t.role === 'assistant' && t.submission && isSentenceFeedbackField(line)) ? <p key={j}>{line}</p> : null)}
    </div>)}
    {busy && <p className="tu-wait">Claude 在看你寫的……</p>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {verdict && <p className="tu-verdict">判定：<b>{verdictNames[verdict]}</b>{edited && <small>（這是你改之前那一版的判定；改過的答案還沒批改）</small>}</p>}
    {verdict && lastJudged?.score !== null && lastJudged?.score !== undefined && <RubricScore id="gept-sentence" score={lastJudged.score} />}
    {noted.length > 0 && <p className="tu-weak">記進「我的弱點」：{noted.join('、')}<small>（Emma 和之後的批改都會特別注意）</small></p>}
    <div className="pr-actions">
      {attempts === 0
        ? <button type="button" className="pr-main" disabled={busy || !answered(answer)} onClick={() => send('我的翻譯：' + answer.trim(), true)}>請 Claude 批改</button>
        : <button type="button" className="pr-main" disabled={busy || !answered(answer)} onClick={() => send('我改成：' + answer.trim(), true)}>改好了，請 Claude 再批一次</button>}
      {attempts > 0 && verdict !== 'good' && <button className="pr-link" disabled={busy} onClick={() => { onReveal?.(); void send('我還是不會，再給我一個更清楚的提示（不要給整句答案）。') }}>再給我一個提示</button>}
    </div>
    {attempts > 0 && <form className="tu-ask" onSubmit={e => {
      e.preventDefault()
      void send(question.trim())
      setQuestion('')
    }}>
      <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="例如：為什麼不用 being？" aria-label="問 Claude" />
      <button type="submit" disabled={busy || !question.trim()}>問</button>
    </form>}
  </section>
}
