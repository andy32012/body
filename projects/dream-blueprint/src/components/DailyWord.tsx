import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, RotateCcw, Volume2, X } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { activePeriod, reviewEnergy } from '../lib/progress'
import RotatingPhoto from './RotatingPhoto'
import { AskWord } from './AIChat'
import UseWord from './UseWord'
import HomographNote from './HomographNote'
import { markSkill } from '../lib/wordSkills'
import { useTapGuard } from '../lib/tapGuard'
import { paintSky, seedOf } from '../lib/starfield'
import { useModal } from '../lib/modal'
import { meaningLine, wordKey } from '../lib/vocab'
import { speakEnglishResult } from '../lib/tts'
import { DAILY_CHOICES, DEFAULT_DAILY, changeSorted, countKey, currentWordChoice, dailyQueue, dailyWordPhoto, doneKey, moreKey, newWordPlan, officialByKey, readDailyDone, readSorted } from '../lib/dailyWords'
import './daily-word.css'

type Props = Pick<PageProps, 'state' | 'update'> & { today: string; onClose: () => void }

export default function DailyWord({ state, update, today, onClose }: Props) {
  const period = activePeriod(today, state.settings.periods)
  const quiet = period === 'exam' || period === 'internship'
  // New words adapt to the review they cause: cards piling up, a heavy week ahead, or poor recall slow them down.
  const plan = newWordPlan(state, today, quiet, reviewEnergy(today, state.settings.periods))
  const target = plan.target
  const done = readDailyDone(state.notes, today)
  const queue = useMemo(() => dailyQueue(state.knownWords, state.learningWords),
    [state.knownWords, state.learningWords])
  const current = done < target ? queue[0] : undefined
  // 上一個: steps back through the words sorted today (0 = the word in front of him now).
  const sorted = readSorted(state.notes, today)
  const [back, setBack] = useState(0)
  const previous = back > 0 ? sorted[sorted.length - back] : undefined
  const past = previous ? { ...previous, known: currentWordChoice(state, previous) } : undefined
  const pastWord = past ? officialByKey.get(past.k) : undefined
  const word = pastWord ?? current
  const imageKey = word?.en ?? 'done' + today
  const seed = seedOf(imageKey)
  const photo = dailyWordPhoto(imageKey)
  const sky = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (sky.current) paintSky(sky.current, seed) }, [seed])
  const [reveal, setReveal] = useState(false)
  // 還不熟 / 認得 stay in the same place for the next word: a double tap must not sort that one too.
  const ready = useTapGuard(word?.en)
  const [silent, setSilent] = useState(false)
  const playback = useRef<AbortController | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const veil = useRef<HTMLDivElement>(null)
  // Opened by itself on the first visit of the day, focus lands on the 今日單字 button when it closes.
  useModal(veil, onClose, { initial: () => card.current, fallback: () => document.querySelector<HTMLElement>('.word-chip') ?? document.getElementById('content') })
  useEffect(() => {
    setSilent(false)
    return () => { playback.current?.abort(); playback.current = null }
  }, [word?.en])

  async function speak(spelling: string) {
    playback.current?.abort()
    const controller = new AbortController()
    playback.current = controller
    setSilent(false)
    const result = await speakEnglishResult(spelling, state.settings.speechRate, controller.signal)
    if (playback.current !== controller) return
    playback.current = null
    setSilent(result === 'failed')
  }

  function sort(known: boolean) {
    if (!current || past || !ready()) return
    const key = wordKey(current.en)
    update(prev => {
      if ([...prev.knownWords, ...prev.learningWords].some(w => wordKey(w) === key)) return prev
      const next = changeSorted(prev, key, known, today)
      return {
        ...next,
        notes: { ...next.notes, [doneKey(today)]: String(readDailyDone(prev.notes, today) + 1) },
      }
    })
    setReveal(false)
  }

  function stepBack() { setBack(b => Math.min(sorted.length, b + 1)); setReveal(false) }
  function stepForward() { setBack(b => Math.max(0, b - 1)); setReveal(false) }
  /** A choice changed on a word looked back at: the list and review cards follow, the day's count does not. */
  function change(known: boolean) {
    if (!past) return
    update(prev => changeSorted(prev, past.k, known, today))
  }

  const setNote = (key: string, value: string) =>
    update(prev => ({ ...prev, notes: { ...prev.notes, [key]: value } }))

  const visibleForms = reveal || !!past
  const groups = word?.forms ?? []
  const spellings = groups.length ? groups.flatMap(group => group.forms) : word ? [word.en] : []
  const grouped = visibleForms && groups.length > 1
  const listen = (spelling: string, text: string, className: string) =>
    <button key={spelling} type="button" className={className} aria-label={'聽 ' + spelling + ' 的發音'} onClick={() => void speak(spelling)}>
      <Volume2 size={15} aria-hidden="true" />{text && <span lang={text === '聽發音' ? undefined : 'en'}>{text}</span>}
    </button>

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
          <span className="daily-word-meta">第 {word.level} 級{past ? ' · 今天第 ' + (sorted.length - back + 1) + ' 個 · 你選了「' + (past.known ? '認得' : '還不熟') + '」' : ''}</span>
          <strong className="daily-word-term" lang="en">{word.en}</strong>
          {visibleForms
            ? grouped
              ? <ul className="daily-word-forms">{groups.map(f => <li key={f.forms.join('/')}>
                {f.forms.map((form, i) => <span key={form} className="daily-word-form">
                  {i > 0 && ' / '}<b lang="en">{form}</b> {listen(form, '', 'daily-word-form-listen')}
                </span>)} <small>{f.pos}</small> {f.zh}
              </li>)}</ul>
              : <p className="daily-word-meaning">{meaningLine(word)}</p>
            : <button type="button" className="daily-word-reveal" onClick={() => setReveal(true)}>先想一下，再看中文</button>}
          {visibleForms && <HomographNote en={word.en} side="everyday" />}
          <div className="daily-word-tools">
            {!grouped && (visibleForms && spellings.length > 1
              ? spellings.map(form => listen(form, form, 'daily-word-listen'))
              : spellings[0] && listen(spellings[0], '聽發音', 'daily-word-listen'))}
            <AskWord en={word.en} zh={visibleForms ? word.zh : undefined} label="問問 Claude" />{visibleForms && <UseWord key={word.en} en={word.en} zh={word.zh}
            onGood={() => update(prev => ({ ...prev, notes: markSkill(prev.notes, wordKey(word.en), 'write', today) }))} />}</div>
          {silent && <small className="daily-word-note">這台裝置現在沒有聲音，先用看的。</small>}
        </div>
        <div className="daily-word-foot">
          {past ? <div className="daily-word-actions">
            <button type="button" onClick={() => change(!past.known)}>{past.known ? <><RotateCcw size={15} />改成還不熟</> : <><Check size={15} />改成認得</>}</button>
            <button type="button" className="primary" onClick={() => setBack(0)}>{current ? '回到第 ' + (done + 1) + ' 個' : '回到最後'}<ArrowRight size={15} /></button>
          </div> : <div className="daily-word-actions">
            <button type="button" onClick={() => sort(false)}><RotateCcw size={15} />還不熟</button>
            <button type="button" className="primary" onClick={() => sort(true)}><Check size={15} />認得</button>
          </div>}
          <div className="daily-word-steps">
          <button type="button" className="daily-word-back" disabled={back >= sorted.length} onClick={stepBack} aria-label="上一個單字"><ArrowLeft size={14} />上一個</button>
          <div className="daily-word-progress" role="progressbar" aria-label="今天的單字" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(done, target)}
            aria-valuetext={'看完 ' + done + ' 個，今日目標 ' + target + ' 個，現在是第 ' + (past ? sorted.length - back + 1 : done + 1) + ' 個'}>
            {Array.from({ length: target }, (_, i) => <i key={i} aria-hidden="true" className={past && i === sorted.length - back ? 'look' : i < done ? 'done' : i === done && !past ? 'now' : ''} />)}
          </div>
          {back > 0 && <button type="button" className="daily-word-back" onClick={stepForward} aria-label="下一個單字">下一個<ArrowRight size={14} /></button>}
          </div>
        </div>
      </> : <div className="daily-word-body daily-word-finished">
        <strong className="daily-word-term">{!queue.length ? '六級單字都看過一輪了' : target === 0 ? '今天先複習' : '今天的 ' + done + ' 個看完了'}</strong>
        {plan.reason && queue.length > 0 && <p className="daily-word-meaning">{plan.reason}</p>}
        <p className="daily-word-meaning">{queue.length ? '還不熟的字明天會出現在複習裡。' : '之後從待學單字和複習繼續。'}</p>
        {quiet && queue.length > 0 && state.notes[moreKey(today)] !== '1' &&
          <button type="button" className="daily-word-reveal" onClick={() => setNote(moreKey(today), '1')}>考週只排 1 個。還想再看幾個</button>}
        <label className="daily-word-count">每天看幾個
          <select id="daily-word-count" value={Number(state.notes[countKey]) || DEFAULT_DAILY}
            onChange={event => setNote(countKey, event.target.value)}>
            {DAILY_CHOICES.map(n => <option key={n} value={n}>{n} 個</option>)}
          </select>
        </label>
        {sorted.length > 0 && <button type="button" className="daily-word-back" onClick={stepBack}><ArrowLeft size={14} />看剛剛的字</button>}
        <button type="button" className="daily-word-done" onClick={onClose}>好，進去練習</button>
      </div>}
    </div>
  </div>
}
