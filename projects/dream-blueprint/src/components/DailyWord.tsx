import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, RotateCcw, Volume2, X } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { activePeriod, newCard } from '../lib/progress'
import RotatingPhoto from './RotatingPhoto'
import { paintSky, seedOf } from '../lib/starfield'
import { wordKey } from '../lib/vocab'
import { DAILY_CHOICES, countKey, dailyQueue, dailyTarget, dailyWordPhoto, doneKey, moreKey } from '../lib/dailyWords'
import './daily-word.css'

type Props = Pick<PageProps, 'state' | 'update'> & { today: string; onClose: () => void }

export default function DailyWord({ state, update, today, onClose }: Props) {
  const period = activePeriod(today, state.settings.periods)
  const quiet = period === 'exam' || period === 'internship'
  const target = dailyTarget(state.notes, quiet, today)
  const done = Number(state.notes[doneKey(today)] || 0)
  const queue = useMemo(() => dailyQueue(state.knownWords, state.learningWords),
    [state.knownWords, state.learningWords])
  const word = done < target ? queue[0] : undefined
  const imageKey = word?.en ?? 'done' + today
  const seed = seedOf(imageKey)
  const photo = dailyWordPhoto(imageKey)
  const sky = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (sky.current) paintSky(sky.current, seed) }, [seed])
  const [reveal, setReveal] = useState(false)
  const [silent, setSilent] = useState(false)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => { card.current?.focus() }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); window.speechSynthesis?.cancel() }
  }, [onClose])

  function speak() {
    if (!word || !('speechSynthesis' in window)) { setSilent(true); return }
    const phrase = new SpeechSynthesisUtterance(word.en.split('/')[0].replace(/\(.*?\)/g, ''))
    phrase.lang = 'en-US'
    phrase.rate = state.settings.speechRate
    phrase.onerror = () => setSilent(true)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(phrase)
  }

  function sort(known: boolean) {
    if (!word) return
    const key = wordKey(word.en)
    update(prev => {
      if ([...prev.knownWords, ...prev.learningWords].some(w => wordKey(w) === key)) return prev
      const id = 'word:' + key
      return {
        ...prev,
        knownWords: known ? [...prev.knownWords, key] : prev.knownWords,
        learningWords: known ? prev.learningWords : [...prev.learningWords, key],
        cards: known || prev.cards.some(c => c.id === id) ? prev.cards : [...prev.cards, newCard(id, today)],
        notes: { ...prev.notes, [doneKey(today)]: String(Number(prev.notes[doneKey(today)] || 0) + 1) },
      }
    })
    setReveal(false)
  }

  const setNote = (key: string, value: string) =>
    update(prev => ({ ...prev, notes: { ...prev.notes, [key]: value } }))

  return <div className="daily-word-veil" role="dialog" aria-modal="true" aria-label="今日單字" onClick={onClose}>
    <div className="daily-word-card" ref={card} tabIndex={-1} onClick={event => event.stopPropagation()}>
      <canvas className="daily-word-photo" ref={sky} aria-hidden="true" />
      <RotatingPhoto className="daily-word-photo over" photo={photo}/>
      <div className="daily-word-top">
        <span className="daily-word-label"><i aria-hidden="true" />今日單字</span>
        <button type="button" className="daily-word-close" aria-label="關閉今日單字" onClick={onClose}><X size={18} /></button>
      </div>

      {word ? <>
        <div className="daily-word-body">
          <span className="daily-word-meta">第 {word.level} 級{word.pos ? ' · ' + word.pos : ''}</span>
          <strong className="daily-word-term" lang="en">{word.en}</strong>
          {reveal
            ? <p className="daily-word-meaning">{word.zh}</p>
            : <button type="button" className="daily-word-reveal" onClick={() => setReveal(true)}>先想一下，再看中文</button>}
          <button type="button" className="daily-word-listen" onClick={speak}><Volume2 size={15} />聽發音</button>
          {silent && <small className="daily-word-note">這台裝置現在沒有聲音，先用看的。</small>}
        </div>
        <div className="daily-word-foot">
          <div className="daily-word-actions">
            <button type="button" onClick={() => sort(false)}><RotateCcw size={15} />還不熟</button>
            <button type="button" className="primary" onClick={() => sort(true)}><Check size={15} />認得</button>
          </div>
          <div className="daily-word-progress" aria-label={'今天第 ' + (done + 1) + ' 個，共 ' + target + ' 個'}>
            {Array.from({ length: target }, (_, i) => <i key={i} className={i < done ? 'done' : i === done ? 'now' : ''} />)}
          </div>
        </div>
      </> : <div className="daily-word-body daily-word-finished">
        <strong className="daily-word-term">{queue.length ? '今天的 ' + done + ' 個看完了' : '六級單字都看過一輪了'}</strong>
        <p className="daily-word-meaning">{queue.length ? '還不熟的字明天會出現在複習裡。' : '之後從待學單字和複習繼續。'}</p>
        {quiet && queue.length > 0 && state.notes[moreKey(today)] !== '1' &&
          <button type="button" className="daily-word-reveal" onClick={() => setNote(moreKey(today), '1')}>考週只排 1 個。還想再看幾個</button>}
        <label className="daily-word-count">每天看幾個
          <select id="daily-word-count" value={Number(state.notes[countKey]) || 8}
            onChange={event => setNote(countKey, event.target.value)}>
            {DAILY_CHOICES.map(n => <option key={n} value={n}>{n} 個</option>)}
          </select>
        </label>
        <button type="button" className="daily-word-done" onClick={onClose}>好，進去練習</button>
      </div>}
    </div>
  </div>
}
