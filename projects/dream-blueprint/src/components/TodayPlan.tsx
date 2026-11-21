import { Check } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { dueCount, type Energy } from '../lib/progress'
import './today-plan.css'

/** The 30-minute regular day, built from features that already exist. */
export default function TodayPlan({ state, update, today, energy, onStart }:
  Pick<PageProps, 'state' | 'update'> & { today: string; energy: Energy; onStart: (e: Energy) => void }) {
  const due = dueCount(state.cards, today)
  const reviewedToday = state.reviewEvents.some(e => e.day === today)
  const practisedToday = state.sessions.some(s => s.day === today)
  const key = (id: string) => 'plan.' + today + '.' + id
  const tasks = [
    { id: 'review', min: 8, title: '複習', detail: due ? '到期的單字卡和錯句 ' + due + ' 張，先不看答案回想' : '今天沒有到期的卡，可以快篩幾個新字',
      auto: reviewedToday && due === 0, go: () => { location.hash = 'library/words' } },
    { id: 'understand', min: 10, title: '理解', detail: '讀一段 7000 單短文，翻成英文後按「批改」',
      auto: false, go: () => { location.hash = 'library/passage' } },
    { id: 'express', min: 8, title: '表達', detail: '今天的中翻英一句，再跟 Emma 聊 3 分鐘',
      auto: practisedToday, go: () => onStart(energy), go2: () => { location.hash = 'speaking' } },
    { id: 'fix', min: 4, title: '訂正', detail: '看批改和 Emma 的小筆記，把講錯的句子加入複習',
      auto: false },
  ]
  const isDone = (t: typeof tasks[number]) => t.auto || state.notes[key(t.id)] === '1'
  const finished = tasks.filter(isDone).length
  const toggle = (id: string) => update(prev => {
    const notes = { ...prev.notes }
    if (notes[key(id)] === '1') delete notes[key(id)]; else notes[key(id)] = '1'
    return { ...prev, notes }
  })
  return <section className="tp-card" aria-label="今天的 30 分鐘">
    <header><strong>今天的 30 分鐘</strong><span>{finished} / 4</span></header>
    <div className="tp-bar" aria-hidden="true"><i style={{ width: finished * 25 + '%' }} /></div>
    <ol>
      {tasks.map(t => <li key={t.id} className={isDone(t) ? 'done' : ''}>
        <button type="button" className="tp-check" aria-pressed={isDone(t)} aria-label={(isDone(t) ? '取消完成：' : '標記完成：') + t.title}
          disabled={t.auto} onClick={() => toggle(t.id)}>{isDone(t) && <Check size={14} strokeWidth={3} />}</button>
        <div className="tp-text"><b>{t.title}<small>{t.min} 分鐘</small></b><span>{t.detail}</span></div>
        <div className="tp-go">
          {t.go && <button type="button" onClick={t.go}>{t.id === 'express' ? '中翻英' : '去做'}</button>}
          {'go2' in t && t.go2 && <button type="button" onClick={t.go2}>Emma</button>}
        </div>
      </li>)}
    </ol>
  </section>
}
