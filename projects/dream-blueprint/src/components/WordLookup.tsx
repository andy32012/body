import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import type { Passage } from '../lib/passages'
import { addWordsToReview } from '../lib/dailyWords'
import { levelEntry, wordKey } from '../lib/vocab'
import { lookupWord, type Lookup, type WordPosition, wordParts } from '../lib/story'
import { speakEnglish } from '../lib/tts'
import { askClaude, wordQuestion } from '../lib/taskContext'
import HomographNote from './HomographNote'
import { PetIcon } from './PixelPet'
import './story.css'
import './ai-chat.css'

/** Tap a word while reading to see its meaning: the passage's own word notes first, then the 7000-word table.
 *  Shared by 短文讀聽 and 歷屆考題閱讀. */

/** The first spelling of a word-table entry: "it (its, itself)" → it, "airplane/plane" → airplane. */
export const headword = (en: string) => en.split(/[\s(/]/)[0].toLowerCase()

/** `tap(word, at)` looks a word up; `box` is its meaning, to show right under line `line`; `seen` lists every word looked up.
 *  The box has a speaker that says the word as it is written in the text, with the device's voice at `opts.rate` (his
 *  朗讀速度); `opts.onSay` runs first, so a passage that is being read aloud stops instead of talking over it. With
 *  `opts.askTeacher` (the passage's questions are done) it also has 「問 Claude 老師」: the floating chat opens on the passage
 *  and the teacher first asks whether he knows what the word means there. */
export function useLookup(passage: Pick<Passage, 'words'>, opts: { rate?: number; onSay?: () => void; askTeacher?: boolean } = {}) {
  const [picked, setPicked] = useState<Lookup | { form: string; miss: true }>()
  const [seen, setSeen] = useState<Lookup[]>([])
  const [location, setLocation] = useState<{ line: number; index: number; segment: number }>()
  // Another passage on the same screen (閱讀測驗 keeps its page): the box and the list start empty again.
  useEffect(() => { setPicked(undefined); setSeen([]); setLocation(undefined) }, [passage])
  function tap(word: string, at: number, position: WordPosition) {
    setLocation({ line: at, index: position.index, segment: position.segment })
    const found = lookupWord(word, passage, position)
    if (!found) { setPicked({ form: word, miss: true }); return }
    setPicked(found)
    setSeen(list => list.some(l => sameLookup(l, found)) ? list : [...list, found])
  }
  const canSay = typeof window !== 'undefined' && 'speechSynthesis' in window
  const box = picked && <p className="st-lookup" role="status">
    <span className="st-lookup-word"><b lang="en">{picked.form}</b>
      {canSay && <button type="button" className="st-lookup-say" aria-label="聽發音" title="聽發音"
        onClick={() => { opts.onSay?.(); void speakEnglish(picked.form, opts.rate) }}><Volume2 size={15} /></button>}</span>
    {'miss' in picked ? <span>字表裡沒有這個字（可能是名字、數字或字表以外的字），可以按「問問 Claude」。</span>
      : <><span>{picked.zh}</span><HomographNote en={picked.en} side="everyday" /><small>{picked.from === 'passage' ? '這段裡的意思' : picked.from === 'extra' ? '常用字的說明（不在 7000 單字表裡）' : '字表的意思' + (picked.form.toLowerCase() !== headword(picked.en) ? '（原形 ' + headword(picked.en) + '）' : '')}</small></>}
    {opts.askTeacher && <button type="button" className="ask-word st-lookup-ask" onClick={() => askClaude(wordQuestion(picked.form))}><PetIcon size={16} />問 Claude 老師</button>}
  </p>
  return { tap, box, line: location?.line, index: location?.index, segment: location?.segment, seen }
}

const sameLookup = (a: Lookup, b: Lookup) => a.form.toLowerCase() === b.form.toLowerCase() && a.zh === b.zh

/** A line of text with every word a button: tapping one looks it up. `marks`: phrases drawn highlighted (the evidence for
 *  the last answer), their words still tappable. */
export function TapWords({ text, line, onWord, pickedLine, pickedIndex, segment = 0, pickedSegment = 0, marks = [], emphasis }: {
  text: string; line: number; onWord?: (w: string, line: number, position: WordPosition) => void
  pickedLine?: number; pickedIndex?: number; segment?: number; pickedSegment?: number; marks?: readonly string[]
  emphasis?: { from: number; to: number; underline?: boolean }
}): ReactNode {
  let offset = 0
  const parts = wordParts(text).map((part, i) => {
    const from = offset
    offset += part.length
    return { part, from, to: offset, word: i % 2 !== 0 }
  })
  // Match evidence at complete word boundaries. Style inside a word without splitting its lookup button.
  const boundary = (index: number) => !parts.some(p => p.word && p.from < index && index < p.to)
  const decorations: { from: number; to: number; type: 'mark' | 'strong' | 'u' }[] = []
  for (const mark of marks) {
    if (!mark) continue
    let from = text.indexOf(mark)
    while (from >= 0 && (!boundary(from) || !boundary(from + mark.length))) from = text.indexOf(mark, from + 1)
    if (from >= 0) decorations.push({ from, to: from + mark.length, type: 'mark' })
  }
  if (emphasis) decorations.push({ from: emphasis.from, to: emphasis.to, type: emphasis.underline ? 'u' : 'strong' })
  decorations.sort((a, b) => a.from - b.from)
  function decorated(part: string, from: number, to: number): ReactNode {
    let cursor = from
    const shown: ReactNode[] = []
    for (const d of decorations) {
      const start = Math.max(cursor, d.from), end = Math.min(to, d.to)
      if (end <= start) continue
      shown.push(text.slice(cursor, start))
      const Tag = d.type
      shown.push(<Tag key={start} className={Tag === 'mark' ? undefined : 'ex-emphasis'}>{text.slice(start, end)}</Tag>)
      cursor = end
    }
    return shown.length ? [...shown, text.slice(cursor, to)] : part
  }
  return parts.map(({ part, from, to, word }, i) => {
    const content = decorated(part, from, to)
    if (!word || !onWord) return <Fragment key={i}>{content}</Fragment>
    const active = pickedLine === line && pickedIndex === from && pickedSegment === segment
    return <button key={i} type="button" className="st-w" data-on={active} onClick={() => onWord(part, line, { text, index: from, segment })}>{content}</button>
  })
}

/** Words looked up while reading: each can go into the word review. Only words of the 7000-word table become cards. */
export function LookedUp({ items, state, onActivity, date }: { items: Lookup[]; state: PageProps['state']; onActivity: PageProps['update']; date: string }) {
  const cards = new Set(state.cards.map(c => c.id))
  const able = items.filter(l => levelEntry(l.en))
  if (!items.length) return null
  const waiting = [...new Set(able.map(l => wordKey(l.en)))].filter(id => !cards.has('word:' + id))
  return <section className="st-looked">
    <strong>這段查過的字（{items.length}）</strong>
    <ul>{items.map(l => <li key={JSON.stringify([l.form.toLowerCase(), l.zh])}><b lang="en">{l.form}</b>{l.form.toLowerCase() !== l.en.toLowerCase() && <small lang="en">（{l.en}）</small>} {l.zh}
      {levelEntry(l.en) && cards.has('word:' + wordKey(l.en)) && <small className="st-in">已在單字複習</small>}</li>)}</ul>
    {waiting.length > 0 && <button type="button" className="pr-link" onClick={() => onActivity(prev => addWordsToReview(prev, waiting, date))}>把這 {waiting.length} 個字加進單字複習</button>}
  </section>
}
