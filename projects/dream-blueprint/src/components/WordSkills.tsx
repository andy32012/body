import { useMemo, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { orderForSkill, spellingMatches, type Skill } from '../lib/wordSkills'

type Word = { en: string; zh: string }

function say(text: string, rate = 0.85) {
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.split('/')[0].replace(/\(.*?\)/g, ''))
    u.lang = 'en-US'; u.rate = rate
    speechSynthesis.speak(u)
    return true
  } catch { return false }
}

/** 聽懂 / 說出 / 寫出 drills over the words being learned. Words missing the skill come first. */
export default function WordSkills({ skill, words, distractors, notes, keyOf, rate, onPass }: {
  skill: Exclude<Skill, 'read'>; words: Word[]; distractors: Word[]; notes: Record<string, string>
  keyOf: (w: Word) => string; rate: number; onPass: (w: Word) => void
}) {
  const [order] = useState(() => orderForSkill(words, keyOf, notes, skill).slice(0, 10))
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number>()
  const [answer, setAnswer] = useState('')
  const [shown, setShown] = useState(false)
  const [passed, setPassed] = useState(0)
  const word = order[i]
  const options = useMemo(() => {
    if (!word) return []
    const others = distractors.filter(d => d.zh !== word.zh && d.en !== word.en)
    const seed = [...word.en].reduce((a, c) => a + c.charCodeAt(0), i)
    const pick = [others[seed % Math.max(1, others.length)], others[(seed * 7 + 3) % Math.max(1, others.length)]].filter(Boolean)
    const unique = [...new Map([word, ...pick].map(w => [w.zh, w])).values()].slice(0, 3)
    return unique.sort((a, b) => ((a.en.length * 31 + seed) % 7) - ((b.en.length * 31 + seed) % 7))
  }, [word, distractors, i])

  if (!words.length) return <p>先在每天的課或今日單字學幾個字，這裡就會有字可以練。</p>
  if (!word) return <div className="pr-stack">
    <p>這一輪 {order.length} 個字練完了，{passed} 個過關。</p>
    <button type="button" onClick={() => { setI(0); setPassed(0); setPicked(undefined); setAnswer(''); setShown(false) }}>再一輪</button>
  </div>
  const next = (ok: boolean) => {
    if (ok) { onPass(word); setPassed(n => n + 1) }
    setI(i + 1); setPicked(undefined); setAnswer(''); setShown(false)
  }
  const right = picked !== undefined && options[picked]?.en === word.en
  return <div className="pr-stack ws">
    <p className="qz-meta"><span>{i + 1} / {order.length}</span><span>{skill === 'listen' ? '聽發音，選意思' : skill === 'say' ? '看中文，說出英文' : '看中文，拼出英文'}</span></p>
    {skill === 'listen' && <>
      <button type="button" className="ws-play" onClick={() => say(word.en, rate)}><Volume2 size={18} />播放{picked !== undefined ? '（' + word.en + '）' : ''}</button>
      <div className="pr-options">{options.map((o, j) => <button key={o.zh} type="button" disabled={picked !== undefined} aria-pressed={picked === j}
        className={picked === undefined ? undefined : o.en === word.en ? 'qz-right' : picked === j ? 'qz-wrong' : undefined}
        onClick={() => { setPicked(j); say(word.en, rate) }}>{o.zh}</button>)}</div>
      {picked !== undefined && <button type="button" className="pr-main" onClick={() => next(right)}>下一個</button>}
    </>}
    {skill === 'say' && <>
      <h3>{word.zh}</h3>
      {!shown ? <button type="button" className="pr-main" onClick={() => { setShown(true); say(word.en, rate) }}>我說出來了，看答案</button> : <>
        <p className="ws-answer" lang="en">{word.en} <button type="button" className="ws-mini" aria-label="再聽一次" onClick={() => say(word.en, rate)}><Volume2 size={15} /></button></p>
        <div className="pr-actions"><button type="button" onClick={() => next(true)}>我說對了</button><button type="button" onClick={() => next(false)}>沒說出來</button></div>
      </>}
    </>}
    {skill === 'write' && <>
      <h3>{word.zh}</h3>
      <form className="ws-write" onSubmit={e => { e.preventDefault(); if (answer.trim()) setShown(true) }}>
        <input lang="en" value={answer} disabled={shown} autoCapitalize="off" autoComplete="off" spellCheck={false} onChange={e => setAnswer(e.target.value)} placeholder="拼出英文" />
        {!shown && <button type="submit" className="pr-main" disabled={!answer.trim()}>檢查</button>}
      </form>
      {!shown && <button type="button" className="pr-link" onClick={() => setAnswer(word.en.slice(0, 1))}>給我第一個字母</button>}
      {shown && <>
        <p className={'ws-answer ' + (spellingMatches(answer, word.en) ? 'ok' : 'no')} lang="en">{spellingMatches(answer, word.en) ? '✓ ' : '✗ 正確是 '}{word.en}</p>
        <button type="button" className="pr-main" onClick={() => next(spellingMatches(answer, word.en))}>下一個</button>
      </>}
    </>}
  </div>
}
