import { PracticeCover } from "../components/PracticeCover";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Headphones, Check, PenLine } from "lucide-react";
import PassageLibrary from "../components/PassageLibrary";
import QuizPractice from "../components/QuizPractice";
import ClinicalCase from "../components/ClinicalCase";
import { Translation, type Mark } from "../components/Translation";
import { AskWord } from "../components/AIChat";
import sentences from "../data/sentences.json";
import words from "../data/words.json";
import SpeechPractice from "../components/SpeechPractice";
import NursingListen from "../components/NursingListen";
import NursingWords from "../components/NursingWords";
import type { PageProps, Session } from "../lib/store";
import {
  activePeriod,
  dayKey,
  dueCards,
  newCard,
  reviewBudget,
  reviewCard,
  applyAnswer,
  reviewEnergy,
  reviewLoad,
  logSentence,
  sentenceReviewKey,
  SENTENCE_QUOTA,
  type Energy,
} from "../lib/progress";
import { wordKey, officialWords, spellingTargets } from "../lib/vocab";
import VocabScreen from "../components/VocabScreen";
import { addSayCard } from "../lib/sayCards";
import WordSkills from "../components/WordSkills";
import {
  addEvidence,
  answered,
  judgeCheckpoint,
  judgeExpress,
  judgeVariation,
  judgeWritten,
  levelNames,
  readEvidence,
  sourceNames,
  type Evidence,
  type Level,
  type Verdict,
} from "../lib/evidence";
import { markSkill, skillSummary, skills, type Skill } from "../lib/wordSkills";
import { LessonExpress, LessonListen, LessonVariation, StepBar } from "../components/LessonParts";
import UseWord from "../components/UseWord";
import ReadingPath from "../components/ReadingPath";
import WritingLadder from "../components/WritingLadder";
import UnitPack from "../components/UnitPack";
import GrammarTeach, { GrammarBook, GrammarExplain } from "../components/GrammarTeach";
import StoryLibrary from "../components/StoryLibrary";
import ThemeReview from "../components/ThemeReview";
import Pronunciation from "../components/Pronunciation";
import { grammarFor } from "../lib/grammar";
import type { LibraryMode } from "../lib/library";
import type { StoryTab } from "../lib/story";
import {
  heardKey,
  moveLesson,
  readHeard,
  readHints,
  readLessonRecord,
  writeHint,
  resumePhase,
  resumeTarget,
  updateLesson,
  variationsFor,
  promptFor,
  type ExpressRecord,
  type HintUse,
  type Lesson,
  type LessonRecord,
  type LessonStep,
  lessonSteps,
} from "../lib/lesson";
import {
  pickRetentionUnit,
  assistedUnits,
  markAssisted,
  clearAssisted,
  checkpointOutcome,
  recheckMakesStable,
  recordRetention,
  retentionDrawCount,
} from "../lib/grammarRetention";
import { dueTopic } from "../lib/topics";
import { allSentences, lesson, sentenceById, syncCustom, units, type Word } from "../lib/todayLesson";
import TopicLesson from "../components/TopicLesson";
import "./practice.css";

const levels = { low: "累爆", normal: "普通", high: "有電" };


type TranslationRecord = NonNullable<Session["translations"]>[number];
const ratingOf = { good: "correct", small: "minor", again: "again" } as const;
function PracticeSession({
  state,
  update,
  navigate,
  energy: requested,
  resume: explicitResume = false,
}: PageProps & { energy: Energy; resume?: boolean | string }) {
  const [date] = useState(() => dayKey());
  const [period] = useState(() => activePeriod(date, state.settings.periods));
  const energy =
    period === "exam" || period === "internship" ? "low" : requested;
  // An unfinished lesson continues where it stopped instead of being rebuilt from today's curriculum position.
  const [resumeAt] = useState(() =>
    energy === "low" ? null : resumeTarget(state.notes, state.curriculum, date, !!explicitResume, typeof explicitResume === "string" ? explicitResume : undefined));
  const [lessonDate] = useState(() =>
    resumeAt && resumeAt.date !== date && !readLessonRecord(state.notes, date) ? date : resumeAt?.date ?? date);
  useEffect(() => {
    if (resumeAt && resumeAt.date !== lessonDate)
      update((prev) => ({ ...prev, notes: moveLesson(prev.notes, resumeAt.date, lessonDate).notes }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [current] = useState(() =>
    lesson(state, energy, date, resumeAt ? { unit: resumeAt.rec.unit, day: resumeAt.rec.day } : undefined));
  const [pos, setPos] = useState(0);
  type Phase = "recall" | "listen" | "write" | "sound" | "vary" | "express" | "done";
  // Normal and high-energy lesson days (not review, not checkpoint) run the guided lesson.
  const guided = !current.review && !current.checkpoint && energy !== "low";
  const [lessonData, setLessonData] = useState<Lesson | null | undefined>(guided ? undefined : null);
  useEffect(() => {
    if (!guided) return;
    let alive = true;
    import("../data/lessons.json")
      .then((file) => { if (alive) setLessonData((file.default as Lesson[]).find((l) => l.unit === current.unit) ?? null); })
      .catch(() => { if (alive) setLessonData(null); });
    return () => { alive = false; };
  }, [guided, current.unit]);
  const [firstListen] = useState(() => !readHeard(state.notes, current.unit));
  const [corrections, setCorrections] = useState(() => resumeAt?.rec.express?.corrections ?? 0);
  const [records, setRecords] = useState<TranslationRecord[]>(() => resumeAt?.rec.records ?? []);
  const [spoken, setSpoken] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Session["feedback"]>();
  const [sessionId] = useState(
    () =>
      globalThis.crypto?.randomUUID?.() ??
      Date.now() + "-" + Math.random().toString(36).slice(2),
  );
  const [recalls, setRecalls] = useState<TranslationRecord[]>(() => resumeAt?.rec.recalls ?? []);
  // Today's variations done so far: two new sentences with the pattern after today's own sentence.
  const [varied, setVaried] = useState(() => resumeAt?.rec.varied ?? 0);
  const [retention] = useState(() => {
    // Units finished with help come back first for an unaided recheck.
    const assisted = assistedUnits(state.notes).filter((u) => u < current.unit);
    const id = assisted[0] ?? pickRetentionUnit(
      state.curriculum.stableUnits,
      current.unit,
      state.notes,
    );
    const pool = units.find((u) => u.id === id)?.checkpoint;
    if (!id || !pool?.length) return undefined;
    return {
      unit: id,
      sentence: pool[retentionDrawCount(state.notes, id) % pool.length],
    };
  });
  const recallItems = current.earlier.map((sentence, i) => ({
    sentence,
    label: "回想第 " + (i + 1) + " 天",
  }));
  if (retention)
    recallItems.push({
      sentence: retention.sentence,
      label: "回想已學過的單元 " + retention.unit,
    });
  const recall = recallItems[recalls.length];
  // Guided lessons start by recalling: day 5 → days 1–2 (and an older unit), days 2–4 → the day before.
  const guidedRecall = current.day === 5 ? recallItems
    : current.previousDay ? [{ sentence: current.previousDay, label: "回想上一天的句子" }] : [];
  const [phase, setPhase] = useState<Phase>(() => !guided ? "write"
    : (resumeAt && resumePhase(resumeAt.rec)) || (guidedRecall.length ? "recall" : "listen"));
  useEffect(() => {
    if (lessonData === null && phase !== "write" && phase !== "done") setPhase("write");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonData]);
  const live = guided && !!lessonData;
  const recallNow = guidedRecall[recalls.length];
  const lessonRecord = readLessonRecord(state.notes, lessonDate) ?? (resumeAt?.date !== lessonDate ? resumeAt?.rec : null) ?? null;
  const stepsDone: LessonStep[] = [...(lessonRecord?.steps ?? []), ...(guidedRecall.length ? [] : ["recall" as const])];
  const stepNow: LessonStep = phase === "recall" ? "recall" : phase === "listen" ? "listen"
    : phase === "express" ? (corrections ? "fix" : "express") : phase === "done" ? "done" : "pattern";
  /** Saves the lesson's own state (step reached, answers, hints) so a reload or tomorrow continues the same lesson. */
  function save(patch: Partial<LessonRecord>, s?: LessonStep) {
    update((prev) => ({ ...prev, notes: updateLesson(prev.notes, lessonDate, current.unit, current.day, patch, s) }));
  }
  function step(s: LessonStep, extra: Partial<LessonRecord> = {}) { save(extra, s); }
  // A double tap must not also press the button that appears under the finger on the next screen.
  const changedAt = useRef(0);
  useEffect(() => { changedAt.current = Date.now(); }, [phase]);
  const settled = () => Date.now() - changedAt.current > 450;
  function go(p: Phase, patch: Partial<LessonRecord> = {}, s?: LessonStep) {
    if (!settled()) return;
    setPhase(p);
    if (guided) save({ phase: p, ...patch }, s);
  }
  // Looking back at an earlier step of a guided lesson. Nothing is recorded again and the lesson stays where it was:
  // the current step is only hidden, so a half-written answer is still there on the way back.
  type Review = "listen" | "pattern";
  const [reviewing, setReviewing] = useState<Review | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  const canReview: Record<Review, boolean> = {
    // the dialogue, once it has been heard; the grammar and today's sentence, once the sentence has been written
    listen: live && phase !== "recall" && phase !== "listen",
    pattern: live && (phase === "sound" || phase === "vary" || phase === "express" || phase === "done"),
  };
  const reviewNames: Record<Review, string> = { listen: "聽懂", pattern: "句型" };
  const stepNames = Object.fromEntries(lessonSteps) as Record<LessonStep, string>;
  // Where the lesson really is, in the words of its own screens (shadowing and the variation are part of 句型).
  const hereName = phase === "sound" ? "跟讀" : phase === "vary" ? "換個說法" : stepNames[stepNow];
  // One step back from where the screen is now: 表達 → 句型 → 聽懂.
  const backTo: Review | null = reviewing === "listen" ? null
    : reviewing === "pattern" ? (canReview.listen ? "listen" : null)
    : canReview.pattern ? "pattern" : canReview.listen ? "listen" : null;
  function look(at: Review | null) {
    if (!settled() || (at && !canReview[at])) return;
    window.speechSynthesis?.cancel();
    changedAt.current = Date.now();
    setReviewing(at);
    requestAnimationFrame(() => pane.current?.scrollIntoView({ block: "start" }));
  }
  /** Evidence about a unit's goal; 待確認 entries keep the answer so it can be checked later. */
  function evidence(unit: number, level: Level | null, e: Omit<Evidence, "day" | "level">) {
    if (!level) return;
    const keep = level === "pending" ? {} : { answer: undefined, prompt: undefined, ref: undefined };
    update((prev) => ({ ...prev, notes: addEvidence(prev.notes, unit, { day: date, level, ...e, ...keep }) }));
  }
  const checkpointLevels = useRef<(Level | null)[]>([]);
  const hintFor = (id: string): HintUse | undefined => guided ? lessonRecord?.hints?.[id] : readHints(state.notes, date)[id];
  const saveHint = (id: string) => (use: HintUse) => {
    if (guided) update((prev) => {
      const rec = readLessonRecord(prev.notes, lessonDate);
      return { ...prev, notes: updateLesson(prev.notes, lessonDate, current.unit, current.day, { hints: { ...(rec?.hints ?? {}), [id]: use } }) };
    });
    else update((prev) => ({ ...prev, notes: writeHint(prev.notes, date, id, use) }));
  };
  const item = current.items[pos];
  function mark(value: Mark, revealed: boolean, info?: { answer: string; firstVerdict?: Verdict; checkedText?: string }) {
    // Each sentence counts once, even if the button is pressed twice.
    if (!settled() || records.some((r) => r.sentenceId === item.id)) return;
    // Nothing written: marking it "correct" cannot count as done alone, so it is kept as done with help.
    if (!info?.answer?.trim()) revealed = true;
    const level = judgeWritten({ rating: ratingOf[value], revealed, answer: info?.answer, references: item.reference, firstVerdict: info?.firstVerdict, checkedText: info?.checkedText });
    if (current.checkpoint) checkpointLevels.current.push(level);
    else if (guided)
      evidence(current.unit, level, { source: "pattern", skill: "write", item: item.id, hints: hintFor(item.id)?.h,
        answer: info?.answer, prompt: item.zh, ref: item.reference[0] });
    const list = [
      ...records,
      {
        sentenceId: item.id,
        rating: ratingOf[value],
        grammar: item.grammar,
        revealed,
        verified: level === "independent",
      },
    ];
    setRecords(list);
    go("sound", { records: list });
  }
  function finish(skip = false, next: Phase = "done") {
    if (current.checkpoint && !skip)
      evidence(current.unit, judgeCheckpoint(checkpointLevels.current), { source: "checkpoint", skill: "write" });
    const results = skip ? [] : [...recalls, ...records];
    const drawn =
      retention && recalls.find((t) => t.sentenceId === retention.sentence.id);
    const { finished: success, independent } = checkpointOutcome(records);
    update((prev) => {
      if (prev.sessions.some((s) => s.id === sessionId)) return prev;
      const cards = [...prev.cards];
      const events = [...prev.reviewEvents];
      function addCard(t: TranslationRecord) {
        const i = cards.findIndex((card) => card.id === t.sentenceId);
        if (i === -1) cards.push(newCard(t.sentenceId, date));
        else {
          const { card, event } = applyAnswer(cards[i], date, t);
          cards[i] = card;
          if (event) events.push(event);
        }
      }
      results.forEach(addCard);
      current.newWords.forEach((w) => {
        const id = "word:" + wordKey(w.en);
        if (!cards.some((c) => c.id === id)) cards.push(newCard(id, date));
      });
      const next = { ...prev.curriculum };
      const alreadyAdvanced = prev.sessions.some(
        (s) => s.day === date && (s.advanced ?? s.energy !== "low"),
      );
      if (
        !current.review &&
        !alreadyAdvanced &&
        next.unit === current.unit &&
        next.day === current.day
      ) {
        if (current.checkpoint) {
          if (success) {
            // Only answers written without hints or the answer make a unit "stable".
            if (independent)
              next.stableUnits = [
                ...new Set([...next.stableUnits, current.unit]),
              ];
            next.unit += 1;
            next.day = 1;
            next.retry = 0;
          } else {
            next.day = 4;
            next.retry += 1;
          }
        } else next.day += 1;
      }
      const learned = current.newWords.map((w) => wordKey(w.en));
      const entry: Session = {
        id: sessionId,
        day: date,
        energy,
        period,
        sentenceId: skip ? "" : item.id,
        advanced:
          !current.review &&
          !alreadyAdvanced &&
          prev.curriculum.unit === current.unit &&
          prev.curriculum.day === current.day,
        words: learned,
        rating: results.at(-1)?.rating,
        translations: results,
        spokenIds: spoken,
        feedback,
      };
      return {
        ...prev,
        sessions: [...prev.sessions, entry],
        cards,
        reviewEvents: events,
        curriculum: next,
        notes: (() => {
          let notes =
            drawn && retention
              ? recordRetention(
                  prev.notes,
                  retention.unit,
                  current.unit,
                  drawn.rating,
                  drawn.revealed,
                  drawn.verified === true,
                )
              : prev.notes;
          if (current.checkpoint && success && !independent && !alreadyAdvanced)
            notes = markAssisted(notes, current.unit, date);
          if (current.checkpoint && independent) notes = clearAssisted(notes, current.unit);
          // Same standard as the checkpoint: a blank, hinted or unchecked "correct" never makes a unit 「穩了」.
          if (retention && recheckMakesStable(drawn) && notes["unit-assisted." + retention.unit]) {
            notes = clearAssisted(notes, retention.unit);
            next.stableUnits = [...new Set([...next.stableUnits, retention.unit])];
          }
          return notes;
        })(),
        learningWords: [...new Set([...prev.learningWords, ...learned])],
      };
    });
    setPhase(next);
  }
  function logSpoken(id: string) {
    update((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, spokenIds: [...new Set([...(s.spokenIds ?? []), id])] }
          : s,
      ),
    }));
  }
  function chooseFeedback(value: NonNullable<Session["feedback"]>) {
    setFeedback(value);
    update((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId ? { ...s, feedback: value } : s,
      ),
    }));
  }
  return (
    <section className="practice-page">
      <PracticeCover title={live ? "今天這一堂" : levels[energy] + "練習"}>
        <button type="button" className="pr-back" onClick={() => navigate("today")}>
          <ChevronLeft size={16} aria-hidden="true"/>回今天
        </button>
      </PracticeCover>
      <div className="pr-pane pr-session" data-phase={phase} ref={pane}>
        <div className="pr-session-meta">
          <span className="pr-stage-icon" aria-hidden="true">
            {phase === "done" ? <Check size={17}/> : phase === "sound" || phase === "listen" ? <Headphones size={17}/> : <PenLine size={17}/>}
          </span>
          <span>{current.review ? "舊句複習" : "單元 " + current.unit + " · 第 " + current.day + " 天"}</span>
          {phase !== "done" && current.checkpoint && <span className="pr-item-index">{pos + 1} / {current.items.length}</span>}
          {backTo && (
            <button type="button" className="pr-step-back" onClick={() => look(backTo)}>
              <ChevronLeft size={15} aria-hidden="true"/>上一步：{reviewNames[backTo]}
            </button>
          )}
        </div>
        {live && <StepBar current={stepNow} done={stepsDone} review={reviewing}
          pick={(["listen", "pattern"] as const).filter((r) => canReview[r] && r !== reviewing)} onPick={(id) => look(id as Review)} />}
        {reviewing && (
          <div className="ls-review-note" role="status">
            <p>正在回頭看「{reviewNames[reviewing]}」。你的進度還在「{hereName}」，寫到一半的東西都留著。</p>
            <button type="button" className="pr-main" onClick={() => look(null)}>回到{hereName}</button>
          </div>
        )}
        {reviewing === "listen" && lessonData && (
          <LessonListen key="review" lesson={lessonData} firstTime={false} rate={state.settings.speechRate}
            doneLabel={"回到" + hereName} onDone={() => look(null)} />
        )}
        {reviewing === "pattern" && (
          <section className="ls-review">
            <div className="pr-label">句型 · {current.title}</div>
            <h2 className="pr-question">再看一次這課的講解</h2>
            {current.rule && <p className="gm-rule">{current.rule}</p>}
            {grammarFor(current.unit)
              ? <GrammarExplain unit={current.unit} rate={state.settings.speechRate} />
              : current.examples.map((en, i) => <p key={en}><span lang="en">{en}</span><br/>{current.examplesZh[i]}</p>)}
            {current.items.filter((it) => records.some((r) => r.sentenceId === it.id)).map((it) => (
              <p key={it.id} className="ls-review-sentence">
                <small>今天寫的句子：{it.zh}</small>
                <b lang="en">{it.reference[0]}</b>
              </p>
            ))}
            <button type="button" className="pr-main" onClick={() => look(null)}>回到{hereName}</button>
          </section>
        )}
        <div className="pr-phase" hidden={!!reviewing}>
        {guided && lessonData === undefined && <p className="ls-help">準備今天這一堂…</p>}
        {live && phase === "recall" && (
          recallNow ? (
            <div className="pr-hint">
              <strong>{recallNow.label} · {recalls.length + 1} / {guidedRecall.length}</strong>
              <Translation
                key={recallNow.sentence.id}
                sentence={recallNow.sentence}
                checkpoint={false}
                saved={hintFor(recallNow.sentence.id)}
                onHint={saveHint(recallNow.sentence.id)}
                onMark={(mark, revealed, info) => {
                  if (recalls.some((r) => r.sentenceId === recallNow.sentence.id)) return;
                  if (!answered(info.answer)) revealed = true;
                  const level = judgeWritten({ rating: ratingOf[mark], revealed, answer: info.answer, references: recallNow.sentence.reference, firstVerdict: info.firstVerdict, checkedText: info.checkedText });
                  if (retention && recallNow.sentence.id === retention.sentence.id) {
                    evidence(retention.unit, level, { source: "retention", skill: "write", item: recallNow.sentence.id,
                      answer: info.answer, prompt: recallNow.sentence.zh, ref: recallNow.sentence.reference[0] });
                  }
                  const list = [
                    ...recalls,
                    { sentenceId: recallNow.sentence.id, rating: ratingOf[mark], grammar: recallNow.sentence.grammar, revealed, verified: level === "independent" },
                  ];
                  setRecalls(list);
                  save({ recalls: list, phase: "recall" });
                }}
              />
            </div>
          ) : (
            <div className="pr-recall">
              <div className="pr-label">回想完成</div>
              <h2 className="pr-question">接著聽一段今天的對話。</h2>
              <button className="pr-main" onClick={() => go("listen", {}, "recall")}>下一步：聽懂</button>
            </div>
          )
        )}
        {live && lessonData && phase === "listen" && (
          <LessonListen
            lesson={lessonData}
            firstTime={firstListen}
            rate={state.settings.speechRate}
            onDone={(correct, total, plays) => {
              if (total > 0) {
                update((prev) => ({ ...prev, notes: { ...prev.notes, [heardKey(current.unit)]: JSON.stringify({ day: date, correct, total, plays }) } }));
                // Only all-correct after a complete play counts; a miss is just a miss, not "done with help".
                if (correct === total) evidence(current.unit, "independent", { source: "listen", skill: "listen" });
              }
              go("write", {}, "listen");
            }}
          />
        )}
        {live && lessonData && phase === "vary" && (() => {
          const todays = variationsFor(lessonData, current.day);
          const at = Math.min(varied, todays.length - 1);
          const v = todays[at];
          return (
            <LessonVariation
              key={at}
              item={v}
              count={[at + 1, todays.length]}
              tutorId={item.id}
              pattern={current.title}
              rule={current.rule}
              onDone={(m, answer, check) => {
                if (!settled()) return;
                evidence(current.unit, judgeVariation(m, answer, [v.en, ...(v.alt ?? [])], check), { source: "vary", skill: "write", answer, prompt: v.zh, ref: v.en });
                if (m !== "good")
                  update((prev) => addSayCard(prev, { zh: v.zh, en: v.en, why: "這課的句型：" + current.title, from: "lesson" }, date));
                if (at + 1 < todays.length) {
                  // The next sentence is a new screen: a double tap must not mark it too.
                  changedAt.current = Date.now();
                  setVaried(at + 1);
                  save({ varied: at + 1 });
                  requestAnimationFrame(() => pane.current?.scrollIntoView({ block: "start" }));
                  return;
                }
                finish(false, "express");
                step("pattern", { phase: "express", varied: todays.length });
              }}
            />
          );
        })()}
        {live && lessonData && phase === "express" && (
          <LessonExpress
            lesson={lessonData}
            prompt={promptFor(lessonData, current.day)}
            draftKey={"express." + current.unit + "." + current.day}
            pattern={current.title}
            saved={lessonRecord?.express}
            onRecord={(rec: ExpressRecord, corrected: boolean) => {
              setCorrections(rec.corrections);
              // "訂正" counts only when the rewrite actually fixed the earlier issues, not just because it was sent again.
              save({ express: rec, ...(corrected ? { corrected: true } : {}) },
                corrected ? (rec.fixed ? "fix" : "express") : undefined);
            }}
            onSave={(card) => update((prev) => addSayCard(prev, { ...card, from: "lesson" }, date))}
            onSpeak={() => { step("express"); location.hash = "speaking/lesson"; }}
            onFinish={(answer, rec) => {
              if (!settled()) return;
              // Something written counts as the step done, with or without Claude's correction (the summary said 「今天跳過」).
              save({ express: rec }, rec.first || answer.trim() ? "express" : undefined);
              evidence(current.unit, judgeExpress({ firstVerdict: rec.firstResult?.verdict, help: rec.firstHelp ?? rec.help, answered: !!(rec.first || answer.trim()) }),
                { source: "express", skill: "write", answer: rec.first || answer, prompt: promptFor(lessonData, current.day).en, ref: promptFor(lessonData, current.day).sample });
              go("done", {}, "done");
            }}
          />
        )}
        {phase === "write" && !(guided && lessonData === undefined) && (
          <>
            {energy === "low" && state.settings.why && (
              <p>{state.settings.why}</p>
            )}
            {current.freshReview && (
              <div className="pr-recall">
                <h2 className="pr-question">說一句你已經會的英文。</h2>
                <p>還沒有個人複習卡，今天說完這一句就可以收工。</p>
                <button className="pr-main" onClick={() => finish(true)}>我複習了自己熟悉的一句</button>
              </div>
            )}
            {!live && !current.review && current.day === 5 && (
              <details className="pr-tools">
                <summary>
                  回想第 1、2 天的句子{retention ? "與以前的單元" : ""}
                </summary>
                {recall ? (
                  <div className="pr-hint">
                    <strong>
                      {recall.label} · {recalls.length + 1} /{" "}
                      {recallItems.length}
                    </strong>
                    <Translation
                      key={recall.sentence.id}
                      sentence={recall.sentence}
                      checkpoint={false}
                      saved={readHints(state.notes, date)[recall.sentence.id]}
                      onHint={(use) => update((prev) => ({ ...prev, notes: writeHint(prev.notes, date, recall.sentence.id, use) }))}
                      onMark={(mark, revealed, info) => {
                        if (!answered(info.answer)) revealed = true;
                        const level = judgeWritten({ rating: ratingOf[mark], revealed, answer: info.answer, references: recall.sentence.reference, firstVerdict: info.firstVerdict, checkedText: info.checkedText });
                        if (retention && recall.sentence.id === retention.sentence.id) {
                          evidence(retention.unit, level, { source: "retention", skill: "write", item: recall.sentence.id,
                            answer: info.answer, prompt: recall.sentence.zh, ref: recall.sentence.reference[0] });
                        }
                        setRecalls([
                          ...recalls,
                          {
                            sentenceId: recall.sentence.id,
                            rating: ratingOf[mark],
                            grammar: recall.sentence.grammar,
                            revealed,
                            verified: level === "independent",
                          },
                        ]);
                      }}
                    />
                  </div>
                ) : (
                  <p>舊句回想完成，接著做今天的一句。</p>
                )}{" "}
              </details>
            )}
            {!current.freshReview && (
              <Translation
                key={item.id}
                sentence={item}
                checkpoint={current.checkpoint}
                saved={hintFor(item.id)}
                onHint={saveHint(item.id)}
                preparation={!current.review && current.rule && grammarFor(current.unit) && (current.day === 1 || live) ? (
                  <GrammarTeach
                    key={current.unit + "." + current.day}
                    unit={current.unit}
                    day={current.day}
                    title={current.title}
                    rule={current.rule}
                    notes={state.notes}
                    date={date}
                    rate={state.settings.speechRate}
                    onSave={(apply) => update((prev) => ({ ...prev, notes: apply(prev.notes) }))}
                  />
                ) : !current.review && current.rule && (current.day !== 1 ? (live ? (
                  <details className="pr-tools pr-rule">
                    <summary>複習這課的規則：{current.title}</summary>
                    <p>{current.rule}</p>
                    {current.examples.map((en, i) => (
                      <p key={en}><span lang="en">{en}</span><br/>{current.examplesZh[i]}</p>
                    ))}
                  </details>
                ) : null) : (
                  <section className="pr-rule">
                    <strong>{current.title}</strong>
                    <p>{current.rule}</p>
                    {current.examples.length > 0 && <details className="pr-tools" open>
                      <summary>看例句</summary>
                      {current.examples.map((en, i) => (
                        <p key={en}><span lang="en">{en}</span><br/>{current.examplesZh[i]}</p>
                      ))}
                    </details>}
                  </section>
                ))}
                onMark={mark}
              />
            )}
          </>
        )}
        {phase === "sound" && !(guided && lessonData === undefined) && (
          <>
            <div className="pr-label">跟讀這一句</div>
            <h2 className="pr-question">聽一次，再用自己的聲音說一次</h2>
            <SpeechPractice
              english={item.reference[0]}
              chinese={item.zh}
              rate={state.settings.speechRate}
              onSpoken={() =>
                setSpoken((ids) => [...new Set([...ids, item.id])])
              }
            />
            <div className="pr-end-controls">
              {pos + 1 < current.items.length ? (
                <button
                  className="pr-main"
                  onClick={() => {
                    if (!settled()) return;
                    setPos(pos + 1);
                    setPhase("write");
                  }}
                >
                  下一句
                </button>
              ) : live ? (
                <button className="pr-main" onClick={() => go("vary")}>
                  下一步：換個說法
                </button>
              ) : (
                <button className="pr-main" onClick={() => settled() && finish()}>
                  今天到這裡
                </button>
              )}
            </div>
          </>
        )}
        {phase === "done" && (
          <>
            <div className="pr-label">練習已儲存</div>
            <h2 className="pr-question">今天有練，就往前了一點。</h2>
            {live && (() => {
              const heard = readHeard(state.notes, current.unit);
              const did = (id: LessonStep) => stepsDone.includes(id) && (id !== "recall" || guidedRecall.length > 0);
              const lines: [LessonStep, string][] = [
                ["recall", guidedRecall.length ? "回想：" + recalls.length + " 句舊句" : "回想：今天沒有要回想的句子"],
                ["listen", heard?.day === date && heard.total ? "聽懂：對話題目答對 " + heard.correct + " / " + heard.total : "聽懂：聽對話、跟著唸"],
                ["pattern", "句型：今天的句子和一個變化"],
                ["express", did("express") ? "表達：用自己的話寫了一段" + (lessonRecord?.corrected ? "，請 Claude 批改過" : "") : "表達：今天跳過"],
                ["fix", did("fix") ? "訂正：上次指出的問題都改好了" : (lessonRecord?.express?.corrections ?? 0) >= 2 ? "訂正：再批過了，但還有問題沒改好，下次再試" : "訂正：下次試著改完再批一次"],
              ];
              return <>
                {current.cando && <p className="ls-goal"><small>今天的目標</small>{current.cando}</p>}
                <ul className="ls-summary">{lines.map(([id, text]) => <li key={id} data-skip={!did(id)}>{text}</li>)}</ul>
              </>;
            })()}
            {(live || current.checkpoint) && (() => {
              const today = readEvidence(state.notes, current.unit).filter((e) => e.day === date);
              return today.length > 0 && (
                <div className="ls-evidence">
                  <strong>今天留下的能力紀錄</strong>
                  <ul>{today.map((e) => (
                    <li key={e.source + (e.item ?? "")} data-level={e.level}><span>{sourceNames[e.source]}</span><b>{e.skill === "listen" ? (e.level === "assisted" ? "要看字才懂" : "只聽也懂") : levelNames[e.level]}</b></li>
                  ))}</ul>
                  <small>「完成」和「學會」分開記。要算「延後換題仍能完成」，要等之後的小關卡或隔幾個單元的回想；「自評完成・待確認」可以到「紀錄」請 Claude 看；沒寫答案的不算作答。</small>
                </div>
              );
            })()}
            {current.checkpoint && (
              <p>
                {checkpointOutcome(records).independent
                  ? "這個單元穩了：你沒看提示就寫對了。下次從下一站接著練。"
                  : checkpointOutcome(records).finished
                    ? "這個單元完成了，不過有看提示或答案。可以往下一站走，過幾天會再出一句讓你自己寫，確認真的會了。"
                    : "下次換幾句新的，從第 4 天再熟悉一次。"}
              </p>
            )}
            {current.newWords.length > 0 && (
              <details className="pr-tools">
                <summary>
                  今天學過的 {current.newWords.length} 個字與例句
                </summary>
                {current.newWords.map((w) => (
                  <p key={w.en}>
                    <strong>
                      {w.en} · {w.zh}
                    </strong>{" "}
                    <AskWord en={w.en} zh={w.zh} />
                    <br />
                    {w.example}
                    <br />
                    {w.exampleZh}
                  </p>
                ))}
              </details>
            )}
            {energy !== "low" && (
              <fieldset className="pr-marks">
                <legend>今天的份量？</legend>
                {(
                  [
                    ["right", "剛好"],
                    ["much", "太多"],
                    ["more", "可以再多"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={feedback === key}
                    onClick={() => chooseFeedback(key)}
                  >
                    {feedback === key ? "✓ " : ""}
                    {label}
                  </button>
                ))}
              </fieldset>
            )}
            {energy === "high" && !current.review && (
              <details className="pr-tools">
                <summary>有電挑戰 · 舊句跟讀與短聽力</summary>
                {current.previousPair.map((s) => (
                  <SpeechPractice
                    key={s.id}
                    onSpoken={() => logSpoken(s.id)}
                    english={s.reference[0]}
                    chinese={s.zh}
                    rate={state.settings.speechRate}
                  />
                ))}
                {current.listening.length > 0 && (
                  <SpeechPractice
                    english={current.listening.map((s) => s.en).join(" ")}
                    chinese={current.listening.map((s) => s.zh).join(" ")}
                    rate={state.settings.speechRate}
                  />
                )}
                <p>想多說一點時，試著換一個詞，再用 30 秒說說自己的例子。</p>
              </details>
            )}
            <div className="pr-end-controls">
              <button className="pr-main" onClick={() => navigate("today")}>
                回到今天
              </button>
              {/* More practice: the 英文練習 list, where each kind opens on its own page. */}
              <button onClick={() => navigate("practice")}>再多做一點</button>
            </div>
          </>
        )}
        </div>
      </div>
    </section>
  );
}
/** Today's main lesson: a life-topic session when one is due (normal or high energy, outside exam and internship weeks,
 *  not continuing a grammar lesson), otherwise the grammar lesson. Decided once, so the page does not switch mid-way. */
function PracticeEntry(props: PageProps & { energy: Energy; resume?: boolean | string }) {
  const { state, update, energy, resume } = props;
  const [date] = useState(() => dayKey());
  const [period] = useState(() => activePeriod(date, state.settings.periods));
  const [topic, setTopic] = useState(() =>
    resume || energy === "low" || period === "exam" || period === "internship" ? null : dueTopic(state, date));
  if (!topic) return <PracticeSession {...props} />;
  return (
    <TopicLesson
      {...props}
      key={topic.topic.id + topic.part}
      topic={topic.topic}
      part={topic.part}
      startStep={topic.step}
      date={date}
      period={period}
      onSkip={() => {
        update((prev) => ({ ...prev, notes: { ...prev.notes, ["topic.skip." + date]: "1" } }));
        setTopic(null);
      }}
    />
  );
}

export default PracticeEntry;

/** One kind of practice on a page of its own (#library/<mode>); the 英文練習 menu lists them all. */
export function PracticeLibrary({ state, update, navigate, mode }: PageProps & { mode: LibraryMode }) {
  const today = dayKey();
  const period = activePeriod(today, state.settings.periods);
  const energy =
    period === "exam" || period === "internship" ? "low" : "normal";
  const id = "library-" + today;
  // Opening the library never counts as a practice session. Save only on an answer or a recall.
  const record: PageProps["update"] = (apply) =>
    update((prev) => {
      const exists = prev.sessions.some((s) => s.id === id);
      const baseline: Session = {
        id,
        day: today,
        period,
        energy: "low",
        advanced: false,
        sentenceId: "",
        words: [],
        translations: [],
        spokenIds: [],
      };
      return apply(
        exists ? prev : { ...prev, sessions: [...prev.sessions, baseline] },
      );
    });
  return (
    <div className="practice-page">
      <Extras
        key={today + period + mode}
        mode={mode}
        state={state}
        update={update}
        onActivity={record}
        navigate={navigate}
        energy={energy}
        date={today}
        sessionId={id}
      />
    </div>
  );
}

function Extras({
  mode,
  state,
  update,
  navigate,
  energy,
  date,
  sessionId,
  onActivity = update,
}: PageProps & {
  mode: LibraryMode;
  energy: Energy;
  date: string;
  sessionId: string;
  onActivity?: PageProps["update"];
}) {
  // #library/story/listen opens the graded passages on that tab.
  const storyFromHash = (): StoryTab => {
    const t = location.hash.startsWith("#library/story/") ? location.hash.split("/")[2] : "";
    return t === "listen" || t === "dictate" ? t : "read";
  };
  const [storyTab, setStoryTab] = useState<StoryTab>(storyFromHash);
  // #library/writing/<task id> opens that task (from a unit's pack).
  const taskFromHash = () => location.hash.startsWith("#library/writing/") ? location.hash.split("/")[2] : undefined;
  const [writingTask, setWritingTask] = useState<string | undefined>(taskFromHash);
  // #library/grammar/<unit> opens that unit's teaching (from 主題總複習).
  const grammarFromHash = () => { const n = Number(location.hash.split("/")[2]); return location.hash.startsWith("#library/grammar/") && Number.isInteger(n) && n > 0 ? n : undefined; };
  const [grammarUnit, setGrammarUnit] = useState<number | undefined>(grammarFromHash);
  // Another address of the same page (#library/words/listen, #library/writing/<id>, #library/story/listen) opens that part.
  // A different kind of practice is a different page: the app opens it fresh.
  useEffect(() => {
    const onHash = () => {
      if (location.hash.startsWith("#library/words/")) setWordSkill(skillFromHash());
      if (location.hash.startsWith("#library/writing")) setWritingTask(taskFromHash());
      if (location.hash.startsWith("#library/story")) setStoryTab(storyFromHash());
      if (location.hash.startsWith("#library/grammar")) setGrammarUnit(grammarFromHash());
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [limit] = useState(() => {
    const reviewed = new Set(
      state.reviewEvents
        .filter((e) => e.day === date && e.id.startsWith("word:"))
        .map((e) => e.id),
    );
    return Math.max(0, reviewBudget(energy) - reviewed.size);
  });
  const [offset, setOffset] = useState(0);
  const [see, setSee] = useState(false);
  const [listen, setListen] = useState(0);
  // Exams and internship: no new content, but the nursing-English questions stay open (the short nursing plan).
  const periodQuiet = ["exam", "internship"].includes(activePeriod(date, state.settings.periods));
  const quiet = energy === "low" || periodQuiet;
  const familiar = state.sessions.flatMap(
    (s) => s.translations?.map((t) => t.sentenceId) ?? [s.sentenceId],
  );
  const listeningPool =
    quiet
      ? allSentences.filter((s) => familiar.includes(s.id))
      : sentences;
  const [repeatIndex, setRepeatIndex] = useState(0);
  const [repeatDone, setRepeatDone] = useState(false);
  // Due sentence cards come first (oldest first), then familiar sentences, then new ones.
  const [{ pool: translationPool, due: dueSentenceIds }] = useState(() => {
    syncCustom(state.notes);
    const due = dueCards(
      state.cards.filter((c) => sentenceById.has(c.id)),
      date,
      energy,
    ).map((c) => c.id);
    const ids = [
      ...new Set([
        ...due,
        ...familiar.slice().reverse(),
        ...(!quiet ? sentences.map((s) => s.id) : []),
      ]),
    ];
    return { pool: ids.flatMap((id) => sentenceById.get(id) ?? []), due: new Set(due) };
  });
  // What today's review still holds: the word screen points to 中翻英 when sentence cards are waiting.
  const load = reviewLoad(state, date, reviewEnergy(date, state.settings.periods));
  const sentencesDone = Number(state.notes[sentenceReviewKey(date)]) || 0;
  const repeat = translationPool[repeatIndex];
  /** Same rule as the lesson: only a checked answer written alone counts as remembered. */
  function logRepeat(mark: Mark, revealed: boolean, info: { answer: string; firstVerdict?: Verdict; checkedText?: string }) {
    if (!repeat || repeatDone) return;
    if (!answered(info.answer)) revealed = true;
    const level = judgeWritten({ rating: ratingOf[mark], revealed, answer: info.answer, references: repeat.reference, firstVerdict: info.firstVerdict, checkedText: info.checkedText });
    const translation = {
      sentenceId: repeat.id,
      rating: ratingOf[mark],
      grammar: repeat.grammar,
      revealed,
      verified: level === "independent",
    };
    onActivity((prev) => logSentence(prev, sessionId, date, translation));
    setRepeatDone(true);
  }
  const listening = listeningPool[listen % Math.max(1, listeningPool.length)];
  const [lookup] = useState(() => {
    const map = new Map<string, Word>();
    for (const w of [
      ...officialWords,
      ...words,
      ...allSentences.flatMap((s) => s.newWords),
      ...state.customWords,
    ])
      map.set(wordKey(w.en), w);
    return map;
  });
  const skillFromHash = (): Skill => {
    const k = location.hash.split("/")[2] as Skill;
    return skills.some(([key]) => key === k) ? k : "read";
  };
  const [wordSkill, setWordSkill] = useState<Skill>(skillFromHash);
  // Words being learned: what the lessons and daily words added, plus every word card.
  const [learning] = useState(() => {
    const keys = [...new Set([...state.learningWords, ...state.cards.filter((c) => c.id.startsWith("word:")).map((c) => c.id.slice(5))])];
    return keys.flatMap((k) => { const w = lookup.get(k); return w ? [w] : []; });
  });
  // Merged entries are drilled one form at a time (him = 他（當受詞）), rotating by day so every form comes up.
  const [drillWords] = useState(() => {
    const turn = Math.floor(Date.parse(date) / 86400000);
    return learning.map((w, i) => { const t = spellingTargets(w, turn + i); return { en: t.accept, zh: t.zh, key: wordKey(w.en) }; });
  });
  const [deck] = useState(() => {
    const due = dueCards(
      state.cards.filter((c) => c.id.startsWith("word:")),
      date,
      energy,
    );
    const cards = due.flatMap((c) => {
      const w = lookup.get(c.id.slice(5));
      return w ? [w] : [];
    });
    return cards.slice(0, limit);
  });
  const word = deck[offset];
  function scoreWord(remembered: boolean) {
    if (!word) return;
    const id = "word:" + wordKey(word.en);
    onActivity((prev) => {
      const existing = prev.cards.find((c) => c.id === id);
      if (!existing) return prev;
      const { card, event } = reviewCard(existing, date, remembered, see);
      return {
        ...prev,
        cards: prev.cards.map((c) => (c.id === id ? card : c)),
        reviewEvents: event ? [...prev.reviewEvents, event] : prev.reviewEvents,
        notes: remembered && !see ? markSkill(prev.notes, wordKey(word.en), "read", date) : prev.notes,
      };
    });
    setOffset(offset + 1);
    setSee(false);
  }
  // The page shows this one kind of practice and nothing else; the menu (sidebar, or the 英文練習 page) leads to the others.
  return (
    <section className="pr-pane pr-extras" data-mode={mode}>
      {mode === "words" && (() => {
        const count = skillSummary(state.notes, learning.map((w) => wordKey(w.en)));
        return (
          <div className="pr-stack ws-head">
            <div className="pr-options qz-tabs" role="group" aria-label="單字能力">
              {skills.map(([key, label]) => (
                <button key={key} aria-pressed={wordSkill === key} onClick={() => setWordSkill(key)}>{label}</button>
              ))}
            </div>
            <p className="qz-meta">
              <span>在學的 {learning.length} 個字：</span>
              {skills.map(([key, label]) => <span key={key}>{label} {count[key]}</span>)}
            </p>
          </div>
        );
      })()}
      {mode === "words" && wordSkill !== "read" && (
        <WordSkills
          key={wordSkill}
          skill={wordSkill}
          words={drillWords}
          distractors={officialWords.slice(0, 400)}
          notes={state.notes}
          keyOf={(w) => w.key ?? wordKey(w.en)}
          rate={state.settings.speechRate}
          onPass={(w) => onActivity((prev) => ({ ...prev, notes: markSkill(prev.notes, w.key ?? wordKey(w.en), wordSkill, date) }))}
        />
      )}
      {mode === "words" && wordSkill === "read" &&
        (word ? (
          <div className="pr-stack">
            <p>
              複習卡 {offset + 1} / {deck.length}
            </p>
            <h3 lang="en">{word.en}</h3>
            {see && <p>{word.zh}</p>}
            <div><AskWord en={word.en} zh={see ? word.zh : undefined} label="問問 Claude" />{see && <> <UseWord key={word.en} en={word.en} zh={word.zh}
              onGood={() => onActivity((prev) => ({ ...prev, notes: markSkill(prev.notes, wordKey(word.en), "write", date) }))} /></>}</div>
            <div className="pr-actions">
              <button onClick={() => scoreWord(true)}>記得</button>
              <button onClick={() => setSee(true)}>看中文意思</button>
              <button onClick={() => scoreWord(false)}>不記得</button>
            </div>
          </div>
        ) : (
          <div className="pr-stack">
            <p>{offset ? "這次的複習卡完成了。" : "今天沒有到期的單字卡。"}</p>
            {load.sentences > 0 && (
              <p>還有 {load.sentences} 句句子卡要複習。{" "}
                <button onClick={() => { location.hash = "library/translate"; }}>去中翻英</button>
              </p>
            )}
          </div>
        ))}
      {mode === "listen" &&
        (listening ? (
          <div className="pr-stack">
            <SpeechPractice
              key={listening.id}
              english={listening.reference[0]}
              chinese={listening.zh}
              rate={state.settings.speechRate}
              onSpoken={() =>
                onActivity((prev) => {
                  return {
                    ...prev,
                    sessions: prev.sessions.map((s) =>
                      s.id === sessionId
                        ? {
                            ...s,
                            spokenIds: [
                              ...new Set([
                                ...(s.spokenIds ?? []),
                                listening.id,
                              ]),
                            ],
                          }
                        : s,
                    ),
                  };
                })
              }
            />
            {listeningPool.length > 1 && (
              <button onClick={() => setListen(listen + 1)}>換一句</button>
            )}
          </div>
        ) : (
          <p>完成第一次句子練習後，就能在這裡跟讀舊句。</p>
        ))}
      {mode === "translate" && (
        <div className="pr-stack">
          {dueSentenceIds.size > 0 && (
            <p className="qz-meta">
              {sentencesDone < SENTENCE_QUOTA
                ? "句子卡複習：今天 " + sentencesDone + " / " + SENTENCE_QUOTA + " 句" + (load.queued ? "，另有 " + load.queued + " 句排在之後的日子" : "")
                : "今天的 " + SENTENCE_QUOTA + " 句句子卡做完了。想多做可以繼續" + (load.queued ? "，排在後面的 " + load.queued + " 句會早點做到" : "") + "。"}
            </p>
          )}
          {repeat ? (
            repeatDone ? (
              <>
                <p>這一句已記下。</p>
                {repeatIndex + 1 < translationPool.length && (
                  <button
                    onClick={() => {
                      setRepeatIndex(repeatIndex + 1);
                      setRepeatDone(false);
                    }}
                  >
                    換一句
                  </button>
                )}
              </>
            ) : (
              <Translation
                key={repeat.id}
                sentence={repeat}
                checkpoint={false}
                saved={readHints(state.notes, date)[repeat.id]}
                onHint={(use) => onActivity((prev) => ({ ...prev, notes: writeHint(prev.notes, date, repeat.id, use) }))}
                onMark={logRepeat}
              />
            )
          ) : (
            <p>第一次完成句子練習後，就能回來複習。</p>
          )}
        </div>
      )}
      {mode === "passage" && (
        <PassageLibrary state={state} onActivity={onActivity} />
      )}
      {mode === "grammar" && <GrammarBook key={grammarUnit ?? "book"} initialUnit={grammarUnit} state={state} onActivity={onActivity} date={date} />}
      {mode === "theme" && <ThemeReview state={state} onActivity={onActivity} date={date} sessionId={sessionId} />}
      {mode === "story" && <StoryLibrary state={state} onActivity={onActivity} date={date} initialTab={storyTab} />}
      {mode === "sound" && <Pronunciation state={state} onActivity={onActivity} date={date} />}
      {mode === "reading" && <ReadingPath key="reading" state={state} onActivity={onActivity} date={date} />}
      {mode === "nlisten" && <NursingListen state={state} onActivity={onActivity} date={date} />}
      {mode === "nread" && <ReadingPath key="nursing" set="nursing" state={state} onActivity={onActivity} date={date} />}
      {mode === "nwords" && <NursingWords state={state} onActivity={onActivity} date={date} />}
      {mode === "writing" && <WritingLadder key={writingTask ?? "ladder"} initialTask={writingTask} state={state} onActivity={onActivity} date={date} />}
      {mode === "unit" && <UnitPack state={state} onActivity={onActivity} date={date} />}
      {mode === "quiz" && (!quiet || periodQuiet) && (
        <QuizPractice state={state} update={update} onActivity={onActivity} date={date}
          sections={periodQuiet ? ["nursing"] : undefined} />
      )}
      {mode === "case" && (!quiet || periodQuiet) && (
        <ClinicalCase state={state} onActivity={onActivity} date={date} />
      )}
      {mode === "screen" && (quiet ? (
        <p>考週和實習期間單字快篩先暫停，到期的單字卡在「單字複習」。</p>
      ) : (
        <VocabScreen state={state} update={update} navigate={navigate} />
      ))}
    </section>
  );
}
