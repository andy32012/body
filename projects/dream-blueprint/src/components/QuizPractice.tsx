import { useState } from 'react'
import quizData from '../data/quiz.json'
import type { PageProps } from '../lib/store'
import {
  advanceQuiz, causeOptions, nextQuizItem, quizSectionKey, quizSummary, recordQuizAnswer, recordQuizCause,
  sectionNames, sectionOf, type QuizItem, type QuizSection,
} from '../lib/quiz'

const items = quizData as QuizItem[]

/** Multiple choice in two sections. Every answer is saved, misses come back a day later,
 *  and a miss asks what went wrong so English problems and nursing problems can be told apart. */
export default function QuizPractice({ state, update, onActivity = update, date, sections = ['english', 'nursing'] }:
  Pick<PageProps, 'state' | 'update'> & { onActivity?: PageProps['update']; date: string; sections?: QuizSection[] }) {
  const stored = state.notes[quizSectionKey] as QuizSection
  const [section, setSection] = useState<QuizSection>(sections.includes(stored) ? stored : sections[0])
  const [current, setCurrent] = useState(() => nextQuizItem(items, section, state.notes, date))
  const [picked, setPicked] = useState<number>()
  const [showZh, setShowZh] = useState(false)
  const [cause, setCause] = useState('')
  const summary = quizSummary(items, section, state.notes)

  function reset() { setPicked(undefined); setShowZh(false); setCause('') }
  function choose(next: QuizSection) {
    if (next === section) return
    setSection(next)
    setCurrent(nextQuizItem(items, next, state.notes, date))
    update(prev => ({ ...prev, notes: { ...prev.notes, [quizSectionKey]: next } }))
    reset()
  }
  function pick(i: number) {
    if (picked !== undefined || !current) return
    setPicked(i)
    const { item, retry } = current
    const usedZh = showZh && sectionOf(item) === 'nursing'
    onActivity(prev => {
      let notes = recordQuizAnswer(prev.notes, item, i, date, usedZh)
      if (!retry) notes = advanceQuiz(notes, section)
      return { ...prev, notes }
    })
  }
  function saveCause(c: string) {
    if (!current || cause) return
    setCause(c)
    const id = current.item.id
    onActivity(prev => ({ ...prev, notes: recordQuizCause(prev.notes, id, c) }))
  }
  function next() {
    setCurrent(nextQuizItem(items, section, state.notes, date))
    reset()
  }

  if (!current) return <p>這一區還沒有題目。</p>
  const { item: question, retry } = current
  const nursing = sectionOf(question) === 'nursing'
  const wrong = picked !== undefined && picked !== question.answerIndex
  return <div className="pr-stack qz">
    {sections.length > 1 && <div className="pr-options qz-tabs" role="group" aria-label="題目分區">
      {sections.map(s => <button key={s} aria-pressed={s === section} onClick={() => choose(s)}>{sectionNames[s]}</button>)}
    </div>}
    <p className="qz-meta">
      <span>{retry ? '之前答錯的題目，隔一天再來一次' : '第 ' + (current.index + 1) + ' / ' + current.total + ' 題'}</span>
      <span>已答 {summary.answered} / {summary.total}{summary.wrongNow > 0 && ' · 待重做 ' + summary.wrongNow}</span>
      {summary.topCause && <span>最常卡在：{summary.topCause.cause}</span>}
    </p>
    <h3 lang="en">{question.en}</h3>
    {nursing
      ? (showZh || picked !== undefined
        ? <p>{question.zh}</p>
        : <button className="pr-link qz-zh" onClick={() => setShowZh(true)}>看不懂？看中文題目（會記下來）</button>)
      : <p>{question.zh}</p>}
    <div className="pr-options">
      {question.options.map((label, i) => (
        <button key={label} disabled={picked !== undefined} aria-pressed={i === picked}
          className={picked === undefined ? undefined : i === question.answerIndex ? 'qz-right' : i === picked ? 'qz-wrong' : undefined}
          onClick={() => pick(i)}>{label}</button>
      ))}
    </div>
    {picked !== undefined && <div className="pr-hint">
      <strong>{wrong ? '這題的答案是「' + question.options[question.answerIndex] + '」' : '答對了'}</strong>
      <p>{question.explanation}</p>
      {question.source && <a href={question.source} target="_blank" rel="noreferrer">查看資料來源</a>}
      {wrong && <div className="qz-cause">
        <small>卡在哪？選一個，之後會看哪一種最常出現。這題明天會再出現。</small>
        <div className="pr-options">
          {causeOptions[sectionOf(question)].map(c => <button key={c} aria-pressed={cause === c} disabled={!!cause && cause !== c} onClick={() => saveCause(c)}>{c}</button>)}
        </div>
      </div>}
      <button className="pr-main qz-next" onClick={next}>下一題</button>
    </div>}
    <button className="pr-link" disabled={state.flagged.includes(question.id)}
      onClick={() => update(prev => ({ ...prev, flagged: [...new Set([...prev.flagged, question.id])] }))}>
      {state.flagged.includes(question.id) ? '已記到設定頁' : '這題怪怪的'}
    </button>
  </div>
}
