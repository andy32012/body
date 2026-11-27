import ScenePhoto from "../components/ScenePhoto";
import { useState } from "react";
import { addDays, attendance, dayKey, intervals, weekKey } from "../lib/progress";
import { seasonHistory } from "../lib/rivals";
import { delayedRecall } from "../lib/compact";
import type { PageProps } from "../lib/store";
import { getRetentionStatus, grammarStars } from "../lib/grammarRetention";
import EvidencePanel from "../components/EvidencePanel";
import { levelNames, type Level } from "../lib/evidence";
import { lessonTarget, parseLessonTarget, readDayLessons, resumePhase, stepLabel, type LessonRecord } from "../lib/lesson";
import { sentenceById, units } from "../lib/todayLesson";
import { readTopic, topicStatus, topics } from "../lib/topics";
import { wordKey } from "../lib/vocab";
import { isSortedKey, mergeSortedWords } from "../lib/dailyWords";
import "./history.css";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const battery = { low: "累爆", normal: "普通", high: "有電" };
const ratings = { correct: "對了", minor: "小錯", again: "不會" };
type Rating = keyof typeof ratings;
type Sessions = PageProps["state"]["sessions"];

function localDate(key: string) {
  return new Date(key + "T12:00:00");
}

function calendarDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function changeMonth(key: string, offset: number) {
  const date = localDate(key + "-01");
  date.setMonth(date.getMonth() + offset);
  return calendarDate(date).slice(0, 7);
}

function LessonDetails({ record, target, expanded }: { record: LessonRecord; target: string; expanded: boolean }) {
  const done = record.steps.includes("done");
  const title = units.find(unit => unit.id === record.unit)?.title;
  const corrections = record.express;
  const attempts = [...(record.recalls ?? []), ...(record.records ?? [])];
  const vary = Object.entries(record.varyChecks ?? {}).filter(([, check]) => check.answer || check.last?.text || check.before);
  return <details open={expanded || undefined}>
    <summary>單元 {record.unit} 第 {record.day} 天{title ? " · " + title : ""} · {done ? "已完成" : "目前進度「" + stepLabel[resumePhase(record) ?? "recall"] + "」"}</summary>
    {!done && <p><a href={"#practice/resume-" + target}>繼續這堂課</a></p>}
    {record.heard && <p>聽懂 · {record.heard.counted ? `${record.heard.correct} / ${record.heard.total}` : "有提示的練習"}</p>}
    {record.voiceExpression && <p>表達口說 · 與 Emma 練習 {record.voiceExpression.turns} 段</p>}
    {attempts.length > 0 && <ul>{attempts.map((attempt, index) => {
      const hint = record.hints?.[attempt.sentenceId];
      const sentence = sentenceById.get(attempt.sentenceId);
      return <li key={`${attempt.sentenceId}.${index}`}>{sentence?.zh ?? "中翻英作答"} · {ratings[attempt.rating]}
        {(attempt.revealed || !!hint?.r || !!hint?.c) && "（有提示）"}
        {attempt.answer && <p lang="en">{attempt.answer}</p>}
      </li>;
    })}</ul>}
    {vary.length > 0 && <ul>{vary.map(([index, check]) => <li key={index}>
      換個說法 {Number(index) + 1}{check.revealed && "（有提示）"}<p lang="en">{check.answer || check.last?.text || check.before}</p>
    </li>)}</ul>}
    {corrections && <div>
      {corrections.first && <p>表達初稿 <span lang="en">{corrections.first}</span></p>}
      {corrections.lastAnswer && <p>最近一次作答 <span lang="en">{corrections.lastAnswer}</span></p>}
      {corrections.finalAnswer && corrections.finalAnswer !== (corrections.lastAnswer || corrections.first) &&
        <p>完成時的文字 <span lang="en">{corrections.finalAnswer}</span></p>}
      {corrections.firstResult && <p>批改結果 <span lang="en">{corrections.firstResult.corrected}</span></p>}
      {corrections.last && <p>最近一次批改 <span lang="en">{corrections.last.corrected}</span></p>}
      {corrections.others?.map((answer, index) => <p key={index}>其他裝置的作答 <span lang="en">{answer.finalAnswer || answer.lastAnswer || answer.first}</span></p>)}
      {corrections.discussion?.map(reply => <div key={reply.id}><p>追問 {reply.question}</p><p>{reply.reply}</p></div>)}
    </div>}
    {record.slim && <p>這堂舊課已整理，這裡保留作答摘要。</p>}
  </details>;
}

function PracticeCalendar({ sessions, notes, today, initialDate, initialTarget }: {
  sessions: Sessions; notes: Record<string, string>; today: string; initialDate: string; initialTarget?: string;
}) {
  const [selected, select] = useState(initialDate);
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const first = localDate(month + "-01");
  const offset = (first.getDay() + 6) % 7;
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const dates = new Set(sessions.map(session => session.day));
  for (const key of Object.keys(notes)) {
    const date = /^lesson\.(\d{4}-\d{2}-\d{2})$/.exec(key)?.[1];
    if (date && readDayLessons(notes, date).length) dates.add(date);
  }
  const activeDays = [...dates].filter(date => date.startsWith(month)).length;
  const activeSessions = sessions.filter(session => session.day === selected);
  const lessons = readDayLessons(notes, selected);
  function move(amount: number) {
    const next = changeMonth(month, amount);
    setMonth(next);
    select(next === today.slice(0, 7) ? today : next + "-01");
  }

  return <section className="history-section history-month">
    <div className="history-row">
      <h2>{first.getFullYear()} 年 {first.getMonth() + 1} 月</h2>
      <div className="history-controls">
        <button type="button" onClick={() => move(-1)} aria-label="上個月">‹</button>
        <button type="button" onClick={() => move(1)} aria-label="下個月" disabled={month >= today.slice(0, 7)}>›</button>
      </div>
    </div>
    <p className="history-note">本月練習 {activeDays} 天。點選日期查看紀錄。</p>
    <div className="history-calendar">
      {weekdays.map(label => <span key={label} className="history-weekday">{label}</span>)}
      {Array.from({ length: offset }, (_, i) => <span aria-hidden="true" key={"empty" + i} />)}
      {Array.from({ length }, (_, i) => {
        const date = month + "-" + String(i + 1).padStart(2, "0");
        const practiced = dates.has(date);
        return <button type="button" key={date} aria-pressed={selected === date} disabled={date > today}
          aria-label={date + (practiced ? " 有練習" : "")} className={practiced ? "practiced" : ""}
          onClick={() => select(date)}>{i + 1}</button>;
      })}
    </div>
    <div className="history-day-note" aria-live="polite">
      {Number(selected.slice(5, 7))} 月 {Number(selected.slice(8))} 日 · {activeSessions.length ?
        activeSessions.map(s => battery[s.energy]).join("、") + "練習" : lessons.length ? "每日課" : "這天沒有練習紀錄。"}
    </div>
    {lessons.map(record => {
      const target = lessonTarget(selected, record);
      return <LessonDetails key={target} record={record} target={target} expanded={initialTarget === target || (initialTarget === selected && lessons.length === 1)} />;
    })}
  </section>;
}

function WeeklyChart({ sessions, today }: { sessions: Sessions; today: string }) {
  const currentWeek = weekKey(today);
  const days = new Set(sessions.map(s => s.day));
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const from = addDays(currentWeek, (i - 11) * 7);
    const end = addDays(from, 6);
    return { from, count: [...days].filter(day => from <= day && day <= end).length };
  });
  const total = weeks.reduce((sum, week) => sum + week.count, 0);
  return <section className="history-section history-trend">
    <h2>最近 12 週</h2>
    <p className="history-trend-total"><strong>{total}</strong> 天有練習</p>
    <p className="history-note">每週練習天數</p>
    <ol className="history-bars">
      {weeks.map(({ from, count }, i) => <li key={from} aria-label={from + " 起，練習 " + count + " 天"} title={from + " 起，" + count + " 天"}>
        <small aria-hidden="true">{count}</small>
        <div className="history-bar-track" aria-hidden="true">{count > 0 && <div className="history-bar-fill" style={{ height: (count / 7) * 100 + "%" }} />}</div>
        <small aria-hidden="true">{i === 0 ? Number(from.slice(5, 7)) + "/" + Number(from.slice(8)) : i === 11 ? "本週" : ""}</small>
      </li>)}
    </ol>
  </section>;
}

function GrammarHistory({ sessions }: { sessions: Sessions }) {
  const { stars: categories, counts, practised } = grammarStars(sessions);
  return <section className="history-section history-grammar">
    <h2>文法星圖</h2>
    <p className="history-note">同一個文法點換一句、兩次相隔至少四天，都自己答對而且確認過（Claude 看過，或跟參考答案一樣），才會標成「穩了」；同一句背熟答對兩次不算。沒人確認的自評「對了」不算。</p>
    {practised === 0 ? <p>完成中翻英並自評後，這裡會出現你練過的文法點。</p> :
      Object.entries(categories).filter(([, tags]) => tags.length).map(([label, tags]) =>
        <div key={label}><h3>{label}</h3>{tags.map(tag => <span className="history-chip" key={tag}>{tag}</span>)}</div>)}
    <h3>中翻英自評</h3>
    <div>{(Object.keys(ratings) as Rating[]).map(key => <span key={key} className="history-chip">{ratings[key]} {counts[key]} 句</span>)}</div>
  </section>;
}

const levelText = (l: Level | null | undefined) => (l ? levelNames[l] : "未作答");
/** Life topics: three sessions each; only the delayed, changed-context one can show 「延後換題仍能完成」. */
function TopicHistory({ state }: { state: PageProps["state"] }) {
  const rows = topics.map(t => ({ t, rec: readTopic(state.notes, t.id), open: state.curriculum.unit > t.after }));
  return <section className="history-section history-topics">
    <h2>生活主題</h2>
    <p className="history-note">每個主題分三次：理解 → 說和寫 → 隔幾天換情境。換情境的筆答有兩句以上自己寫對、而且確認過，才算「延後換題仍能完成」；口說另外記，只用打字的不算口說，發音沒有評估。</p>
    <ul>{rows.map(({ t, rec, open }) => <li key={t.id}>
      <div><strong>{t.n}. {t.title}</strong><span className="history-chip">{open ? topicStatus(rec) : "上完單元 " + t.after + " 後開始"}</span></div>
      {rec.done.A && rec.listen && <small>{rec.listen.unsure && !rec.listen.plays ? "播放沒有確認：" : "只聽不看字："}大意 {rec.listen?.noVoice ? "—" : rec.listen?.gist ? "✓" : "✗"}、細節 {rec.listen?.details ?? 0} / {rec.listen?.total ?? 0}{rec.listen?.replays ? "（另外重聽 " + rec.listen.replays + " 次）" : ""} · 讀：{rec.read ? rec.read.correct + " / " + rec.read.total : "—"}</small>}
      {rec.done.B && <small>說：{rec.speak?.mode === "typed" ? "只用打字（不算口說）" : levelText(rec.speak?.level) + "（發音未評估）"} · 寫訊息：{levelText(rec.write?.level)}</small>}
      {rec.done.C && <small>換情境說：{rec.review?.speak?.mode === "typed" ? "只用打字（不算口說）" : levelText(rec.review?.speak?.level)}</small>}
    </li>)}</ul>
  </section>;
}

export default function History({ state, initialTarget }: PageProps & { initialTarget?: string }) {
  const today = dayKey();
  const date = initialTarget && parseLessonTarget(initialTarget)?.date;
  const selectedDate = date && date <= today && calendarDate(localDate(date)) === date ? date : today;
  const { sessions, cards, settings } = state;
  const days = new Set(sessions.map(s => s.day)).size;
  const dailyLearned = Object.entries(state.notes).flatMap(([key, value]) =>
    isSortedKey(key) ? mergeSortedWords(undefined, value).filter(word => !word.known).map(word => word.k) : []);
  const words = new Set([...sessions.flatMap(session => session.words), ...dailyLearned].map(wordKey).filter(Boolean)).size;
  const spoken = sessions.reduce((total, s) => total + (s.spokenIds?.length ?? 0), 0);
  const translated = sessions.reduce((total, s) => total + (s.translations?.filter(t => t.attempted !== false).length ?? 0), 0);
  const wordCards = cards.filter(card => card.id.startsWith("word:"));
  // Older review lines are folded into totals (compact.ts); the numbers include them.
  const { delayed: delayedCount, recalled } = delayedRecall(state);
  const continuity = attendance(sessions, today, settings.restDays, settings.periods);
  const pastSeason = seasonHistory(state)[0];
  return <div className="history-page">
    <header className="history-hero">
      <ScenePhoto className="history-photo" />
      <div className="history-hero-copy">
        <h1>練習紀錄</h1>
        <p className="history-count"><span>累計練習</span><strong>{days}</strong><span>天</span></p>
      </div>
      <dl className="history-stats">
        <div><dt>學過的單字</dt><dd>{words}<small> 個</small></dd></div>
        <div><dt>說過的句子</dt><dd>{spoken}<small> 句</small></dd></div>
        <div><dt>完成中翻英</dt><dd>{translated}<small> 句</small></dd></div>
      </dl>
    </header>
    <div className="history-grid">
    <PracticeCalendar key={initialTarget} sessions={sessions} notes={state.notes} today={today} initialDate={selectedDate} initialTarget={initialTarget} />
    <WeeklyChart sessions={sessions} today={today} />
    <EvidencePanel state={state} />
    <GrammarHistory sessions={sessions} />
    <TopicHistory state={state} />
    {state.curriculum.stableUnits.length>0 && <section className="history-section"><h2>單元回想</h2><p className="history-note">隔三個單元回想舊句。連續兩次想不起來的單元會優先複習。</p>{state.curriculum.stableUnits.map(id=><span key={id} className="history-chip">單元 {id} · {getRetentionStatus(state.notes,id)}</span>)}</section>}
    <section className="history-section history-recall">
      <h2>隔幾天，還記得嗎？</h2>
      <p>{delayedCount ? "相隔至少四天再複習且未看答案，共 " + delayedCount + " 次，其中 " + recalled + " 次能自己想起來。" : "第一次隔四天再複習後，這裡會記下你自己想起來的比例。"}
        {delayedCount > 0 && <strong> {Math.round(recalled / delayedCount * 100)}%</strong>}</p>
      <h3>單字卡現在隔幾天複習</h3><p className="history-note">用 FSRS 依每張卡的記憶狀態排：記得越穩，隔得越久（最長一年）；忘了就縮短，不會從頭來。</p><div className="history-boxes">{intervals.map((interval, index) =>
        <div key={interval}><b>{wordCards.filter(card => card.box === index + 1).length}</b><small>{interval === 1 ? '1 天' : '≥' + interval + ' 天'}</small></div>)}</div>
      <p className="history-note">曾經學會 {wordCards.filter(card => card.mastered).length} 個字 · 已標成認得 {new Set(state.knownWords.map(wordKey)).size} 個字</p>
    </section>
    {settings.rivalsEnabled && pastSeason && <section className="history-section"><h2>上一季 · {pastSeason.label}</h2>
      <p>競賽 {pastSeason.weeks} 週，第一名 {pastSeason.firsts} 次，平均第 {pastSeason.averageRank.toFixed(1)} 名。</p></section>}
    {settings.showStreak && <details className="history-section"><summary>連續練習與請假卡</summary>
      <p>連續練習 {continuity.streak} 天 · 請假卡 {continuity.leave} 張</p>
      <p className="history-note">每累計練七天獲得一張請假卡，最多保留兩張。休息日、考週和實習不會打斷連續紀錄。</p>
    </details>}
    </div>
  </div>;
}
