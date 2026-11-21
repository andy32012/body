import { Check } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { dueCount, type Energy } from '../lib/progress'
import { answeredOn, quizSectionKey } from '../lib/quiz'
import './today-plan.css'

type Task = { id: string; min: number; title: string; detail: string; auto: boolean; go?: () => void; goLabel?: string; go2?: () => void }

/** The 30-minute regular day, or during exams and internship a 10–15 minute nursing-English plan.
 *  Built from features that already exist; the curriculum does not move in the nursing plan. */
export default function TodayPlan({ state, update, today, energy, onStart, mode = 'regular' }:
  Pick<PageProps, 'state' | 'update'> & { today: string; energy: Energy; onStart: (e: Energy) => void; mode?: 'regular' | 'nursing' }) {
  const due = dueCount(state.cards, today)
  const reviewedToday = state.reviewEvents.some(e => e.day === today)
  const practisedToday = state.sessions.some(s => s.day === today)
  const key = (id: string) => 'plan.' + today + '.' + id
  const quizToday = answeredOn(state.notes, today)
  const tasks: Task[] = mode === 'nursing' ? [
    { id: 'n-review', min: 5, title: '複習', detail: due ? '到期的單字卡和錯句 ' + due + ' 張，先不看答案回想' : '今天沒有到期的卡，這步跳過',
      auto: due === 0, go: due ? () => { location.hash = 'library/words' } : undefined },
    { id: 'n-quiz', min: 5, title: '護理英文題', detail: '做 3–5 題，先不看中文；答錯就選「卡在哪」' + (quizToday ? '（今天做了 ' + quizToday + ' 題）' : ''),
      auto: quizToday >= 3, go: () => { update(prev => ({ ...prev, notes: { ...prev.notes, [quizSectionKey]: 'nursing' } })); location.hash = 'library/quiz' } },
    { id: 'n-say', min: 4, title: '說一件事', detail: '用英文跟 Emma 說一件今天實習或讀書遇到的事，三句就好',
      auto: false, go: () => { location.hash = 'speaking' }, goLabel: 'Emma' },
  ] : [
    { id: 'review', min: 8, title: '複習', detail: due ? '到期的單字卡和錯句 ' + due + ' 張，先不看答案回想' : '今天沒有到期的卡，可以快篩幾個新字',
      auto: reviewedToday && due === 0, go: () => { location.hash = 'library/words' } },
    { id: 'understand', min: 10, title: '理解', detail: '讀一段 7000 單短文，翻成英文後按「批改」',
      auto: false, go: () => { location.hash = 'library/passage' } },
    { id: 'express', min: 8, title: '表達', detail: '今天的中翻英一句，再跟 Emma 聊 3 分鐘',
      auto: practisedToday, go: () => onStart(energy), goLabel: '中翻英', go2: () => { location.hash = 'speaking' } },
    { id: 'fix', min: 4, title: '訂正', detail: '看批改和 Emma 的小筆記，把講錯的句子加入複習',
      auto: false },
  ]
  const isDone = (t: Task) => t.auto || state.notes[key(t.id)] === '1'
  const finished = tasks.filter(isDone).length
  const toggle = (id: string) => update(prev => {
    const notes = { ...prev.notes }
    if (notes[key(id)] === '1') delete notes[key(id)]; else notes[key(id)] = '1'
    return { ...prev, notes }
  })
  const title = mode === 'nursing' ? '今天的護理英文 10–15 分鐘' : '今天的 30 分鐘'
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
          {t.go2 && <button type="button" onClick={t.go2}>Emma</button>}
        </div>
      </li>)}
    </ol>
  </section>
}
