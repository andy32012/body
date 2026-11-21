import { useEffect, useState } from 'react'
import { askTutor, tutorKey, type TutorTurn } from '../lib/tutor'
import { fixToCard, type SayCard } from '../lib/sayCards'
import './tutor.css'

type Fix = { wrong: string; right: string; why: string; zh?: string; en?: string }
type Result = { verdict: 'good' | 'small' | 'again'; corrected: string; fixes: Fix[]; note?: string }
const verdictNames = { good: '全對', small: '小錯', again: '要再練' }

function system(zh: string, reference?: string, words?: string[], mode: 'translate' | 'open' = 'translate') {
  const json = mode === 'open'
    ? '{"verdict":"good|small|again","corrected":"整段修改後的英文","fixes":[{"wrong":"原本的片段","right":"改成","why":"原因","zh":"這一句改好後的中文意思","en":"這一句改好後的完整英文"}],"note":"一句整體建議（可省略）"}'
    : '{"verdict":"good|small|again","corrected":"整段修改後的英文","fixes":[{"wrong":"原本的片段","right":"改成","why":"原因","zh":"這個錯誤所在那一句的中文（照題目原文抄）","en":"那一句改好後的完整英文"}],"note":"一句整體建議（可省略）"}'
  return [
    mode === 'open'
      ? '你是英文老師，批改台灣護理系學生（英文國中程度）的英文短寫作。這是開放題，內容是他自己想的。'
      : '你是英文老師，批改台灣護理系學生（英文國中程度）的中翻英。',
    '題目：' + zh,
    reference ? (mode === 'open' ? '參考寫法（只是一種例子，不要照這個改他的內容）：' : '參考翻譯（寫法不只一種）：') + reference : '',
    words?.length ? (mode === 'open' ? '這課要練的句型：' : '這段要練的單字：') + words.join(', ') : '',
    '',
    '規則：',
    mode === 'open'
      ? '- 保留他的意思和內容，只改文法、用字和不自然的地方。意思和文法對就不要改成更難的說法。沒用到這課的句型，就在 note 提醒一句。'
      : '- 保留他的寫法，只改錯的地方。意思和文法對就不要改成更難或更漂亮的說法。',
    mode === 'open' ? '' : '- 漏翻的句子要補上。',
    '- why 用繁體中文，一句話講清楚規則，像朋友一樣口語。',
    '- 第一次回覆只輸出 JSON，不要其他文字：' + json,
    '- 同一句有好幾個錯，合成一個 fix 就好；只是標點或大小寫的小問題不用列。',
    '- 全對時 fixes 是空陣列。',
    '- 之後他追問時，用繁體中文正常回答，講清楚規則和例句，段落短一點，不要 JSON、不要 Markdown 標題。',
  ].filter(Boolean).join('\n')
}

function parse(text: string): Result | null {
  try {
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    if (typeof json.corrected !== 'string') return null
    return { verdict: json.verdict in verdictNames ? json.verdict : 'small', corrected: json.corrected, fixes: Array.isArray(json.fixes) ? json.fixes : [], note: json.note }
  } catch { return null }
}

/** One button: Claude rewrites the answer correctly underneath, then the learner can ask follow-ups.
 *  With onSave, each fix can become a review card so the mistake comes back later. */
export default function CorrectBox({ zh, reference, words, answer, run, onSave, onResult, mode = 'translate' }: {
  zh: string; reference?: string; words?: string[]; answer: string; run: number
  onSave?: (card: SayCard) => void; onResult?: (verdict: Result['verdict'], fixes: number) => void; mode?: 'translate' | 'open'
}) {
  const [saved, setSaved] = useState<number[]>([])
  const [turns, setTurns] = useState<TutorTurn[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const sys = system(zh, reference, words, mode)

  async function send(next: TutorTurn[], first: boolean) {
    setBusy(true); setError('')
    try {
      const reply = await askTutor(sys, next)
      if (first) {
        const parsed = parse(reply)
        setResult(parsed)
        if (parsed) onResult?.(parsed.verdict, parsed.fixes.length)
        setTurns([...next, { role: 'assistant', content: reply }])
        if (!parsed) setError('老師回得格式怪怪的，下面是原文：\n' + reply)
      } else setTurns([...next, { role: 'assistant', content: reply }])
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!run) return
    setResult(null); setQuestion(''); setTurns([]); setError(''); setSaved([])
    if (!tutorKey()) { setError('還沒連接 Claude：到「設定 → 連接 Claude」貼上 API 金鑰就能用。'); return }
    if (!answer.trim()) { setError('先寫一點英文再按批改。'); return }
    const first: TutorTurn[] = [{ role: 'user', content: '我的翻譯：' + answer.trim() }]
    setTurns(first); void send(first, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])
  if (!run) return null

  const followUps = turns.slice(2)
  return <section className="tu-box" aria-live="polite">
    {busy && !result && <p className="tu-wait">批改中……</p>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {result && <>
      <div className="tu-head"><strong>批改</strong><span className={'tu-badge tu-' + result.verdict}>{verdictNames[result.verdict]}</span></div>
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
