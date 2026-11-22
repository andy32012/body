import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, RotateCcw, Volume2, X } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { activePeriod, addDays, dueCount, newCard } from '../lib/progress'
import RotatingPhoto from './RotatingPhoto'
import { AskWord } from './AIChat'
import UseWord from './UseWord'
import { markSkill } from '../lib/wordSkills'
import { paintSky, seedOf } from '../lib/starfield'
import { useModal } from '../lib/modal'
import { formLines, meaningLine, wordKey } from '../lib/vocab'
import { DAILY_CHOICES, countKey, dailyQueue, dailyTarget, dailyWordPhoto, doneKey, moreKey, spotCheck } from '../lib/dailyWords'
import './daily-word.css'

type Props = Pick<PageProps, 'state' | 'update'> & { today: string; onClose: () => void }

export default function DailyWord({ state, update, today, onClose }: Props) {
  const period = activePeriod(today, state.settings.periods)
  const quiet = period === 'exam' || period === 'internship'
  const due = dueCount(state.cards, today)
  const target = dailyTarget(state.notes, quiet, today, due)
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
  const veil = useRef<HTMLDivElement>(null)
  // Opened by itself on the first visit of the day, focus lands on the 今日單字 button when it closes.
  useModal(veil, onClose, { initial: () => card.current, fallback: () => document.querySelector<HTMLElement>('.word-chip') ?? document.getElementById('content') })
  useEffect(() => () => window.speechSynthesis?.cancel(), [])

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
        cards: prev.cards.some(c => c.id === id) ? prev.cards
          : !known ? [...prev.cards, newCard(id, today)]
          : spotCheck(key) ? [...prev.cards, { id, box: 4 as const, lastDay: today, due: addDays(today, 14), mastered: false }]
          : prev.cards,
        notes: { ...prev.notes, [doneKey(today)]: String(Number(prev.notes[doneKey(today)] || 0) + 1) },
      }
    })
    setReveal(false)
  }

  const setNote = (key: string, value: string) =>
    update(prev => ({ ...prev, notes: { ...prev.notes, [key]: value } }))

  return <div className="daily-word-veil" ref={veil} role="dialog" aria-modal="true" aria-label="今日單字" onClick={onClose}>
    <div className="daily-word-card" ref={card} tabIndex={-1} onClick={event => event.stopPropagation()}>
      <canvas className="daily-word-photo" ref={sky} aria-hidden="true" />
      <RotatingPhoto className="daily-word-photo over" photo={photo}/>
      <div className="daily-word-top">
        <span className="daily-word-label"><i aria-hidden="true" />今日單字</span>
        <button type="button" className="daily-word-close" aria-label="關閉今日單字" onClick={onClose}><X size={18} /></button>
      </div>

      {word ? <>
        <div className="daily-word-body">
          <span className="daily-word-meta">第 {word.level} 級</span>
          <strong className="daily-word-term" lang="en">{word.en}</strong>
          {reveal
            ? formLines(word).length
              ? <ul className="daily-word-forms">{formLines(word).map(f => <li key={f.en}><b lang="en">{f.en}</b> <small>{f.pos}</small> {f.zh}</li>)}</ul>
              : <p className="daily-word-meaning">{meaningLine(word)}</p>
            : <button type="button" className="daily-word-reveal" onClick={() => setReveal(true)}>先想一下，再看中文</button>}
          <div className="daily-word-tools"><button type="button" className="daily-word-listen" onClick={speak}><Volume2 size={15} />聽發音</button><AskWord en={word.en} zh={reveal ? word.zh : undefined} label="問問 Claude" />{reveal && <UseWord key={word.en} en={word.en} zh={word.zh}
            onGood={() => update(prev => ({ ...prev, notes: markSkill(prev.notes, wordKey(word.en), 'write', today) }))} />}</div>
          {silent && <small className="daily-word-note">這台裝置現在沒有聲音，先用看的。</small>}
        </div>
        <div className="daily-word-foot">
          <div className="daily-word-actions">
            <button type="button" onClick={() => sort(false)}><RotateCcw size={15} />還不熟</button>
            <button type="button" className="primary" onClick={() => sort(true)}><Check size={15} />認得</button>
          </div>
          <div className="daily-word-progress" role="progressbar" aria-label="今天的單字" aria-valuemin={0} aria-valuemax={target} aria-valuenow={done}
            aria-valuetext={'看完 ' + done + ' 個，共 ' + target + ' 個，現在是第 ' + (done + 1) + ' 個'}>
            {Array.from({ length: target }, (_, i) => <i key={i} aria-hidden="true" className={i < done ? 'done' : i === done ? 'now' : ''} />)}
          </div>
        </div>
      </> : <div className="daily-word-body daily-word-finished">
        <strong className="daily-word-term">{!queue.length ? '六級單字都看過一輪了' : target === 0 ? '今天先複習' : '今天的 ' + done + ' 個看完了'}</strong>
        {due > 30 && queue.length > 0 && <p className="daily-word-meaning">今天有 {due} 張卡要複習，新字先{target === 0 ? '暫停' : '減少到 ' + target + ' 個'}，複習完明天再加回來。</p>}
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
