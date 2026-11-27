import AskWhy from './AskWhy'
import { useState } from 'react'
import quizData from '../data/quiz.json'
import type { PageProps } from '../lib/store'
import { useActivitySave, type SaveActivity } from '../lib/activitySave'
import DiagnoseBox from './DiagnoseBox'
import { useTaskContext } from '../lib/taskContext'
import {
  advanceQuiz, causeOptions, nextQuizItem, nextSubjectQuiz, subjectDoneToday, quizSectionKey, quizSummary, recordQuizAnswer, recordQuizCause,
  quizRecordKey, readQuizRecord, sectionNames, sectionOf, type QuizItem, type QuizSection,
} from '../lib/quiz'

const items = quizData as QuizItem[]

/** Multiple choice in two sections. Every answer is saved, misses come back a day later,
 *  and a miss asks what went wrong so English problems and nursing problems can be told apart. */
export default function QuizPractice({ state, update, onSavedActivity, date, sections = ['english', 'nursing'], subject }:
  Pick<PageProps, 'state' | 'update'> & { onSavedActivity: SaveActivity; date: string; sections?: QuizSection[]
    /** Only this licensing-exam subject's nursing questions (opened from the 國考科目 page). */
    subject?: string }) {
  const stored = state.notes[quizSectionKey] as QuizSection
  const [section, setSection] = useState<QuizSection>(subject ? 'nursing' : sections.includes(stored) ? stored : sections[0])
  function pickNext(s: QuizSection, notes: Record<string, string>) {
    const next = subject ? nextSubjectQuiz(items, subject, notes, date) : nextQuizItem(items, s, notes, date)
    return next ? { ...next, before: notes[quizRecordKey(next.item.id)] } : null
  }
  const [current, setCurrent] = useState(() => pickNext(section, state.notes))
  const [picked, setPicked] = useState<number>()
  const [showZh, setShowZh] = useState(false)
  const [cause, setCause] = useState('')
  const [submittedAt, setSubmittedAt] = useState(0)
  const { saving, error, save, clearError } = useActivitySave()
  const summary = quizSummary(items, section, state.notes, subject)

  function reset() { clearError(); setPicked(undefined); setShowZh(false); setCause(''); setSubmittedAt(0) }
  function choose(next: QuizSection) {
    if (saving || next === section) return
    setSection(next)
    setCurrent(pickNext(next, state.notes))
    update(prev => ({ ...prev, notes: { ...prev.notes, [quizSectionKey]: next } }))
    reset()
  }
  function pick(i: number) {
    if (picked !== undefined || !current) return
    const { item, retry, index, total, before } = current
    const usedZh = showZh && sectionOf(item) === 'nursing'
    void save(async () => {
      let at = 0
      await onSavedActivity(prev => {
        if (prev.notes[quizRecordKey(item.id)] !== before) throw new Error('另一個分頁或裝置已更新這題，請換到目前的題目續做。')
        const queued = !retry && !subject ? nextQuizItem(items, section, prev.notes, date) : null
        let notes = recordQuizAnswer(prev.notes, item, i, date, usedZh)
        if (queued?.item.id === item.id && !queued.retry) notes = advanceQuiz(notes, section, index, total)
        at = readQuizRecord(notes, item.id)?.at ?? 0
        return { ...prev, notes }
      })
      setSubmittedAt(at)
      setPicked(i)
    })
  }
  function saveCause(c: string) {
    if (!current || cause || !submittedAt) return
    const id = current.item.id
    void save(async () => {
      await onSavedActivity(prev => ({ ...prev, notes: recordQuizCause(prev.notes, id, c, submittedAt) }))
      setCause(c)
    })
  }
  function next() {
    if (saving) return
    setCurrent(pickNext(section, state.notes))
    reset()
  }

  useTaskContext(current ? {
    label: (sectionOf(current.item) === 'nursing' ? '護理英文題：' : '英文題：') + current.item.en.slice(0, 60),
    detail: ['選擇題：' + current.item.en, '選項：' + current.item.options.map((o, i) => (i + 1) + '. ' + o).join(' / '),
      picked === undefined ? '他還沒作答；正確答案是第 ' + (current.item.answerIndex + 1) + ' 個，他作答前不要說出來，只幫他看懂題目。'
        : '他選了第 ' + (picked + 1) + ' 個，正確答案是第 ' + (current.item.answerIndex + 1) + ' 個。說明：' + current.item.explanation].join('\n'),
  } : null)
  if (!current) return subject && subjectDoneToday(items, subject, state.notes, date)
    ? <div className="pr-hint"><strong>「{subject}」的 {summary.total} 題今天都做過了</strong>
        <p>{summary.wrongNow ? '答錯的 ' + summary.wrongNow + ' 題明天會再出現。' : '全部答對了。'}明天再來這一科，或先去練全部的題目。</p>
        <div className="pr-actions"><button type="button" className="pr-main" onClick={() => { location.hash = 'library/quiz' }}>改練全部題目</button></div></div>
    : <div className="pr-stack">
      <p>{!subject && summary.total ? '這一區今天答錯的題目都已記下，明天會再出現。' : subject ? '「' + subject + '」還沒有護理英文題。' : '這一區還沒有題目。'}</p>
      {!subject && sections.length > 1 && <div className="pr-options qz-tabs" role="group" aria-label="題目分區">
        {sections.map(s => <button key={s} aria-pressed={s === section} onClick={() => choose(s)}>{sectionNames[s]}</button>)}
      </div>}
    </div>
  const { item: question, retry } = current
  const nursing = sectionOf(question) === 'nursing'
  const wrong = picked !== undefined && picked !== question.answerIndex
  return <div className="pr-stack qz">
    {subject && <p className="qz-meta"><span>只出「{subject}」的護理英文題</span><a href="#library/quiz">改練全部題目</a></p>}
    {!subject && sections.length > 1 && <div className="pr-options qz-tabs" role="group" aria-label="題目分區">
      {sections.map(s => <button key={s} disabled={saving} aria-pressed={s === section} onClick={() => choose(s)}>{sectionNames[s]}</button>)}
    </div>}
    <p className="qz-meta">
      <span>{retry ? '之前答錯的題目，隔一天再來一次' : '第 ' + (current.index + 1) + ' / ' + current.total + ' 題'}</span>
      <span>已答 {summary.answered} / {summary.total}{summary.wrongNow > 0 && ' · 待重做 ' + summary.wrongNow}</span>
      {summary.topCause && <span>最常卡在：{summary.topCause.cause}</span>}
    </p>
    {saving && <p role="status">正在儲存這題……</p>}
    {error && <div role="alert" className="tu-error">
      <p>{error}</p>
      {picked === undefined && current.before !== state.notes[quizRecordKey(question.id)] &&
        <button type="button" className="pr-link" onClick={next}>換到目前的題目</button>}
    </div>}
    <h3 lang="en">{question.en}</h3>
    {nursing
      ? (showZh || picked !== undefined
        ? <p>{question.zh}</p>
        : <button className="pr-link qz-zh" disabled={saving} onClick={() => setShowZh(true)}>看不懂？看中文題目（會記下來）</button>)
      : <p>{question.zh}</p>}
    <div className="pr-options">
      {question.options.map((label, i) => (
        <button key={i} disabled={saving || picked !== undefined} aria-pressed={i === picked}
          className={picked === undefined ? undefined : i === question.answerIndex ? 'qz-right' : i === picked ? 'qz-wrong' : undefined}
          onClick={() => pick(i)}>{label}</button>
      ))}
    </div>
    {picked !== undefined && <div className="pr-hint">
      <strong>{wrong ? '這題的答案是「' + question.options[question.answerIndex] + '」' : '答對了'}</strong>
      <p>{question.explanation}</p>
      {/* Nursing misses get the diagnosis box below; every other answer can ask Claude why. */}
      {!(wrong && nursing) && <AskWhy q={{ source: nursing ? '護理英文選擇題' : '英文選擇題', stem: question.en, options: question.options, picked: question.options[picked!] ?? '', answer: question.options[question.answerIndex], right: !wrong }} />}
      {question.source && <a href={question.source} target="_blank" rel="noreferrer">查看資料來源</a>}
      {wrong && <div className="qz-cause">
        <small>卡在哪？選一個，之後會看哪一種最常出現。這題明天會再出現。</small>
        <div className="pr-options">
          {causeOptions[sectionOf(question)].map(c => <button key={c} aria-pressed={cause === c} disabled={saving || !!cause} onClick={() => saveCause(c)}>{c}</button>)}
        </div>
        {nursing && <DiagnoseBox key={question.id} id={'quiz.' + question.id} question={question.en} options={question.options} answer={question.answerIndex} picked={picked!}
          notes={state.notes} onSave={(k, v) => update(prev => ({ ...prev, notes: { ...prev.notes, [k]: v } }))} onCause={saveCause} cause={cause} />}
      </div>}
      <button className="pr-main qz-next" disabled={saving} onClick={next}>下一題</button>
    </div>}
    <button className="pr-link" disabled={state.flagged.includes(question.id)}
      onClick={() => update(prev => ({ ...prev, flagged: [...new Set([...prev.flagged, question.id])] }))}>
      {state.flagged.includes(question.id) ? '已記到設定頁' : '這題怪怪的'}
    </button>
  </div>
}
