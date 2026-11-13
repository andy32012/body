import { useState } from 'react'
import { BatteryCharging, BookOpen, CalendarDays, ChevronRight, Compass, GraduationCap, ListChecks, Play, Trophy } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { activePeriod, dayKey, type Energy } from '../lib/progress'
import { schoolToday } from '../lib/school'
import { rivalSummary } from '../lib/rivals'
import { getLessonPreview } from '../pages/Practice'
import './dock.css'

interface DockProps extends PageProps {
  onStart: (energy: Energy) => void
  nextStep?: string
  onlyPractice?: boolean
}

const options = [
  { energy: 'low', name: '累爆', cells: 1 },
  { energy: 'normal', name: '普通', cells: 2 },
  { energy: 'high', name: '有電', cells: 3 },
] as const

function holidayMinutes(day: string) {
  if (day >= '2029-08-01') return 60
  if (day >= '2028-01-01') return 40
  if (day >= '2027-07-01') return 30
  return 20
}

export default function PracticeDock({ state, navigate, onStart, nextStep, onlyPractice = false }: DockProps) {
  const today = dayKey()
  const weekday = new Date(today + 'T12:00:00').getDay()
  const period = activePeriod(today, state.settings.periods)
  const quiet = period === 'exam' || period === 'internship'
  const regular = state.settings.regularDays.includes(weekday)
  const restDay = state.settings.restDays.includes(weekday)
  const holiday = period === 'vacation'
  const defaultEnergy: Energy = quiet ? 'low' : holiday && weekday !== 0 ? 'high' : !holiday && regular ? 'normal' : 'low'
  const [choice, setChoice] = useState<{key:string; energy:Energy} | null>(null)
  const scheduleKey = today + period + ':' + defaultEnergy
  const energy = quiet ? 'low' : choice?.key === scheduleKey ? choice.energy : defaultEnergy
  const lesson = getLessonPreview(state, energy, today)
  const previewTopic = lesson.freshReview ? '自選熟悉的一句' : lesson.review ? lesson.items[0]?.grammar.join('、') || lesson.title : lesson.title
  const school = schoolToday(state.school, today)
  const schoolSummary = [school.classes, ...school.events, '原訂讀書時段 · ' + school.study].join(' ／ ')
  const rivalry = !onlyPractice && state.settings.rivalsEnabled ? rivalSummary(state) : ''
  const highMinutes = holidayMinutes(today)
  const englishTask = quiet ? '複習 2 分鐘，或休息。' :
    holiday ? (weekday === 0 ? '今天休息。' : '放假練習 ' + highMinutes + ' 分鐘。') :
    regular ? '普通練習 8–10 分鐘。' : restDay ? '今天休息。' : '複習 2 分鐘。'
  const durations = { low: '2 分鐘', normal: '8–10 分鐘', high: holiday ? highMinutes + ' 分鐘' : '延伸練習' }

  return <div className="practice-dock" data-only-practice={onlyPractice}>
    <section className="dock-panel" aria-labelledby="dock-energy-title" id="practice-dock" tabIndex={-1}>
      <h2 className="dock-title" id="dock-energy-title"><BatteryCharging size={21} aria-hidden="true" />今天的電量</h2>
      <div className="dock-choices" role="group" aria-labelledby="dock-energy-title">
        {options.map(({ energy: value, name, cells }) => <button
          className="dock-choice" type="button" key={value} data-energy={value}
          aria-pressed={energy === value} disabled={quiet && value !== 'low'}
          onClick={() => setChoice({key:scheduleKey, energy:value})}>
          <span className="dock-battery" aria-hidden="true">{[1,2,3].map(n => <i key={n} data-filled={n <= cells} />)}</span>
          <strong>{name}</strong><small>{durations[value]}</small>
        </button>)}
      </div>
      {quiet && <p className="dock-pause">{period === 'exam' ? '考週' : '實習'}只複習舊內容，課表會留在原位。</p>}
      {energy === 'low' && state.settings.why && <blockquote className="dock-why">{state.settings.why}</blockquote>}
      <div className="dock-preview" aria-live="polite">
        <p className="dock-unit">{lesson.review ? '複習日 · 課表停在' : '今日課表 · '} 單元 {lesson.unit} 第 {lesson.day} 天 · {previewTopic}</p>
        <p className="dock-sentence">{lesson.zh}</p>
        <p className="dock-words">{lesson.review ? '今天不加新字' : lesson.newWords.length ? '今天的字：' + lesson.newWords.map(w => w.en + '（' + w.zh + '）').join('、') : '今天不加新字'}</p>
      </div>
      <button className="dock-launch" type="button" onClick={() => onStart(energy)}><Play size={16} fill="currentColor" aria-hidden="true" />開始練習</button>
    </section>
    {!onlyPractice && <section className="dock-panel" aria-labelledby="dock-tasks-title">
      <h2 className="dock-title" id="dock-tasks-title"><ListChecks size={21} aria-hidden="true" />今天的三件事</h2>
      <dl className="dock-list">
        <div><GraduationCap aria-hidden="true" size={20} className="dock-task-icon" /><dt>學校</dt><dd>{schoolSummary}</dd></div>
        <div><BookOpen aria-hidden="true" size={20} className="dock-task-icon" /><dt>英文</dt><dd>{englishTask}</dd></div>
        <div><Compass aria-hidden="true" size={20} className="dock-task-icon" /><dt>夢想線</dt><dd>{nextStep}</dd></div>
      </dl>
      {weekday === 1 && <details className="dock-week"><summary><CalendarDays size={15} />本週考試與原訂讀書時段</summary>
        <ul>{Array.from({length:7}, (_, i) => {
          const date = new Date(today + 'T12:00:00')
          date.setDate(date.getDate() + i)
          const item = schoolToday(state.school, dayKey(date))
          return <li key={i}>週{'一二三四五六日'[i]} · {[item.study,...item.events].join(' · ')}</li>
        })}</ul></details>}
      {rivalry && <button className="dock-rank" type="button" onClick={() => navigate('rivals')}><Trophy aria-hidden="true" size={17} />{rivalry}<ChevronRight aria-hidden="true" size={16} /></button>}
    </section>}
  </div>
}
