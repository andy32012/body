import ScenePhoto from "../components/ScenePhoto";
import { useState } from "react";
import type { PageProps } from "../lib/store";
import { dayKey } from "../lib/progress";
import { schoolToday, makeSchoolId } from "../lib/school";
import { originalPlan, planEnd, projectCalendar } from "../lib/projection";
import { readTopic, topics as lifeTopics } from "../lib/topics";
import plan from "../data/plan.json";
import curriculum from "../data/curriculum.json";
import Roadmap from "../components/Roadmap";
import ExamMap from "../components/ExamMap";
import LevelLadder from "../components/LevelLadder";
import { firstLockedUnit } from "../lib/cefr";
import Rivals from "./Rivals";
import IeltsMockLog from "../components/IeltsMockLog";
import { mockGoal } from "../lib/ieltsMock";
import "./plan.css";

const tracks = ["school", "english", "dream"] as const;
type Track = (typeof tracks)[number];
const trackNames = { school: "學校", english: "英文", dream: "夢想" };
const weekNames = ["一", "二", "三", "四", "五", "六", "日"];
const trackSymbols = { school: "▤", english: "Aa", dream: "✧" };
const monthString = (d: Date) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const asDate = (key: string) => new Date(key + "T12:00:00");
function shiftMonth(month: string, offset: number) {
  const d = asDate(month + "-01");
  d.setMonth(d.getMonth() + offset);
  return monthString(d);
}
function monthTitle(month: string) {
  return Number(month.slice(0, 4)) + " 年 " + Number(month.slice(5)) + " 月";
}
type Goal = { id: string; source: string; track: Track; text: string };
// A month can leave a track empty (the dream track during the licensing exam, say): no goal then.
const baseGoals: Goal[] = plan.months.flatMap((m) =>
  tracks.flatMap((track) => m[track] ? [{
    id: "plan." + m.month + "." + track,
    source: m.month,
    track,
    text: m[track],
  }] : []),
);

export type PlanTab = "calendar" | "levels" | "timeline" | "map" | "exam" | "rivals";
const firstMonth = plan.months[0].month;
const lastMonth = planEnd.slice(0, 7);
const monthFormat = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const calendarMonth = (value: string) => monthFormat.test(value) && value >= firstMonth && value <= lastMonth;
const firstMoveMonth = (source: string) => calendarMonth(source) ? shiftMonth(source, 1) : firstMonth;
const canMoveTo = (source: string, destination: string) =>
  calendarMonth(destination) && (!calendarMonth(source) || destination > source);
export default function Plan(props: PageProps & { tab: PlanTab; onTabChange: (tab: PlanTab) => void }) {
  const { state, update, navigate, tab, onTabChange } = props;
  const today = dayKey();
  const thisMonth = today.slice(0, 7);
  const initialMonth = thisMonth < firstMonth ? firstMonth : thisMonth > lastMonth ? lastMonth : thisMonth;
  const [month, setMonth] = useState(initialMonth);
  const [selected, setSelected] = useState(() => initialMonth === thisMonth ? today : initialMonth + "-01");
  const [expanded, setExpanded] = useState<number | null>(
    Number(today.slice(0, 4)),
  );
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState("");
  const [track, setTrack] = useState<Track>("school");
  const [lastMove, setLastMove] = useState<{ key: string; destination: string; message: string }>();
  const [replanSource, setReplanSource] = useState(
    initialMonth === firstMonth ? initialMonth : shiftMonth(initialMonth, -1),
  );
  const [replanTo, setReplanTo] = useState(
    firstMoveMonth(replanSource),
  );
  const dates = asDate(month + "-01");
  const days = new Date(dates.getFullYear(), dates.getMonth() + 1, 0).getDate();
  const leading = (dates.getDay() + 6) % 7;
  const cursor = Math.max(
    0,
    (state.curriculum.unit - 1) * 6 + state.curriculum.day - 1,
  );
  const calendar = projectCalendar({
    today,
    from: month + "-01",
    to: month + "-" + days,
    cursor,
    sessions: state.sessions,
    ranges: state.settings.periods,
    startedDay: state.startedDay,
    weekdays: state.settings.regularDays,
    restDays: state.settings.restDays,
    retry: Boolean(state.curriculum.retry),
    lockedUnit: firstLockedUnit(state.notes, state.curriculum.unit),
    topics: lifeTopics.map((t) => {
      const rec = readTopic(state.notes, t.id);
      return { n: t.n, title: t.title, after: t.after, done: rec.done, open: rec.cur && !rec.done[rec.cur.part] ? rec.cur.part : undefined };
    }),
  });
  const dailySchool = schoolToday(state.school, selected);
  const selectedEntry = calendar.find((item) => item.day === selected);
  const lesson = curriculum.units.find(
    (unit) => unit.id === selectedEntry?.unit,
  );
  const sentence = lesson?.days?.find(
    (item) => item.day === selectedEntry?.lessonDay,
  );
  const customGoals: Goal[] = Object.entries(state.notes).flatMap(
    ([key, text]) => {
      const m =
        /^plan-custom\.(\d{4}-\d{2})\.(school|english|dream)\.(.+)$/.exec(key);
      return m ? [{ id: key, source: m[1], track: m[2] as Track, text }] : [];
    },
  );
  const goals = [...baseGoals, ...customGoals];
  const where = (goal: Goal) => state.notes["move." + goal.id] || goal.source;
  const recovering = !calendarMonth(replanSource);
  const earliestMove = firstMoveMonth(replanSource);
  const canSelectMoveMonth = earliestMove <= lastMonth;
  const openGoals = goals.filter(
    (g) => where(g) === replanSource && (recovering || !state.checks[g.id]),
  );
  const sourceMonths = [
    ...new Set([
      ...goals.map(where).filter((v) => v !== "removed"),
      replanSource,
    ]),
  ]
    .sort()
    .reverse();
  function switchMonth(next: string) {
    if (!calendarMonth(next)) return;
    setMonth(next);
    setSelected(next === thisMonth ? today : next + "-01");
  }
  function toggle(id: string) {
    update((s) => ({ ...s, checks: { ...s.checks, [id]: !s.checks[id] } }));
  }
  function moveGoal(goal: Goal, destination: string) {
    if (destination !== "removed" && !canMoveTo(replanSource, destination)) return;
    const key = "move." + goal.id;
    update((s) => (s.notes[key] || goal.source) === replanSource
      ? { ...s, notes: { ...s.notes, [key]: destination } }
      : s);
    setLastMove({
      key,
      destination,
      message: destination === "removed"
        ? "已從月計畫移除「" + goal.text + "」。"
        : "已排到 " + monthTitle(destination) + "。",
    });
  }
  function addGoal() {
    if (!custom.trim()) return;
    const id = "plan-custom." + month + "." + track + "." + makeSchoolId();
    update((s) => ({ ...s, notes: { ...s.notes, [id]: custom.trim() } }));
    setCustom("");
  }
  const replanDue =
    !state.checks["replan." + thisMonth] &&
    (today.endsWith("-01") ||
      ["01", "07"].includes(thisMonth.slice(-2)) ||
      state.settings.periods.some(
        (p) =>
          p.type === "semester" &&
          p.start <= today &&
          +asDate(today) - +asDate(p.start) < 7 * 86400000,
      ));
  function goalRow(id: string, track: Track, text: string) {
    return (
      <label className="pl-goal" key={id}>
        <input
          type="checkbox"
          checked={Boolean(state.checks[id])}
          onChange={() => toggle(id)}
        />
        <span className={"pl-track " + track}>{trackNames[track]}</span>
        <span>{text}</span>
      </label>
    );
  }
  const practicedDays = new Set(state.sessions.map((session) => session.day));
  const plannedLessons = calendar.filter(entry => entry.kind === "lesson").length;
  const heroDetail = tab === "levels" ? "A1 → C2，每一級考一張證照才升級" : tab === "rivals" ? "跟虛擬對手比每週練習" : tab === "exam" ? "台灣護理師國考 5 科，對應的英文練習" : tab === "calendar"
    ? `${Number(month.slice(5))} 月預排 ${plannedLessons} 天課程`
    : tab === "timeline"
      ? `${plan.years[0].year} — ${plan.years[plan.years.length - 1].year}`
      : "從學校課程到赴美就業";
  return (
    <section className="pl-page" aria-label="計畫">
      <header className="pl-title">
        <ScenePhoto className="pl-photo" />
        <div>
          <h1>計畫星圖</h1>
          <p className="pl-note">{heroDetail}</p>
        </div>
      </header>
      <div className="pl-switch" aria-label="計畫檢視">
        {(
          [
            ["calendar", "每月行程"],
            ["levels", "英文程度"],
            ["timeline", "年度目標"],
            ["map", "赴美路線"],
            ["exam", "國考對照"],
            ["rivals", "排行榜"],
          ] as const
        ).filter(([key]) => key !== "rivals" || state.settings.rivalsEnabled).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => onTabChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "rivals" && <Rivals {...props} />}
      {tab === "exam" && <ExamMap state={state} update={props.update} />}
      {tab === "levels" && <LevelLadder state={state} update={update} />}
      {tab === "map" && (
        <>
          <Roadmap {...props} />
          <p className="pl-planning-note">{plan.notice}</p>
        </>
      )}
      {tab === "timeline" && (
        <section className="pl-panel pl-timeline">
          <div className="pl-head">
            <div>
              <h2>年度時間軸</h2>
              <small>{plan.statusLabel}</small>
            </div>
          </div>
          <p className="pl-planning-note">{plan.notice}</p>
          <div className="pl-years">
            {plan.years.map((y) => (
              <article key={y.year}>
                <button
                  className="pl-year"
                  aria-expanded={expanded === y.year}
                  onClick={() =>
                    setExpanded(expanded === y.year ? null : y.year)
                  }
                >
                  <strong>{y.year}</strong>
                  <span>
                    {
                      tracks.filter(
                        (t) => state.checks["plan." + y.year + "." + t],
                      ).length
                    }{" "}
                    / 3
                  </span>
                  <b aria-hidden="true">{expanded === y.year ? "−" : "＋"}</b>
                </button>
                {expanded === y.year && (
                  <div className="pl-year-goals">
                    {tracks.map((t) =>
                      goalRow("plan." + y.year + "." + t, t, y[t]),
                    )}
                    <div className="pl-month-links">
                      {plan.months
                        .filter((m) => m.month.startsWith(String(y.year)))
                        .map((m) => (
                          <button
                            key={m.month}
                            onClick={() => {
                              switchMonth(m.month);
                              onTabChange("calendar");
                            }}
                          >
                            {Number(m.month.slice(-2))} 月
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {tab === "calendar" && (
        <>
          <div className="pl-calendar-layout">
          <section className="pl-panel pl-calendar">
            <div className="pl-head">
              <div>
                <small>英文課表預排</small>
                <h2>{monthTitle(month)}</h2>
              </div>
              <div className="pl-controls">
                <button
                  aria-label="上個月"
                  disabled={month <= firstMonth}
                  onClick={() => switchMonth(shiftMonth(month, -1))}
                >
                  ‹
                </button>
                <button disabled={!calendarMonth(thisMonth)} onClick={() => switchMonth(thisMonth)}>今天</button>
                <button
                  aria-label="下個月"
                  disabled={month >= lastMonth}
                  onClick={() => switchMonth(shiftMonth(month, 1))}
                >
                  ›
                </button>
              </div>
            </div>
            <label className="pl-jump">
              跳至月份
              <input
                aria-label="跳至月份"
                type="month"
                value={month}
                min={firstMonth}
                max={lastMonth}
                onChange={(e) => switchMonth(e.target.value)}
              />
            </label>
            <div className="pl-grid">
              {weekNames.map((w) => (
                <span className="pl-week" key={w}>
                  {w}
                </span>
              ))}
              {Array.from({ length: leading }, (_, i) => (
                <span key={"blank" + i} />
              ))}
              {calendar.map((entry) => {
                const completed = practicedDays.has(entry.day);
                return (
                  <button
                    key={entry.day}
                    className={
                      "pl-cell " +
                      (completed ? "done" : entry.kind) +
                      (entry.day === today ? " today" : "")
                    }
                    aria-pressed={selected === entry.day}
                    aria-label={
                      entry.day + " " + (completed ? "已練習" : entry.label)
                    }
                    onClick={() => setSelected(entry.day)}
                  >
                    <b>{Number(entry.day.slice(-2))}</b>
                    <small>
                      {completed
                        ? "已練"
                        : entry.day < today
                          ? ""
                          : entry.topic
                            ? "主題 " + entry.topic.n
                            : entry.kind === "lesson" && entry.unit
                            ? entry.unit + "－" + entry.lessonDay
                            : entry.kind === "rest"
                              ? "休息"
                              : entry.kind === "review"
                                ? "複習"
                                : "預排"}
                    </small>
                  </button>
                );
              })}
            </div>
            <p className="pl-fine">
              依最近四週的進度預排，生活主題和文法課輪流排。考週、實習和休息日保留原進度。
            </p>
          </section>
          <section className="pl-day" aria-live="polite">
            <header className="pl-date-stamp">
              <time dateTime={selected}>{Number(selected.slice(5, 7))} 月 <b>{Number(selected.slice(-2))}</b> 日</time>
              <span>星期{"日一二三四五六"[asDate(selected).getDay()]}</span>
            </header>
            <div className="pl-agenda">
              <h3>
                {practicedDays.has(selected)
                  ? "已留下練習紀錄"
                  : selected < today
                    ? "這天沒有練習紀錄"
                    : selectedEntry?.label || "課表待確認"}
              </h3>
              {selected >= today && selectedEntry?.kind === "lesson" && !selectedEntry.topic && (
                <p>
                  {lesson?.title}
                  {sentence?.zh && " · " + sentence.zh}
                </p>
              )}
              <p>{dailySchool.summary}</p>
              {selectedEntry?.original && (
                <small>原課表安排 · {selectedEntry.original}</small>
              )}
            </div>
          </section>
          </div>
          <section className="pl-panel">
            <div className="pl-head">
              <div>
                <h2>{Number(month.slice(-2))} 月的目標</h2>
                <small>{plan.statusLabel}</small>
              </div>
            </div>
            {month > plan.months[plan.months.length - 1].month && (
              <p className="pl-month-outlook">
                英文預定進度 · {originalPlan(month + "-01")}
              </p>
            )}
            {goals
              .filter((g) => where(g) === month)
              .map((g) => goalRow(g.id, g.track, g.text))}
            {goals.some((g) => where(g) === month && g.track === "english" && mockGoal(g.text)) && <IeltsMockLog state={state} update={update} />}
            <details className="pl-add">
              <summary>新增這個月的目標</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addGoal();
                }}
              >
                <label>
                  目標類別
                  <select
                    value={track}
                    onChange={(e) => setTrack(e.target.value as Track)}
                  >
                    {tracks.map((t) => (
                      <option key={t} value={t}>
                        {trackSymbols[t]} {trackNames[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  目標內容
                  <input
                    value={custom}
                    maxLength={180}
                    onChange={(e) => setCustom(e.target.value)}
                    required
                  />
                </label>
                <button>加入</button>
              </form>
            </details>
          </section>
          <section className="pl-panel">
            <div className="pl-head">
              <div>
                <h2>重排計畫</h2>
                <small>
                  {replanDue
                    ? "這個月可以重新安排課業與目標。"
                    : "配合新課表，調整手邊的事。"}
                </small>
              </div>
              <button
                className="pl-outline"
                aria-expanded={editing || replanDue}
                onClick={() => {
                  if (replanDue && !editing)
                    update((s) => ({
                      ...s,
                      checks: { ...s.checks, ["replan." + thisMonth]: true },
                    }));
                  setEditing(!(editing || replanDue));
                }}
              >
                {editing || replanDue ? "收起" : "調整"}
              </button>
            </div>
            {(editing || replanDue) && (
              <div className="pl-replan">
                <button
                  className="pl-outline"
                  onClick={() => navigate("settings")}
                >
                  編輯學期課表、考試與實習日期
                </button>
                <label>
                  挑選月份
                  <select
                    value={replanSource}
                    onChange={(e) => {
                      const source = e.target.value;
                      setReplanSource(source);
                      if (!canMoveTo(source, replanTo)) {
                        const first = firstMoveMonth(source);
                        setReplanTo(first <= lastMonth ? first : "");
                      }
                    }}
                  >
                    {sourceMonths.map((m) => (
                      <option key={m} value={m}>
                        {monthFormat.test(m) ? monthTitle(m) : m}{!calendarMonth(m) && "（在日曆範圍外）"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {recovering ? "移回日曆月份" : "順延到"}
                  <input
                    type="month"
                    value={replanTo}
                    min={canSelectMoveMonth ? earliestMove : undefined}
                    max={lastMonth}
                    disabled={!canSelectMoveMonth}
                    onChange={(e) => setReplanTo(e.target.value)}
                  />
                </label>
                {!canSelectMoveMonth && <p>這已經是日曆的最後一個月。</p>}
                {recovering && <p>這些目標原先被排到日曆範圍外，可以選一個月份移回來，已勾的完成狀態會保留。</p>}
                {openGoals.length === 0 && <p>這個月沒有需要移動的目標。</p>}
                {openGoals.map((g) => (
                  <div key={g.id} className="pl-replan-row">
                    <span>
                      {trackNames[g.track]} · {g.text}
                    </span>
                    <div>
                      <button
                        disabled={!canMoveTo(replanSource, replanTo)}
                        onClick={() => moveGoal(g, replanTo)}
                      >
                        {recovering ? "移回月計畫" : "順延"}
                      </button>
                      <button onClick={() => moveGoal(g, "removed")}>
                        移除
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  className="pl-outline"
                  onClick={() => {
                    update((s) => ({
                      ...s,
                      checks: { ...s.checks, ["replan." + thisMonth]: true },
                    }));
                    setEditing(false);
                  }}
                >
                  完成這次重排
                </button>
              </div>
            )}
          </section>
          <p role="status" className="pl-status">
            {lastMove && state.notes[lastMove.key] === lastMove.destination ? lastMove.message : ""}
          </p>
        </>
      )}
    </section>
  );
}


