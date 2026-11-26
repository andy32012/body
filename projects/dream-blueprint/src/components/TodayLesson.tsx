import { useState } from 'react'
import { ArrowRight, BookOpen, ChevronRight, Compass, GraduationCap, ListChecks, Play, Star, Trophy } from 'lucide-react'
import type { AppState, PageProps } from '../lib/store'
import type { Energy } from '../lib/progress'
import { dayBudget } from '../lib/dailyPlan'
import { certifiedLevel, courseProgress, exams } from '../lib/cefr'
import { schoolToday } from '../lib/school'
import { rivalSummary } from '../lib/rivals'
import { activeLesson, coreSaved, mainLessonDone, pendingLessons, resumePhase, stepLabel } from '../lib/lesson'
import { getLessonPreview } from '../lib/todayLesson'
import { nextFocus } from '../lib/nextFocus'
import { dueTopic, partNumber, partPlan, skipKey, topicDoneToday, topicGoal } from '../lib/topics'
import { dueThemeRun, themeDay, themeMinutes, themeScope } from '../lib/themes'
import schedule from '../data/curriculumSchedule.json'
import ScenePhoto from './ScenePhoto'
import TodayPlan from './TodayPlan'
import './dock.css'
import './today-lesson.css'

const courseUnits = schedule.preparedThroughUnit

/** Today's energy: a default from the day's plan (one source for every minute shown), changeable for today only. */
export function useEnergyChoice(state: AppState, today: string) {
  const budget = dayBudget(today, state.settings)
  const [choice, setChoice] = useState<{ key: string; energy: Energy } | null>(null)
  const scheduleKey = today + budget.period + ':' + budget.defaultEnergy
  const picked = choice?.key === scheduleKey ? choice.energy : budget.defaultEnergy
  // Exams and internship have no 有電 choice: no new lessons, 普通 is the short nursing-English plan.
  const energy: Energy = budget.minutes[picked] === null ? 'normal' : picked
  return { ...budget, energy, durations: budget.labels, choose: (e: Energy) => setChoice({ key: scheduleKey, energy: e }) }
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
      <strong>{choice.durations[energy]}</strong><small>{energy === 'low' && choice.optional ? '選做' : choice.quiet ? (energy === 'normal' ? '護理英文' : energy === 'low' ? '只複習' : name) : note}</small>
    </button>)}
  </div>
}

/** The first thing on the home page: what today's lesson teaches, how long, and one button to start. */
export function TodayLesson({ state, update, today, start, openWord, days, weekCount }: Pick<PageProps, 'state' | 'update'> & {
  today: string; start: (e: Energy) => void; openWord: () => void; days: number; weekCount: number
}) {
  const choice = useEnergyChoice(state, today)
  const { energy, quiet, kind, optional } = choice
  // A life-topic session takes today's slot when one is due (they take turns with grammar lessons).
  const topic = !quiet && energy !== 'low' ? dueTopic(state, today) : null
  const topicDone = topicDoneToday(state.notes, today)
  const skipTopic = () => update(prev => ({ ...prev, notes: { ...prev.notes, [skipKey(today)]: '1' } }))
  // An unfinished lesson: today (continue it), or an earlier day whose 表達 is still open (offered on the side).
  const active = !quiet && energy !== 'low' ? activeLesson(state.notes) : null
  const resume = !active ? null : coreSaved(active.rec)
    ? (active.date === today ? 'same' : 'later')
    : state.curriculum.unit === active.rec.unit && state.curriculum.day === active.rec.day ? 'core' : null
  const at = resume === 'same' && active ? { unit: active.rec.unit, day: active.rec.day } : undefined
  const lesson = getLessonPreview(state, energy, today, at)
  const finished = mainLessonDone(state, today)
  // Other earlier lessons still missing 表達 (the active pointer only remembers the latest one).
  const others = !quiet && energy !== 'low' ? pendingLessons(state.notes).filter(p => p.date !== today && p.date !== (resume === 'later' ? active?.date : '')) : []
  const nextStep = !topic && active && resume && resume !== 'later' ? stepLabel[resumePhase(active.rec) ?? 'recall'] : ''
  const focus = quiet ? null : nextFocus(state, today, energy)
  // A grammar theme taught over several units just finished: the rest day after it tests the whole theme, mixed with the
  // related grammar learned before (主題總複習). It stays on rest days until done; the 英文練習 page has it any day.
  const theme = !quiet && themeDay(kind, state.settings.restDays) ? dueThemeRun(state.notes, state.curriculum.unit) : null
  const themeInfo = theme ? themeScope(theme) : null
  const practised = state.sessions.some(s => s.day === today)
  const low = choice.labels.low
  // The next level's lessons wait for the certificate of the level before them.
  const gate = !quiet && !topic && energy !== 'low' ? lesson.gate : null
  const gateExam = gate ? exams[gate.exams[0]] : null
  const where = lesson.done ? '每日課都上完了' : '課表停在 單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天'
  const label = gate ? '升級關卡 · ' + gate.from + '→' + gate.to + ' 上完了'
    : topic ? '生活主題 ' + topic.topic.n + ' · ' + topic.topic.title + ' · 第 ' + partNumber(topic.part) + ' 次（共 3 次）'
    : topicDone && !finished && !quiet && energy !== 'low' ? '加練 · 單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天'
    : quiet ? (kind === 'exam' ? '考週' : kind === 'sprint' ? '國考衝刺' : '實習') + ' · ' + where
    : lesson.review ? (energy === 'low' ? (optional ? (kind === 'rest' ? '今天休息' : '今天沒排課') + ' · ' + low + '是選做' : '今天 ' + low) + ' · ' + where
      : lesson.done ? '每日課 ' + courseUnits + ' 個單元都上完了' : '複習日 · 單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天')
    : lesson.checkpoint ? '單元 ' + lesson.unit + ' 小關卡' : '今天這一堂 · 單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天'
  const short = optional ? '想動一下的話，花 ' + low + '複習：回想一句熟悉的英文、翻幾張複習卡（選做）' : '今天只要 ' + low + '：回想一句熟悉的英文，再翻幾張複習卡'
  const goal = gate && gateExam ? '去報名' + gateExam.name + '：填上考試日期就能先上下一段，考過才正式升到 ' + gate.to
    : topic ? topicGoal(topic) : quiet ? (energy === 'normal' ? choice.labels.normal + '護理英文：複習、聽或讀一段，再練單字、口說或護理題' : short)
    : lesson.review ? (energy === 'low' ? short : lesson.done ? '複習舊句，其他時間背 7000 單、練讀聽說寫和準備證照（照月計畫）' : '今天複習舊句，課表明天繼續')
    : lesson.checkpoint ? '不看提示，自己寫出這個單元的句子' : lesson.cando || lesson.title
  const progress = courseProgress(state.curriculum.unit)
  const certified = certifiedLevel(state.notes)
  return <>
    <section className="flight-deck lesson-deck" aria-labelledby="lesson-goal">
      <ScenePhoto className="flight-photo" />
      <div className="hero-body lesson-body">
        <div className="hero-label"><span aria-hidden="true" className="hero-dash" />{label}</div>
        <h2 className="lesson-goal" id="lesson-goal">{goal}</h2>
        {topic ? <p className="lesson-sentence">今天：<span>{partPlan[topic.part]}</span></p>
          : !quiet && <p className="lesson-sentence">今天的句子：<span>{lesson.zh}</span></p>}
        {topic && <p className="lesson-why"><b>今天輪到生活主題</b>生活主題和文法課輪流上：先學會在情境裡聽、讀，再說和寫，最後隔幾天換個情境複習。
          <button type="button" onClick={skipTopic}>今天先上文法課</button></p>}
        {themeInfo && <p className="lesson-why lesson-theme"><b>主題總複習</b>{themeInfo.title}上完了：今天把整個{theme?.theme.family === 'tense' ? '時態' : '主題'}{themeInfo.earlierThemes.length ? '和以前學過的' + themeInfo.earlierThemes.join('、') : ''}混在一起考一次，大約 {theme ? themeMinutes(theme) : 15} 分鐘。
          <button type="button" onClick={() => { location.hash = 'library/theme' }}>開始主題總複習</button></p>}
        {focus?.reason && (!topic || focus.action) && <p className="lesson-why"><b>為什麼這樣排</b>{focus.reason}
          {focus.action && <button type="button" onClick={() => { location.hash = focus.action!.hash }}>{focus.action.label}</button>}</p>}
        <EnergyChoices choice={choice} label="今天的時間" />
        <div className="lesson-actions">
          {gate
            ? <button type="button" className="launch" onClick={() => { location.hash = 'plan/levels' }}><ListChecks size={16} />去填證照<ArrowRight size={16} /></button>
            : quiet && energy === 'normal'
            ? <button type="button" className="launch" onClick={() => document.getElementById('today-plan')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><ListChecks size={16} />看今天的清單<ArrowRight size={16} /></button>
            : <button type="button" className="launch" onClick={() => start(energy)}><Play size={16} fill="currentColor" />{topic ? (topic.step > 0 ? '繼續生活主題' : '開始生活主題') : nextStep ? '繼續這一堂（從' + nextStep + '接著做）' : finished ? '再上一次' : topicDone && energy !== 'low' ? '加練：上文法課' : practised && lesson.review ? '再複習一句' : energy === 'low' ? (optional ? '選做：' + low : '開始 ' + low) : '開始這一堂'}<ArrowRight size={16} /></button>}
          <button type="button" className="word-chip" onClick={openWord}><Star size={14} />今日單字</button>
        </div>
        {!topic && resume === 'later' && active && <button type="button" className="lesson-resume" onClick={() => { location.hash = 'practice/resume' }}>上次那堂（單元 {active.rec.unit} 第 {active.rec.day} 天）還差「表達」，先補完？</button>}
        {others.length > 0 && <details className="lesson-pending">
          <summary>還有 {others.length} 堂沒做完「表達」</summary>
          <ul>{others.slice(0, 6).map(p => <li key={p.date}>
            <button type="button" className="lesson-resume" onClick={() => { location.hash = 'practice/resume-' + p.date }}>{p.date.slice(5).replace('-', '/')} · 單元 {p.rec.unit} 第 {p.rec.day} 天，補完表達</button>
          </li>)}</ul>
        </details>}
        <p className="lesson-stats">{topicDone ? '今天的生活主題完成了 ✓ · ' : ''}{finished ? '今天這一堂完成了 ✓ · ' : ''}累計 {days} 天 · 本週 {weekCount} / 7 天</p>
        <button type="button" className="lesson-level" onClick={() => { location.hash = 'plan/levels' }}>
          {certified ? <>證照 <b>{certified}</b></> : '還沒考證照'} · 正在上 {progress.step.from}→{progress.step.to}{progress.total ? '（單元 ' + Math.min(progress.done + 1, progress.total) + ' / ' + progress.total + '）' : ''} · 升級要考{exams[progress.step.exams[0]].name}
        </button>
      </div>
    </section>
    <div id="today-plan" className="lesson-plan"><TodayPlan state={state} update={update} today={today} energy={energy} onStart={start} onWord={openWord} mode={quiet ? 'nursing' : 'regular'} focus={focus ?? undefined} /></div>
  </>
}

/** School, the English task and the next dream step — folded away so the lesson stays first. */
export function TodayThings({ state, navigate, today, nextStep }: Pick<PageProps, 'state' | 'navigate'> & { today: string; nextStep: string }) {
  const school = schoolToday(state.school, today)
  const schoolSummary = [school.classes, ...school.events, '原訂讀書時段 · ' + school.study].join(' ／ ')
  const rivalry = state.settings.rivalsEnabled ? rivalSummary(state) : ''
  const englishTask = dayBudget(today, state.settings).english
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
  const finished = mainLessonDone(state, today)
  const topic = !choice.quiet && choice.energy !== 'low' ? dueTopic(state, today) : null
  if (topic) return <section className="lesson-banner">
    <div><small>今天這一堂 · 生活主題 {topic.topic.n} · 第 {partNumber(topic.part)} 次</small>
      <strong>{topic.topic.title}：{partPlan[topic.part]}</strong></div>
    <button type="button" onClick={() => start(choice.energy)}><Play size={14} fill="currentColor" />{topic.step > 0 ? '繼續' : '開始'}</button>
  </section>
  const gate = !choice.quiet && choice.energy !== 'low' ? lesson.gate : null
  if (gate) return <section className="lesson-banner">
    <div><small>升級關卡 · {gate.from}→{gate.to} 上完了</small>
      <strong>報名{exams[gate.exams[0]].name}，填上考試日期就能先上下一段</strong></div>
    <button type="button" onClick={() => { location.hash = 'plan/levels' }}><ListChecks size={14} />去填</button>
  </section>
  return <section className="lesson-banner">
    <div><small>{finished ? '今天這一堂完成了 ✓' : choice.quiet ? '考週／實習：課表停在原位' : choice.optional && choice.energy === 'low' ? (choice.kind === 'rest' ? '今天休息' : '今天沒排課') + ' · ' + choice.labels.low + '是選做' : '今天這一堂'}</small>
      <strong>{lesson.done ? '每日課都上完了，今天複習' : choice.quiet ? '單元 ' + lesson.unit + ' 第 ' + lesson.day + ' 天' : lesson.cando || lesson.title}</strong></div>
    <button type="button" onClick={() => start(choice.energy)}><Play size={14} fill="currentColor" />{finished ? '再上一次' : choice.energy === 'low' ? choice.labels.low + '複習' : '開始'}</button>
  </section>
}
