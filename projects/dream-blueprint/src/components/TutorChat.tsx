import { useRef, useState } from 'react'
import { askTutor, tutorKey, tutorSystem, verdictOf, type TutorSentence, type TutorTurn } from '../lib/tutor'
import { sameEnglish } from '../lib/evidence'
import './tutor.css'

const verdictNames = { good: '對了', small: '小錯', again: '再試一次', changed: '意思不一樣' }

const squash = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '')

/** onReveal fires when Claude hands over the answer, so it counts the same as opening the reference. */
export default function TutorChat({ sentence, answer, onReveal, onVerdict }: {
  sentence: TutorSentence; answer: string; onReveal?: () => void
  /** Claude's verdict on each submitted try (1 = the first try, before any feedback), with the exact text it judged. */
  onVerdict?: (verdict: 'good' | 'small' | 'again' | 'changed', attempt: number, text: string) => void
}) {
  const [turns, setTurns] = useState<TutorTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const abort = useRef<AbortController | null>(null)
  if (!tutorKey()) return null

  async function send(content: string) {
    if (!content.trim() || busy) return
    const next: TutorTurn[] = [...turns, { role: 'user', content }]
    setTurns(next); setBusy(true); setError('')
    abort.current = new AbortController()
    try {
      const reply = await askTutor(tutorSystem(sentence, []), next, abort.current.signal)
      setTurns([...next, { role: 'assistant', content: reply }])
      const tries = next.filter(t => t.role === 'user' && (t.content.startsWith('我的翻譯') || t.content.startsWith('我改成'))).length
      const v = verdictOf(reply)
      if (v && (content.startsWith('我的翻譯') || content.startsWith('我改成'))) onVerdict?.(v, tries, content.replace(/^(我的翻譯|我改成)：/, ''))
      if (verdictOf(reply) !== 'good' && sentence.reference.some(r => squash(r).length > 6 && squash(reply).includes(squash(r)))) onReveal?.()
    } catch (e) {
      setTurns(turns)
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const attempts = turns.filter(t => t.role === 'user' && (t.content.startsWith('我的翻譯') || t.content.startsWith('我改成'))).length
  const last = [...turns].reverse().find(t => t.role === 'assistant')
  const verdict = last ? verdictOf(last.content) : null
  const lastSent = [...turns].reverse().find(t => t.role === 'user' && (t.content.startsWith('我的翻譯') || t.content.startsWith('我改成')))
  const sentText = lastSent?.content.replace(/^(我的翻譯|我改成)：/, '') ?? ''
  const edited = !!verdict && !!sentText && !sameEnglish(sentText, answer)

  return <section className="tu-box" aria-live="polite">
    <strong>Claude 老師</strong>
    {turns.map((t, i) => <div key={i} className={'tu-turn tu-' + t.role}>
      {t.content.split('\n').map((line, j) => line.trim() && !/^判定：/.test(line.trim()) ? <p key={j}>{line}</p> : null)}
    </div>)}
    {busy && <p className="tu-wait">老師在看你寫的……</p>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {verdict && <p className="tu-verdict">判定：<b>{verdictNames[verdict]}</b>{edited && <small>（這是你改之前那一版的判定；改過的答案還沒批改）</small>}</p>}
    <div className="pr-actions">
      {attempts === 0
        ? <button className="pr-main" disabled={busy || !answer.trim()} onClick={() => send('我的翻譯：' + answer.trim())}>請老師批改</button>
        : <button className="pr-main" disabled={busy || !answer.trim()} onClick={() => send('我改成：' + answer.trim())}>改好了，再批一次</button>}
      {attempts > 0 && verdict !== 'good' && <button className="pr-link" disabled={busy} onClick={() => { onReveal?.(); void send('我還是不會，請直接給答案並完整講原因。') }}>直接告訴我</button>}
    </div>
    {attempts > 0 && <form className="tu-ask" onSubmit={e => { e.preventDefault(); send(question.trim()); setQuestion('') }}>
      <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="問老師，例如：為什麼不用 being？" />
      <button type="submit" disabled={busy || !question.trim()}>問</button>
    </form>}
  </section>
}
