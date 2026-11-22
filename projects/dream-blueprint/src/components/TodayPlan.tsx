import { Check } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { dueCount, type Energy } from '../lib/progress'
import { answeredOn, quizSectionKey, sectionOf, type QuizItem } from '../lib/quiz'
import { casesFinishedOn } from '../lib/scenarios'
import quizData from '../data/quiz.json'

const nursingIds = new Set((quizData as QuizItem[]).filter(q => sectionOf(q) === 'nursing').map(q => q.id))
import { activeLesson, lessonFinished } from '../lib/lesson'
import { dueTopic, partNumber, partPlan, topicDoneToday } from '../lib/topics'
import type { Focus } from '../lib/nextFocus'
import { dayBudget, NURSING_LABEL, splitMinutes } from '../lib/dailyPlan'
import './today-plan.css'

type Task = { id: string; min: number; title: string; detail: string; auto: boolean; go?: () => void; goLabel?: string; go2?: () => void; go2Label?: string }

/** The regular day (its minutes come from the day's plan, the same numbers as the choices above), or during exams and
 *  internship a 10–15 minute nursing-English plan. Built from features that already exist; the curriculum does not
 *  move in the nursing plan. */
export default function TodayPlan({ state, update, today, energy, onStart, mode = 'regular', focus }:
  Pick<PageProps, 'state' | 'update'> & { today: string; energy: Energy; onStart: (e: Energy) => void; mode?: 'regular' | 'nursing'; focus?: Focus }) {
  // The tasks add up to the minutes shown for this choice; a focus for today takes its minutes out of review.
  const total = dayBudget(today, state.settings).minutes[energy] ?? 30
  const split = splitMinutes(total, mode === 'regular' && focus?.action ? focus.minutes : 0)
  const focusMin = split.focus
  const due = dueCount(state.cards, today)
  const reviewedToday = state.reviewEvents.some(e => e.day === today)
  const key = (id: string) => 'plan.' + today + '.' + id
  // Only nursing questions count toward the nursing plan; an English question is not nursing practice.
  const quizToday = answeredOn(state.notes, today, nursingIds)
  const casesToday = casesFinishedOn(state.notes, today)
  const topic = mode === 'regular' && energy !== 'low' ? dueTopic(state, today) : null
  const topicDone = topicDoneToday(state.notes, today)
  const tasks: Task[] = mode === 'nursing' ? [
    { id: 'n-review', min: 5, title: '複習', detail: due ? '到期的單字卡和錯句 ' + due + ' 張，先不看答案回想' : '今天沒有到期的卡，這步跳過',
      auto: due === 0, go: due ? () => { location.hash = 'library/words' } : undefined },
    { id: 'n-quiz', min: 5, title: '護理英文題', detail: '做 3–5 題護理英文題，或做完一個臨床情境；先不看中文，答錯就選「卡在哪」' + (quizToday || casesToday ? '（今天' + [quizToday ? '護理題 ' + quizToday + ' 題' : '', casesToday ? '情境 ' + casesToday + ' 個' : ''].filter(Boolean).join('、') + '）' : ''),
      auto: quizToday >= 3 || casesToday >= 1, go: () => { update(prev => ({ ...prev, notes: { ...prev.notes, [quizSectionKey]: 'nursing' } })); location.hash = 'library/quiz' },
      goLabel: '題目', go2: () => { location.hash = 'library/case' }, go2Label: '情境' },
    { id: 'n-say', min: 4, title: '說一件事', detail: '用英文跟 Emma 說一件今天實習或讀書遇到的事，三句就好',
      auto: false, go: () => { location.hash = 'speaking' }, goLabel: 'Emma' },
  ] : [
    ...(focusMin ? [{ id: 'focus', min: focusMin, title: '先補強', detail: focus!.reason, auto: false,
      go: () => { location.hash = focus!.action!.hash }, goLabel: '去做' }] : []),
    { id: 'review', min: split.review, title: '複習', detail: due ? '到期的單字卡和錯句 ' + due + ' 張，先不看答案回想' : '今天沒有到期的卡，可以快篩幾個新字',
      auto: reviewedToday && due === 0, go: () => { location.hash = 'library/words' } },
    topic ? { id: 'lesson', min: split.lesson, title: '生活主題：' + topic.topic.title, detail: '第 ' + partNumber(topic.part) + ' 次（共 3 次）：' + partPlan[topic.part],
      auto: false, go: () => onStart(energy), goLabel: topic.step > 0 ? '繼續' : '開始' }
    : topicDone && !lessonFinished(state.notes, today) ? { id: 'lesson', min: split.lesson, title: '今天的生活主題', detail: '完成了。文法課下次上；想多練也可以現在上。',
      auto: true, go: () => onStart(energy), goLabel: '加練' }
    : { id: 'lesson', min: split.lesson, title: '今天這一堂', detail: '回想 → 聽懂 → 句型 → 用自己的話說 → 訂正',
      auto: lessonFinished(state.notes, today), go: () => onStart(energy), goLabel: lessonFinished(state.notes, today) ? '再上' : activeLesson(state.notes) ? '繼續' : '開始' },
    ...(split.extra ? [{ id: 'extra', min: split.extra, title: '加練', detail: split.extra >= 15 ? '一篇閱讀理解、一題寫作階梯，或跟 Emma 聊 5 分鐘' : '跟 Emma 聊幾分鐘，或多做幾張複習卡',
      auto: false, go: () => { location.hash = 'library/reading' }, goLabel: '閱讀', go2: () => { location.hash = 'speaking' } }] : []),
    ...(split.wrap ? [{ id: 'more', min: split.wrap, title: '收尾', detail: '把今天批改出來的錯句加入複習，明天會再出現', auto: false }] : []),
  ]
  const isDone = (t: Task) => t.auto || state.notes[key(t.id)] === '1'
  const finished = tasks.filter(isDone).length
  const toggle = (id: string) => update(prev => {
    const notes = { ...prev.notes }
    if (notes[key(id)] === '1') delete notes[key(id)]; else notes[key(id)] = '1'
    return { ...prev, notes }
  })
  const title = mode === 'nursing' ? '今天的護理英文 ' + NURSING_LABEL : '今天的 ' + total + ' 分鐘'
  return <section className="tp-card" aria-label={title}>
    <header><strong>{title}</strong><span>{finished} / {tasks.length}</span></header>
    <div className="tp-bar" aria-hidden="true"><i style={{ width: finished / tasks.length * 100 + '%' }} /></div>
    <ol>
      {tasks.map(t => <li key={t.id} className={isDone(t) ? 'done' : ''}>
        <button type="button" className="tp-check" aria-pressed={isDone(t)} aria-label={(isDone(t) ? '取消完成：' : '標記完成：') + t.title}
          disabled={t.auto} onClick={() => toggle(t.id)}>{isDone(t) && <Check size={14} strokeWidth={3} />}</button>
        <div className="tp-text"><b>{t.title}<small>{t.min} 分鐘</small></b><span>{t.detail}</span></div>
        <div className="tp-go">
          {t.go && <button type="button" onClick={t.go}>{t.goLabel ?? '去做'}</button>}
          {t.go2 && <button type="button" onClick={t.go2}>{t.go2Label ?? 'Emma'}</button>}
        </div>
      </li>)}
    </ol>
  </section>
}
