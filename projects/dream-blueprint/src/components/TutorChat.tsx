import { useEffect, useRef, useState } from 'react'
import { askTutor, ClaudeIncomplete, looksLikeTry, sentenceScoreOf, tutorKey, tutorSystem, verdictOf, type TutorSentence, type TutorTurn } from '../lib/tutor'
import { settleSentence } from '../lib/rubrics'
import { RubricScore } from './RubricTable'
import { sameEnglish } from '../lib/evidence'
import { updateStore, useAppStore } from '../lib/store'
import { dayKey } from '../lib/progress'
import { addWeak, easeWeak, takeWeakLines, weakLines } from '../lib/weakPoints'
import curriculum from '../data/curriculum.json'
import './tutor.css'

const verdictNames = { good: '對了', small: '小錯', again: '再試一次', changed: '意思不一樣' }

const squash = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '')
const isTry = (t: TutorTurn) => t.role === 'user' && (t.content.startsWith('我的翻譯') || t.content.startsWith('我改成'))
/** Claude's verdict and 單句寫作 score on one reply, made to agree (the stricter one wins). */
const judged = (reply: string) => { const v = verdictOf(reply); return v ? settleSentence(v, sentenceScoreOf(reply)) : null }

/** onReveal fires when Claude hands over the answer, so it counts the same as opening the reference. */
export default function TutorChat({ sentence, answer, onReveal, onVerdict, onError, onRevise, autoSend = false }: {
  sentence: TutorSentence; answer: string; onReveal?: () => void
  /** Claude's verdict on each submitted try (1 = the first try, before any feedback), with the exact text it judged. */
  onVerdict?: (verdict: 'good' | 'small' | 'again' | 'changed', attempt: number, text: string) => void
  /** Claude could not be reached, so the caller can open another way on (the reference sentence). */
  onError?: () => void
  /** A corrected sentence typed in the question box: the caller puts it in the answer box, so marking uses it. */
  onRevise?: (text: string) => void
  /** Send the answer for checking as soon as the box opens (「請 Claude 批改」 was pressed above). */
  autoSend?: boolean
}) {
  const [turns, setTurns] = useState<TutorTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  // The weak points this sentence has added (each kind once per sentence, however many tries it takes).
  const [noted, setNoted] = useState<string[]>([])
  const abort = useRef<AbortController | null>(null)
  const sentOnOpen = useRef(false)
  // The units before the current one are the rules he has learned: those get layered hints, the rest are taught directly.
  const { state } = useAppStore()
  useEffect(() => {
    if (!autoSend || sentOnOpen.current || !tutorKey() || !answer.trim()) return
    sentOnOpen.current = true
    void send('我的翻譯：' + answer.trim())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!tutorKey()) return null
  const learned = curriculum.units.filter(u => u.unit < state.curriculum.unit).map(u => u.unit + '. ' + u.title)

  async function send(content: string) {
    if (!content.trim() || busy) return
    const next: TutorTurn[] = [...turns, { role: 'user', content }]
    setTurns(next); setBusy(true); setError('')
    abort.current = new AbortController()
    try {
      const today = dayKey()
      const reply = await askTutor(tutorSystem(sentence, learned, weakLines(state.notes, today)), next, abort.current.signal)
      setTurns([...next, { role: 'assistant', content: reply }])
      const tries = next.filter(isTry).length
      const v = judged(reply)?.verdict ?? null
      const attempt = content.startsWith('我的翻譯') || content.startsWith('我改成')
      const text = content.replace(/^(我的翻譯|我改成)：/, '')
      if (v && attempt) onVerdict?.(v, tries, text)
      // The shared weak-point list: what this try got wrong, or — written right the first time — one miss lighter.
      if (v && attempt) {
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
      setTurns(turns)
      setError(e instanceof Error ? e.message : String(e))
      // A reply cut off or declined is not Claude out of reach: asking again is the way on, the reference stays hidden.
      if (!(e instanceof ClaudeIncomplete)) onError?.()
    } finally { setBusy(false) }
  }

  const attempts = turns.filter(isTry).length
  const last = [...turns].reverse().find(t => t.role === 'assistant')
  const lastJudged = last ? judged(last.content) : null
  const verdict = lastJudged?.verdict ?? null
  const lastSent = [...turns].reverse().find(isTry)
  const sentText = lastSent?.content.replace(/^(我的翻譯|我改成)：/, '') ?? ''
  const edited = !!verdict && !!sentText && !sameEnglish(sentText, answer)

  return <section className="tu-box" aria-live="polite">
    <strong>Claude 老師</strong>
    {turns.map((t, i) => <div key={i} className={'tu-turn tu-' + t.role}>
      {t.content.split('\n').map((line, j) => line.trim() && !/^(判定|弱點|得分)[：:]/.test(line.trim()) ? <p key={j}>{line}</p> : null)}
    </div>)}
    {busy && <p className="tu-wait">Claude 在看你寫的……</p>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {verdict && <p className="tu-verdict">判定：<b>{verdictNames[verdict]}</b>{edited && <small>（這是你改之前那一版的判定；改過的答案還沒批改）</small>}</p>}
    {verdict && lastJudged?.score !== null && lastJudged?.score !== undefined && <RubricScore id="gept-sentence" score={lastJudged.score} />}
    {noted.length > 0 && <p className="tu-weak">記進「我的弱點」：{noted.join('、')}<small>（Emma 和之後的批改都會特別注意）</small></p>}
    <div className="pr-actions">
      {attempts === 0
        ? <button className="pr-main" disabled={busy || !answer.trim()} onClick={() => send('我的翻譯：' + answer.trim())}>請 Claude 批改</button>
        : <button className="pr-main" disabled={busy || !answer.trim()} onClick={() => send('我改成：' + answer.trim())}>改好了，請 Claude 再批一次</button>}
      {attempts > 0 && verdict !== 'good' && <button className="pr-link" disabled={busy} onClick={() => { onReveal?.(); void send('我還是不會，請直接給答案並完整講原因。') }}>直接告訴我</button>}
    </div>
    {attempts > 0 && <form className="tu-ask" onSubmit={e => {
      e.preventDefault()
      const q = question.trim()
      // A corrected sentence typed here (instead of in the answer box) is graded as a new try, so the step can go on.
      if (looksLikeTry(q, answer, sentence.reference)) { onRevise?.(q); void send('我改成：' + q) } else void send(q)
      setQuestion('')
    }}>
      <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="問 Claude，例如：為什麼不用 being？" />
      <button type="submit" disabled={busy || !question.trim()}>問</button>
    </form>}
  </section>
}
