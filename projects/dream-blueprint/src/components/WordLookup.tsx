import { useState } from 'react'
import { Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import type { Passage } from '../lib/passages'
import { addWordsToReview } from '../lib/dailyWords'
import { levelEntry, wordKey } from '../lib/vocab'
import { lookupWord, type Lookup } from '../lib/story'
import { speakEnglish } from '../lib/tts'
import HomographNote from './HomographNote'
import './story.css'

/** Tap a word while reading to see its meaning: the passage's own word notes first, then the 7000-word table.
 *  Shared by 短文讀聽 and 歷屆考題閱讀. */

/** The first spelling of a word-table entry: "it (its, itself)" → it, "airplane/plane" → airplane. */
export const headword = (en: string) => en.split(/[\s(/]/)[0].toLowerCase()

/** `tap(word, at)` looks a word up; `box` is its meaning, to show right under line `line`; `seen` lists every word looked up.
 *  The box has a speaker that says the word as it is written in the text, with the device's voice at `voice.rate` (his
 *  朗讀速度); `voice.onSay` runs first, so a passage that is being read aloud stops instead of talking over it. */
export function useLookup(passage: Pick<Passage, 'words'>, voice: { rate?: number; onSay?: () => void } = {}) {
  const [picked, setPicked] = useState<Lookup | { form: string; miss: true }>()
  const [seen, setSeen] = useState<Lookup[]>([])
  const [line, setLine] = useState<number>()
  function tap(word: string, at: number) {
    setLine(at)
    const found = lookupWord(word, passage)
    if (!found) { setPicked({ form: word, miss: true }); return }
    setPicked(found)
    setSeen(list => list.some(l => l.form.toLowerCase() === found.form.toLowerCase()) ? list : [...list, found])
  }
  const canSay = typeof window !== 'undefined' && 'speechSynthesis' in window
  const box = picked && <p className="st-lookup" role="status">
    <span className="st-lookup-word"><b lang="en">{picked.form}</b>
      {canSay && <button type="button" className="st-lookup-say" aria-label="聽發音" title="聽發音"
        onClick={() => { voice.onSay?.(); void speakEnglish(picked.form, voice.rate) }}><Volume2 size={15} /></button>}</span>
    {'miss' in picked ? <span>字表裡沒有這個字（可能是名字、數字或字表以外的字），可以按「問問 Claude」。</span>
      : <><span>{picked.zh}</span><HomographNote en={picked.en} side="everyday" /><small>{picked.from === 'passage' ? '這段裡的意思' : picked.from === 'extra' ? '常用字的說明（不在 7000 單字表裡）' : '字表的意思' + (picked.form.toLowerCase() !== headword(picked.en) ? '（原形 ' + headword(picked.en) + '）' : '')}</small></>}
  </p>
  return { tap, box, line, seen, pickedForm: picked?.form.toLowerCase() }
}

/** A line of text with every word a button: tapping one looks it up. */
export function TapWords({ text, line, onWord, picked, pickedLine }: { text: string; line: number; onWord?: (w: string, line: number) => void; picked?: string; pickedLine?: number }) {
  return <>{text.split(/([A-Za-z][A-Za-z'’-]*)/).map((t, j) => j % 2 && onWord
    ? <button key={j} type="button" className="st-w" data-on={pickedLine === line && picked === t.toLowerCase()} onClick={() => onWord(t, line)}>{t}</button> : t)}</>
}

/** Words looked up while reading: each can go into the word review. Only words of the 7000-word table become cards. */
export function LookedUp({ items, state, onActivity, date }: { items: Lookup[]; state: PageProps['state']; onActivity: PageProps['update']; date: string }) {
  const cards = new Set(state.cards.map(c => c.id))
  const able = items.filter(l => levelEntry(l.en))
  if (!items.length) return null
  const waiting = able.filter(l => !cards.has('word:' + wordKey(l.en)))
  return <section className="st-looked">
    <strong>這段查過的字（{items.length}）</strong>
    <ul>{items.map(l => <li key={l.form.toLowerCase()}><b lang="en">{l.form}</b>{l.form.toLowerCase() !== l.en.toLowerCase() && <small lang="en">（{l.en}）</small>} {l.zh}
      {levelEntry(l.en) && cards.has('word:' + wordKey(l.en)) && <small className="st-in">已在單字複習</small>}</li>)}</ul>
    {waiting.length > 0 && <button type="button" className="pr-link" onClick={() => onActivity(prev => addWordsToReview(prev, waiting.map(l => wordKey(l.en)), date))}>把這 {waiting.length} 個字加進單字複習</button>}
  </section>
}
