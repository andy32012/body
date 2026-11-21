import { useState } from 'react'
import { ArrowRight, BookOpen, ChevronRight, Compass, GraduationCap, ListChecks, Play, Star, Trophy } from 'lucide-react'
import type { AppState, PageProps } from '../lib/store'
import { activePeriod, type Energy, type Period } from '../lib/progress'
import { schoolToday } from '../lib/school'
import { rivalSummary } from '../lib/rivals'
import { activeLesson, coreSaved, lessonFinished, resumePhase, stepLabel } from '../lib/lesson'
import { getLessonPreview } from '../pages/Practice'
import { nextFocus } from '../lib/nextFocus'
import ScenePhoto from './ScenePhoto'
import TodayPlan from './TodayPlan'
import './dock.css'
import './today-lesson.css'

function holidayMinutes(day: string) {
  if (day >= '2029-08-01') return 60
  if (day >= '2028-01-01') return 40
  if (day >= '2027-07-01') return 30
  return 20
}

/** Today's energy: a default from the period and weekday, changeable for today only. */
export function useEnergyChoice(state: AppState, today: string) {
  const weekday = new Date(today + 'T12:00:00').getDay()
  const period: Period = activePeriod(today, state.settings.periods)
  const quiet = period === 'exam' || period === 'internship'
  const regular = state.settings.regularDays.includes(weekday)
  const holiday = period === 'vacation'
  const defaultEnergy: Energy = quiet ? 'low' : holiday && weekday !== 0 ? 'high' : !holiday && regular ? 'normal' : 'low'
  const [choice, setChoice] = useState<{ key: string; energy: Energy } | null>(null)
  const scheduleKey = today + period + ':' + defaultEnergy
  const picked = choice?.key === scheduleKey ? choice.energy : defaultEnergy
  // Exams and internship: no new lessons, but 普通 opens a 10–15 minute nursing-English plan.
  const energy: Energy = quiet && picked === 'high' ? 'normal' : picked
  const highMinutes = holidayMinutes(today)
  const durations: Record<Energy, string> = quiet ? { low: '2 分鐘', normal: '10–15 分鐘', high: '先不用' }
    : { low: '2 分鐘', normal: '30 分鐘', high: holiday ? highMinutes + ' 分鐘' : '45 分鐘' }
  return { weekday, period, quiet, regular, holiday, energy, durations, highMinutes, choose: (e: Energy) => setChoice({ key: scheduleKey, energy: e }) }
}
export type EnergyChoice = ReturnType<typeof useEnergyChoice>

const options = [
  { energy: 'low', name: '累爆', note: '只複習', cells: 1 },
  { energy: 'normal', name: '普通', note: '完整一堂', cells: 2 },
  { energy: 'high', name: '有電', note: '一堂＋加練', cells: 3 },
] as const

export function EnergyChoices({ choice, label }: { choice: EnergyChoice; label: string }) {
  return <div className="dock-choices" role="group" aria-label={label}>
    {options.map(({ energy, name, note, cells }) => <button className="dock-choice" type="button" key={energy} data-energy={energy}
      aria-pressed={choice.energy === energy} disabled={choice.quiet && energy === 'high'} onClick={() => choice.choose(energy)}>
      <span className="dock-battery" aria-hidden="true">{[1, 2, 3].map(n => <i key={n} data-filled={n <= cells} />)}</span>
      <strong>{choice.durations[energy]}</strong><small>{choice.quiet ? (energy === 'normal' ? '護理英文' : energy === 'low' ? '只複習' : name) : note}</small>
    </button>)}
  </div>
}

/** The first thing on the home page: what today's lesson teaches, how long, and one button to start. */
export function TodayLesson({ state, update, today, start, openWord, days, weekCount }: Pick<PageProps, 'state' | 'update'> & {
  today: string; start: (e: Energy) => void; openWord: () => void; days: number; weekCount: number
}) {
  const choice = useEnergyChoice(state, today)
  const { energy, quiet, period } = choice
  // An unfinished lesson: today (continue it), or an earlier day whose 表達 is still open (offered on the side).
  const active = !quiet && energy !== 'low' ? activeLesson(state.notes) : null
  const resume = !active ? null : coreSaved(active.rec)
    ? (active.date === today ? 'same' : 'later')
    : state.curriculum.unit === active.rec.unit && state.curriculum.day === active.rec.day ? 'core' : null
  const at = resume === 'same' && active ? { unit: active.rec.unit, day: active.rec.day } : undefined
  const lesson = getLessonPreview(state, energy, today, at)
  const finished = lessonFinished(state.notes, today)
  const nextStep = active && resume && resume !== 'later' ? stepLabel[resumePhase(active.rec) ?? 'recall'] : ''
  const focus = quiet ? null : nextFocus(state, today, energy)
  const practised = state.sessions.some(s => s.day === today)
  const label = quiet ? (period === 'exam' ? '考週' : '實習') + ' · 課表停在 單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天'
    : lesson.review ? (energy === 'low' ? '今天 2 分鐘 · 課表停在 單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天' : '複習日 · 單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天')
    : lesson.checkpoint ? '單元 ' + lesson.unit + ' 小關卡' : '今天這一堂 · 單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天'
  const goal = quiet ? (energy === 'normal' ? '10–15 分鐘護理英文：複習、幾題護理英文、用英文說一件事' : '今天只要 2 分鐘：回想一句熟悉的英文')
    : lesson.review ? (energy === 'low' ? '今天只要 2 分鐘：回想一句熟悉的英文' : '今天複習舊句，課表明天繼續')
    : lesson.checkpoint ? '不看提示，自己寫出這個單元的句子' : lesson.cando || lesson.title
  const showPlan = energy !== 'low'
  return <>
    <section className="flight-deck lesson-deck" aria-labelledby="lesson-goal">
      <ScenePhoto className="flight-photo" />
      <div className="hero-body lesson-body">
        <div className="hero-label"><span aria-hidden="true" className="hero-dash" />{label}</div>
        <h2 className="lesson-goal" id="lesson-goal">{goal}</h2>
        {!quiet && <p className="lesson-sentence">今天的句子：<span>{lesson.zh}</span></p>}
        {focus?.reason && <p className="lesson-why"><b>為什麼這樣排</b>{focus.reason}
          {focus.action && <button type="button" onClick={() => { location.hash = focus.action!.hash }}>{focus.action.label}</button>}</p>}
        <EnergyChoices choice={choice} label="今天的時間" />
        <div className="lesson-actions">
          {quiet && energy === 'normal'
            ? <button type="button" className="launch" onClick={() => document.getElementById('today-plan')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><ListChecks size={16} />看今天的清單<ArrowRight size={16} /></button>
            : <button type="button" className="launch" onClick={() => start(energy)}><Play size={16} fill="currentColor" />{nextStep ? '繼續這一堂（從' + nextStep + '接著做）' : finished ? '再上一次' : practised && lesson.review ? '再複習一句' : energy === 'low' ? '開始 2 分鐘' : '開始這一堂'}<ArrowRight size={16} /></button>}
          <button type="button" className="word-chip" onClick={openWord}><Star size={14} />今日單字</button>
        </div>
        {resume === 'later' && active && <button type="button" className="lesson-resume" onClick={() => { location.hash = 'practice/resume' }}>上次那堂（單元 {active.rec.unit} 第 {active.rec.day} 天）還差「表達」，先補完？</button>}
        <p className="lesson-stats">{finished ? '今天這一堂完成了 ✓ · ' : ''}累計 {days} 天 · 本週 {weekCount} / 7 天</p>
      </div>
    </section>
    {showPlan && <div id="today-plan" className="lesson-plan"><TodayPlan state={state} update={update} today={today} energy={energy} onStart={start} mode={quiet ? 'nursing' : 'regular'} focus={focus ?? undefined} /></div>}
  </>
}

/** School, the English task and the next dream step — folded away so the lesson stays first. */
export function TodayThings({ state, navigate, today, nextStep }: Pick<PageProps, 'state' | 'navigate'> & { today: string; nextStep: string }) {
  const choice = useEnergyChoice(state, today)
  const { weekday, quiet, period, holiday, regular, highMinutes } = choice
  const restDay = state.settings.restDays.includes(weekday)
  const school = schoolToday(state.school, today)
  const schoolSummary = [school.classes, ...school.events, '原訂讀書時段 · ' + school.study].join(' ／ ')
  const rivalry = state.settings.rivalsEnabled ? rivalSummary(state) : ''
  const englishTask = quiet ? (period === 'exam'
    ? '考試優先。想動一下英文就選 10 分鐘護理英文；不然複習 2 分鐘或休息。'
    : '護理英文 10–15 分鐘：複習、幾題護理英文、用英文說一件實習的事；太累就複習 2 分鐘。') :
    holiday ? (weekday === 0 ? '今天休息。' : '放假練習 ' + highMinutes + ' 分鐘。') :
    regular ? '一般日 30 分鐘：複習卡＋今天這一堂。' : restDay ? '今天休息。' : '複習 2 分鐘。'
  return <details className="orbit-card today-things">
    <summary><ListChecks size={18} aria-hidden="true" /><span>今天的學校和待辦</span><small>{school.events.length ? school.events[0] : school.study}</small></summary>
    <dl className="dock-list">
      <div><GraduationCap aria-hidden="true" size={20} className="dock-task-icon" /><dt>學校</dt><dd>{schoolSummary}</dd></div>
      <div><BookOpen aria-hidden="true" size={20} className="dock-task-icon" /><dt>英文</dt><dd>{englishTask}</dd></div>
      <div><Compass aria-hidden="true" size={20} className="dock-task-icon" /><dt>夢想線</dt><dd>{nextStep}</dd></div>
    </dl>
    {rivalry && <button className="dock-rank" type="button" onClick={() => navigate('rivals')}><Trophy aria-hidden="true" size={17} />{rivalry}<ChevronRight aria-hidden="true" size={16} /></button>}
  </details>
}

/** On the practice page: one line pointing back to today's lesson. */
export function LessonBanner({ state, today, start }: Pick<PageProps, 'state'> & { today: string; start: (e: Energy) => void }) {
  const choice = useEnergyChoice(state, today)
  const lesson = getLessonPreview(state, choice.energy, today)
  const finished = lessonFinished(state.notes, today)
  return <section className="lesson-banner">
    <div><small>{finished ? '今天這一堂完成了 ✓' : choice.quiet ? '考週／實習：課表停在原位' : '今天這一堂'}</small>
      <strong>{choice.quiet ? '單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天' : lesson.cando || lesson.title}</strong></div>
    <button type="button" onClick={() => start(choice.energy)}><Play size={14} fill="currentColor" />{finished ? '再上一次' : choice.energy === 'low' ? '2 分鐘複習' : '開始'}</button>
  </section>
}
