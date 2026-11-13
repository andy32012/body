import { useState } from "react";
import { addDays, attendance, dayKey, weekKey } from "../lib/progress";
import { seasonHistory } from "../lib/rivals";
import type { PageProps } from "../lib/store";
import { getRetentionStatus } from "../lib/grammarRetention";
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

function PracticeCalendar({ sessions, today }: { sessions: Sessions; today: string }) {
  const [selected, select] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = localDate(month + "-01");
  const offset = (first.getDay() + 6) % 7;
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const dates = new Set(sessions.map(session => session.day));
  const activeDays = [...dates].filter(date => date.startsWith(month)).length;
  const activeSessions = sessions.filter(session => session.day === selected);
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
        activeSessions.map(s => battery[s.energy]).join("、") + "練習" : "這天沒有練習紀錄。"}
    </div>
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
  const logs = [...sessions].sort((a, b) => a.day.localeCompare(b.day));
  const history = new Map<string, { date: string, rating: Rating, revealed: boolean }[]>();
  const counts = { correct: 0, minor: 0, again: 0 };
  for (const session of logs) {
    for (const translation of session.translations ?? []) {
      counts[translation.rating]++;
      for (const tag of new Set(translation.grammar)) {
        const seen = history.get(tag) ?? [];
        seen.push({ date: session.day, rating: translation.rating, revealed: translation.revealed });
        history.set(tag, seen);
      }
    }
  }
  const categories = { "穩了": [] as string[], "還常錯": [] as string[], "練習中": [] as string[] };
  history.forEach((entries, tag) => {
    const latest = entries[entries.length - 1];
    const lastTwo = entries.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every(e => e.rating !== "correct")) {
      categories["還常錯"].push(tag);
    } else if (latest.rating === "correct" && !latest.revealed &&
        entries.some(e => e.rating === "correct" && !e.revealed && e.date <= addDays(latest.date, -4))) {
      categories["穩了"].push(tag);
    } else {
      categories["練習中"].push(tag);
    }
  });
  return <section className="history-section history-grammar">
    <h2>文法星圖</h2>
    <p className="history-note">兩次相隔至少四天，都能自己答對的文法點會標成「穩了」。</p>
    {history.size === 0 ? <p>完成中翻英並自評後，這裡會出現你練過的文法點。</p> :
      Object.entries(categories).filter(([, tags]) => tags.length).map(([label, tags]) =>
        <div key={label}><h3>{label}</h3>{tags.map(tag => <span className="history-chip" key={tag}>{tag}</span>)}</div>)}
    <h3>中翻英自評</h3>
    <div>{(Object.keys(ratings) as Rating[]).map(key => <span key={key} className="history-chip">{ratings[key]} {counts[key]} 句</span>)}</div>
  </section>;
}

export default function History({ state }: PageProps) {
  const today = dayKey();
  const { sessions, cards, reviewEvents, settings } = state;
  const days = new Set(sessions.map(s => s.day)).size;
  const words = new Set(sessions.flatMap(session => session.words).map(word => word.trim().toLowerCase()).filter(Boolean)).size;
  const spoken = sessions.reduce((total, s) => total + (s.spokenIds?.length ?? 0), 0);
  const translated = sessions.reduce((total, s) => total + (s.translations?.length ?? 0), 0);
  const wordCards = cards.filter(card => card.id.startsWith("word:"));
  const delayed = reviewEvents.filter(e => e.gap >= 4 && !e.shownAnswer);
  const recalled = delayed.filter(e => e.remembered && !e.shownAnswer).length;
  const continuity = attendance(sessions, today, settings.restDays, settings.periods);
  const pastSeason = seasonHistory(state)[0];
  return <div className="history-page">
    <header className="history-hero">
      <img src="./cosmos/g03.webp" alt="" className="history-galaxy" onError={event => { event.currentTarget.hidden = true; }} />
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
    <PracticeCalendar sessions={sessions} today={today} />
    <WeeklyChart sessions={sessions} today={today} />
    <GrammarHistory sessions={sessions} />
    {state.curriculum.stableUnits.length>0 && <section className="history-section"><h2>單元回想</h2><p className="history-note">隔三個單元回想舊句。連續兩次想不起來的單元會優先複習。</p>{state.curriculum.stableUnits.map(id=><span key={id} className="history-chip">單元 {id} · {getRetentionStatus(state.notes,id)}</span>)}</section>}
    <section className="history-section history-recall">
      <h2>隔幾天，還記得嗎？</h2>
      <p>{delayed.length ? "相隔至少四天再複習且未看答案，共 " + delayed.length + " 次，其中 " + recalled + " 次能自己想起來。" : "第一次隔四天再複習後，這裡會記下你自己想起來的比例。"}
        {delayed.length > 0 && <strong> {Math.round(recalled / delayed.length * 100)}%</strong>}</p>
      <h3>單字複習盒</h3><div className="history-boxes">{[1, 2, 4, 8, 16].map((interval, index) =>
        <div key={interval}><b>{wordCards.filter(card => card.box === index + 1).length}</b><small>{interval} 天格</small></div>)}</div>
      <p className="history-note">曾經學會 {wordCards.filter(card => card.mastered).length} 個字 · 快篩已認得 {state.knownWords.length} 個字</p>
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
