import AskWhy from './AskWhy'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { orderForSkill, spellingMatches, type Skill } from '../lib/wordSkills'
import { speakEnglishResult } from '../lib/tts'
import HomographNote from './HomographNote'
import EmmaWordLink from './EmmaWordLink'

/** `en` may list accepted spellings ("airplane/plane"); `key` is the word-table entry the skill is recorded on. */
type Word = { en: string; zh: string; key?: string; ex?: string; exZh?: string; spellingCue?: string }

export type WordRound = {
  order: string[]
  index: number
  pickedWord?: string
  answer: string
  shown: boolean
  passed: number
  heard: boolean
  helped: boolean
}

/** Put a short pause between accepted forms such as "airplane/plane". */
const spokenForms = (text: string) => text.split('/').map(f => f.replace(/\(.*?\)/g, '').trim()).filter(Boolean).join(', ')

/** 看懂 / 聽懂 / 說出 / 寫出 drills over the words being learned. Words missing the skill come first.
 *  A word list with example sentences (the nursing words) shows the example once the word is answered. */
export default function WordSkills({ skill, words, distractors, notes, keyOf, rate, onPass, where = '單字複習', side = 'everyday', resume, onSuspend }: {
  skill: Skill; words: Word[]; distractors: Word[]; notes: Record<string, string>
  keyOf: (w: Word) => string; rate: number; onPass: (w: Word) => void
  /** Which list this is, for Emma when he opens a chat about the word. */
  where?: string
  /** Everyday words or nursing words: a word that means something else in the other list says so after the answer. */
  side?: 'nurse' | 'everyday'
  resume?: WordRound
  onSuspend?: (round: WordRound) => void
}) {
  const [restored] = useState(() => {
    if (!resume) return null
    const byKey = new Map(words.map(word => [keyOf(word), word]))
    const order = resume.order.flatMap(key => {
      const word = byKey.get(key)
      return word ? [word] : []
    })
    return order.length === resume.order.length ? { ...resume, entries: order } : null
  })
  const [order, setOrder] = useState(() => restored?.entries ?? orderForSkill(words, keyOf, notes, skill).slice(0, 10))
  const [i, setI] = useState(restored?.index ?? 0)
  const [pickedWord, setPickedWord] = useState<string | undefined>(restored?.pickedWord)
  const [answer, setAnswer] = useState(restored?.answer ?? '')
  const [shown, setShown] = useState(restored?.shown ?? false)
  const [passed, setPassed] = useState(restored?.passed ?? 0)
  const [heard, setHeard] = useState(restored?.heard ?? false)
  const [helped, setHelped] = useState(restored?.helped ?? false)
  const playback = useRef<AbortController | null>(null)
  useEffect(() => () => playback.current?.abort(), [])
  async function say(text: string, unlock = false) {
    playback.current?.abort()
    const control = new AbortController()
    playback.current = control
    const result = await speakEnglishResult(spokenForms(text), rate, control.signal)
    if (unlock && result === 'played' && playback.current === control && !control.signal.aborted) setHeard(true)
  }
  const word = order[i]
  const options = useMemo(() => {
    if (!word) return []
    const others = distractors.filter(d => d.zh !== word.zh && d.en !== word.en)
    const seed = [...word.en].reduce((a, c) => a + c.charCodeAt(0), i)
    const pick = [others[seed % Math.max(1, others.length)], others[(seed * 7 + 3) % Math.max(1, others.length)]].filter(Boolean)
    const unique = [...new Map([word, ...pick].map(w => [w.zh, w])).values()].slice(0, 3)
    return unique.sort((a, b) => ((a.en.length * 31 + seed) % 7) - ((b.en.length * 31 + seed) % 7))
  }, [word, distractors, i])
  const selected = pickedWord === undefined ? -1 : options.findIndex(option => option.en === pickedWord)
  const picked = selected < 0 ? undefined : selected
  const setPicked = (index?: number) => setPickedWord(index === undefined ? undefined : options[index]?.en)

  function restart() { playback.current?.abort(); setI(0); setPassed(0); setPicked(undefined); setAnswer(''); setShown(false); setHeard(false); setHelped(false) }
  if (!words.length) return <p>先在每天的課或今日單字學幾個字，這裡就會有字可以練。</p>
  if (!word) return <div className="pr-stack">
    <p>這一輪 {order.length} 個字練完了，{passed} 個過關。</p>
    <div className="pr-actions">
      {/* The next ten are picked from the records just saved: words still missing this skill first, so the round moves on. */}
      <button type="button" className="pr-main" onClick={() => { setOrder(orderForSkill(words, keyOf, notes, skill).slice(0, 10)); restart() }}>再一輪（換下一批字）</button>
      <button type="button" className="pr-link" onClick={restart}>這十個重做一次</button>
    </div>
  </div>
  const next = (ok: boolean) => {
    // Spelled after 「給我第一個字母」 is done with help: it does not count as 寫出.
    if (ok && !helped) { onPass(word); setPassed(n => n + 1) }
    const upcoming = order[i + 1]
    playback.current?.abort()
    // The tap on 下一個 is a user gesture, so the next word can play right away; its choices open once it sounds.
    if (skill === 'listen' && upcoming) void say(upcoming.en, true)
    setI(i + 1); setPicked(undefined); setAnswer(''); setShown(false); setHeard(false); setHelped(false)
  }
  const right = picked !== undefined && options[picked]?.en === word.en
  const answered = picked !== undefined || shown
  return <div className="pr-stack ws">
    <p className="qz-meta"><span>{i + 1} / {order.length}</span><span>{skill === 'read' ? '看英文，選意思' : skill === 'listen' ? '聽發音，選意思' : skill === 'say' ? '看中文，說出英文' : '看中文，拼出英文'}</span></p>
    {skill === 'read' && <>
      <h3 className="ws-term" lang="en">{word.en} <button type="button" className="ws-mini" aria-label="聽發音" onClick={() => void say(word.en)}><Volume2 size={15} /></button></h3>
      <div className="pr-options">{options.map((o, j) => <button key={o.zh} type="button" disabled={picked !== undefined} aria-pressed={picked === j}
        className={picked === undefined ? undefined : o.en === word.en ? 'qz-right' : picked === j ? 'qz-wrong' : undefined}
        onClick={() => setPicked(j)}>{o.zh}</button>)}</div>
      {picked !== undefined && <button type="button" className="pr-main" onClick={() => next(right)}>下一個</button>}
    </>}
    {skill === 'listen' && <>
      <button type="button" className="ws-play" onClick={() => void say(word.en, true)}><Volume2 size={18} />播放{picked !== undefined ? '（' + word.en + '）' : ''}</button>
      <div className="pr-options">{options.map((o, j) => <button key={o.zh} type="button" disabled={picked !== undefined || !heard} aria-pressed={picked === j}
        className={picked === undefined ? undefined : o.en === word.en ? 'qz-right' : picked === j ? 'qz-wrong' : undefined}
        onClick={() => { setPicked(j); void say(word.en) }}>{o.zh}</button>)}</div>
      {!heard && typeof speechSynthesis === 'undefined' && <p className="ls-help">這個瀏覽器不能播放語音，聽懂練習先換別的模式。</p>}
      {!heard && <p className="ls-help">先按播放聽一次，完整播放後才能選意思（這樣才算「聽懂」）。按了沒聲音，檢查音量或換個瀏覽器。</p>}
      {/* No sound on this device right now: move on without counting this word as 聽懂. */}
      {!heard && picked === undefined && <button type="button" className="pr-link" onClick={() => next(false)}>聽不到聲音？略過這個字（不算）→</button>}
      {picked !== undefined && <button type="button" className="pr-main" onClick={() => next(right)}>下一個</button>}
    </>}
    {skill === 'say' && <>
      <h3>{word.zh}</h3>
      {!shown ? <button type="button" className="pr-main" onClick={() => { setShown(true); void say(word.en) }}>我說出來了，看答案</button> : <>
        <p className="ws-answer" lang="en">{word.en} <button type="button" className="ws-mini" aria-label="再聽一次" onClick={() => void say(word.en)}><Volume2 size={15} /></button></p>
        <div className="pr-actions"><button type="button" onClick={() => next(true)}>我說對了（自評）</button><button type="button" onClick={() => next(false)}>沒說出來</button></div>
        <small className="ls-help">還沒有錄音核對，這裡記成「說出（自評）」，不算確認過的口說。</small>
      </>}
    </>}
    {skill === 'write' && <>
      <h3>{word.zh}</h3>
      {word.spellingCue && <p className="ls-help">{word.spellingCue}</p>}
      <form className="ws-write" onSubmit={e => { e.preventDefault(); if (answer.trim()) setShown(true) }}>
        <input lang="en" value={answer} disabled={shown} autoCapitalize="off" autoComplete="off" spellCheck={false} onChange={e => setAnswer(e.target.value)} placeholder="拼出英文" />
        {!shown && <button type="submit" className="pr-main" disabled={!answer.trim()}>檢查</button>}
      </form>
      {!shown && <div className="pr-actions">
        <button type="button" className="pr-link" onClick={() => { setHelped(true); setAnswer(word.en.slice(0, 1)) }}>給我第一個字母</button>
        <button type="button" className="pr-link" onClick={() => { setAnswer(''); setShown(true) }}>不會，看答案</button>
      </div>}
      {shown && <>
        <p className={'ws-answer ' + (spellingMatches(answer, word.en) ? 'ok' : 'no')} lang="en">{spellingMatches(answer, word.en) ? '✓ ' : '✗ 正確是 '}{word.en}</p>
        {helped && spellingMatches(answer, word.en) && <p className="ls-help">有用「第一個字母」提示，這次記成有提示完成，下一輪再自己拼一次。</p>}
        <button type="button" className="pr-main" onClick={() => next(spellingMatches(answer, word.en))}>下一個</button>
      </>}
    </>}
    {answered && word.ex && <p className="ws-ex"><span lang="en">{word.ex}</span><br />{word.exZh}</p>}
    {answered && <HomographNote en={word.en} side={side} />}
    {/* After answering, so the chat never gives the answer away. */}
    {answered && <div className="ws-tools"><EmmaWordLink en={word.en} zh={word.zh} where={where} part={skill} seen
      beforeOpen={onSuspend && (() => onSuspend({ order: order.map(keyOf), index: i, pickedWord, answer, shown, passed, heard, helped }))}
      others={order.slice(i + 1, i + 6).map(w => w.en)} />
      {skill === 'write' ? <AskWhy q={{ source: '單字拼寫', stem: ['看中文拼出英文：' + word.zh, word.spellingCue].filter(Boolean).join(' '), picked: answer, answer: word.en, right: spellingMatches(answer, word.en) }} />
        : skill !== 'say' && picked !== undefined && <AskWhy q={{ source: skill === 'listen' ? '單字（聽發音選意思）' : '單字（看英文選意思）', stem: word.en, options: options.map(o => o.zh), picked: options[picked]?.zh ?? '', answer: word.zh, right }} />}</div>}
  </div>
}
