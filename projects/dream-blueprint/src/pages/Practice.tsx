import { PracticeCover } from "../components/PracticeCover";
import HomographNote from "../components/HomographNote";
import { useTapGuard } from "../lib/tapGuard";
import examSubjects from "../data/exam-subjects.json";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Headphones, Check, PenLine, Volume2 } from "lucide-react";
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
import { updateStoreNow, type AppState, type PageProps, type Session } from "../lib/store";
import {
  activePeriod,
  dayKey,
  dueCards,
  newCard,
  reviewBudget,
  reviewCard,
  reviewEnergy,
  reviewLoad,
  logSentence,
  availableSentence,
  reviewedSentenceCount,
  SENTENCE_QUOTA,
  type Energy,
} from "../lib/progress";
import { wordKey, officialWords, spellingTargets } from "../lib/vocab";
import VocabScreen from "../components/VocabScreen";
import { addSayCard, addSayCards } from "../lib/sayCards";
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
  type Level,
  type Verdict,
} from "../lib/evidence";
import { markSkill, skillSummary, skills, type Skill } from "../lib/wordSkills";
import { LessonExpress, LessonListen, LessonVariation, StepBar } from "../components/LessonParts";
import UseWord from "../components/UseWord";
import EmmaWordLink from "../components/EmmaWordLink";
import { speakEnglish } from "../lib/tts";
import ReadingPath from "../components/ReadingPath";
import WritingLadder from "../components/WritingLadder";
import UnitPack from "../components/UnitPack";
import GrammarTeach, { GrammarExplain } from "../components/GrammarTeach";
import GrammarHome from "../components/GrammarHome";
import StoryLibrary from "../components/StoryLibrary";
import ThemeReview from "../components/ThemeReview";
import Pronunciation from "../components/Pronunciation";
import { grammarFor } from "../lib/grammar";
import type { LibraryMode } from "../lib/library";
import type { StoryTab } from "../lib/story";
import {
  heardKey,
  lessonTarget,
  mergeHintUse,
  mergeRunProgress,
  mergeVariationCheck,
  parseLessonTarget,
  readHeard,
  readHints,
  readDayLessons,
  readLessonRecord,
  readReviewRuns,
  readRunProgress,
  saveRunProgress,
  saveLessonExpression,
  selectLessonRecord,
  writeHint,
  resumePhase,
  resumeTarget,
  reviewRunId,
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
import { allSentences, lesson, sentenceById, syncCustom, units, type Sentence, type Word } from "../lib/todayLesson";
import TopicLesson from "../components/TopicLesson";
import "./practice.css";

const levels = { low: "累爆", normal: "普通", high: "有電" };


type TranslationRecord = NonNullable<Session["translations"]>[number] & { answer?: string };
const ratingOf = { good: "correct", small: "minor", again: "again" } as const;
type PracticeProps = PageProps & { energy: Energy; resume?: boolean | string };
type Phase = "recall" | "listen" | "write" | "sound" | "vary" | "express" | "done";
function selectPractice(state: AppState, requested: Energy, date: string, explicitResume?: boolean | string, reviewId?: string) {
  const period = activePeriod(date, state.settings.periods);
  const energy =
    period === "exam" || period === "internship" ? "low" : requested;
  // An unfinished lesson continues where it stopped instead of being rebuilt from today's curriculum position.
  const resumeAt = reviewId || energy === "low" ? null : resumeTarget(state.notes, state.curriculum, date, !!explicitResume,
    typeof explicitResume === "string" ? explicitResume : undefined);
  const picked = reviewId ? lesson(state, "low", date) : lesson(state, energy, date, resumeAt?.rec);
  const guided = !picked.review && !picked.checkpoint && energy !== "low";
  const plan = { date, period, energy, resumeAt, guided, run: null, current: picked };
  if (guided) return plan;
  const p = readRunProgress(state.notes, date, picked.review, picked.unit, picked.day, reviewId);
  if (!p || (!picked.review && p.retry !== undefined && p.retry !== picked.retry)) return plan;
  const savedItems = p.items ?? (picked.review && p.records.length ? p.records.map(r => r.sentenceId) : undefined);
  const items = p.reviewItem ? [p.reviewItem] : savedItems?.map(id => sentenceById.get(id)) ?? picked.items;
  if (!items.every((item): item is Sentence => !!item)) return plan;
  const ids = items.map(i => i.id);
  return p.pos < ids.length && p.records.every(r => ids.includes(r.sentenceId))
    ? { ...plan, run: p, current: { ...picked, items, freshReview: p.freshReview ?? false } } : plan;
}

function PracticeSession(props: PracticeProps) {
  const [date] = useState(() => dayKey());
  const [selection, setSelection] = useState(() => {
    const plan = selectPractice(props.state, props.energy, date, props.resume);
    return plan.current.review ? null : plan;
  });
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { energy, resume } = props;
  useEffect(() => {
    if (selection) return;
    let active = true;
    void updateStoreNow(prev => {
      const { current, run } = selectPractice(prev, energy, date, resume);
      if (!current.review || run?.reviewItem) return prev;
      const item = current.items[0];
      const reviewId = globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      const snapshot = { unit: current.unit, day: current.day, pos: 0, records: [], levels: [], review: true,
        phase: "write" as const, freshReview: current.freshReview, ...run,
        scopedHints: run ? !!run.scopedHints : true, reviewId: run ? run.reviewId : reviewId,
        items: [item.id], reviewItem: item };
      return { ...prev, notes: saveRunProgress(prev.notes, date, true, snapshot, run ? reviewRunId(run) : undefined) };
    }).then(prev => { if (active) setSelection(selectPractice(prev, energy, date, resume)); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "短複習題目無法儲存。"); });
    return () => { active = false; };
  }, [attempt, date, energy, resume, selection]);
  if (selection) {
    const alternatives = selection.current.review ? readReviewRuns(props.state.notes, date) : [];
    const selected = selection.run ? reviewRunId(selection.run) : "";
    const hasSelected = alternatives.some(run => reviewRunId(run) === selected);
    return <>
      {(alternatives.length > 1 || (selected && !hasSelected && alternatives.length > 0)) && <label className="pr-field">
        今天已開過的短複習
        <select value={hasSelected ? selected : ""} onChange={event => {
          const picked = selectPractice(props.state, energy, date, resume, event.target.value);
          if (picked.run) setSelection(picked);
        }}>
          {!hasSelected && <option value="" disabled>選擇另一份未完成的短複習</option>}
          {alternatives.map(run => {
            const question = run.reviewItem ?? sentenceById.get(run.items?.[0] ?? "");
            return <option key={reviewRunId(run)} value={reviewRunId(run)}>
              {question?.zh ?? "短複習"}{run.records.length ? "（已自評）" : "（尚未自評）"}
            </option>;
          })}
        </select>
      </label>}
      <PracticeRun key={selected} {...props} selection={selection} />
    </>;
  }
  return <section className="practice-page">
    {error ? <><p role="alert">{error}</p><button className="pr-main" type="button" onClick={() => { setError(""); setAttempt(n => n + 1); }}>再試一次</button></> :
      <p role="status">正在儲存這次短複習的題目……</p>}
  </section>;
}

function PracticeRun({ state, update, navigate, selection }: PageProps & { selection: ReturnType<typeof selectPractice> }) {
  const { current, date, period, energy, guided, resumeAt, run } = selection;
  const lessonDate = resumeAt?.date ?? date;
  const retry = current.retry;
  const [pos, setPos] = useState(run?.pos ?? 0);
  const [lessonData, setLessonData] = useState<Lesson | null | undefined>(guided ? undefined : null);
  // The lesson content could not be downloaded (offline before it was ever saved): say so and wait, instead of falling
  // back to a step that was already done (its buttons would not move on).
  const [lessonFailed, setLessonFailed] = useState(false);
  useEffect(() => {
    if (!guided) return;
    let alive = true;
    import("../data/lessons.json")
      .then((file) => { if (alive) setLessonData((file.default as Lesson[]).find((l) => l.unit === current.unit) ?? null); })
      .catch(() => { if (alive) setLessonFailed(true); });
    return () => { alive = false; };
  }, [guided, current.unit]);
  const [firstListen] = useState(() => !readHeard(state.notes, current.unit));
  const heardRecord = readHeard(state.notes, current.unit);
  const [records, setRecords] = useState<TranslationRecord[]>(() => resumeAt?.rec.records ?? run?.records ?? []);
  const [spoken, setSpoken] = useState<string[]>(resumeAt?.rec.spoken ?? run?.spoken ?? []);
  const [feedback, setFeedback] = useState<Session["feedback"]>();
  const [sessionId] = useState(
    () =>
      (current.review && run ? run.reviewId ?? "review-" + date + "-" + reviewRunId(run) : undefined) ??
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
  const [phase, setPhase] = useState<Phase>(() => !guided
    ? run?.phase ?? (run?.records.some((r) => r.sentenceId === current.items[run.pos]?.id) ? "sound" : "write")
    : (resumeAt && resumePhase(resumeAt.rec)) || (guidedRecall.length ? "recall" : "listen"));
  useEffect(() => {
    if (guided && lessonData === null && phase !== "sound" && phase !== "write" && phase !== "done") setPhase("write");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonData]);
  const live = guided && !!lessonData;
  const recallNow = guidedRecall[recalls.length];
  const lessonIdentity = { unit: current.unit, day: current.day, retry, sentenceId: current.items[0].id };
  const lessonRecord = guided ? readLessonRecord(state.notes, lessonDate, lessonIdentity) : null;
  const currentLessonTarget = lessonTarget(lessonDate, lessonIdentity);
  const thisLessonHeard = lessonRecord?.heard ?? (heardRecord && (heardRecord.lessonTarget ? heardRecord.lessonTarget === currentLessonTarget
    : heardRecord.lessonDate === lessonDate && readDayLessons(state.notes, lessonDate).filter(r => r.unit === current.unit).length <= 1)
    ? heardRecord : undefined);
  const corrections = lessonRecord?.express?.corrections ?? 0;
  const stepsDone: LessonStep[] = [...(lessonRecord?.steps ?? []), ...(guidedRecall.length ? [] : ["recall" as const])];
  const stepNow: LessonStep = phase === "recall" ? "recall" : phase === "listen" ? "listen"
    : phase === "express" ? (corrections ? "fix" : "express") : phase === "done" ? "done" : "pattern";
  /** Saves the lesson's own state (step reached, answers, hints) so a reload or tomorrow continues the same lesson. */
  function save(patch: Partial<LessonRecord>, s?: LessonStep) {
    update((prev) => ({ ...prev, notes: updateLesson(prev.notes, lessonDate, current.unit, current.day, { ...patch, ...lessonIdentity }, s) }));
  }
  function step(s: LessonStep, extra: Partial<LessonRecord> = {}) { save(extra, s); }
  function recordExpression(apply: (rec: ExpressRecord) => ExpressRecord, graded: boolean, confirmSave = false) {
    return (confirmSave ? updateStoreNow : update)((prev) => {
      const notes = saveLessonExpression(prev.notes, lessonDate, lessonIdentity, apply, graded);
      return notes === prev.notes ? prev : { ...prev, notes };
    });
  }
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
  const checkpointLevels = useRef<(Level | null)[]>((run?.levels ?? []) as (Level | null)[]);
  const runAnswers = useRef<Record<string, string>>({ ...run?.answers });
  const activeReviewId = current.review && run ? reviewRunId(run) : undefined;
  function stillReviewing(notes: Record<string, string>) {
    if (!activeReviewId) return false;
    const latest = readRunProgress(notes, date, true, current.unit, current.day, activeReviewId);
    return !!latest && latest.reviewId === run?.reviewId && latest.items?.[0] === current.items[0].id;
  }
  const runProgress = (at: number, list: TranslationRecord[], phase: "write" | "sound", spokenIds: string[],
    levels = checkpointLevels.current, answers = runAnswers.current) => ({
    unit: run?.unit ?? current.unit, day: run?.day ?? current.day, pos: at, retry: run?.retry ?? retry, review: current.review,
    items: current.items.map(s => s.id), records: list, levels, phase, answers, spoken: spokenIds,
    scopedHints: run ? !!run.scopedHints : true, reviewId: run?.reviewId, reviewItem: run?.reviewItem, freshReview: run?.freshReview,
  });
  /** Where a checkpoint or review day is, kept for today (cleared when it is finished). */
  const keepRun = (at: number, list: TranslationRecord[], phase: "write" | "sound", spokenIds = spoken) => {
    if (guided) return;
    const progress = runProgress(at, list, phase, spokenIds);
    update(prev => {
      const latest = current.review ? readRunProgress(prev.notes, date, true, current.unit, current.day, activeReviewId) : null;
      if (current.review && (!latest || !stillReviewing(prev.notes))) return prev;
      const next = latest ? mergeRunProgress(latest, { ...progress, updatedAt: Date.now() }) : progress;
      return { ...prev, notes: saveRunProgress(prev.notes, date, current.review, next) };
    });
  };
  // The short review can continue at the same sentence even after the course moves to a different unit.
  const practiceScope = current.review ? ["review", date, run?.reviewId].filter(Boolean).join(".")
    : ["checkpoint", date, current.unit, current.day, retry].join(".");
  const practiceAnswerKey = (id: string) => "practice." + practiceScope + "." + id;
  const practiceHints = guided ? {} : readHints(state.notes, date);
  function olderHint(id: string): HintUse | undefined {
    const hint = practiceHints[id];
    if (!hint) return;
    // The old key cannot identify the checked answer, but keep the known exposure to help.
    return { h: hint.h, r: hint.r || hint.h >= 2 || !!(hint.v && hint.v !== "good"), c: hint.c };
  }
  const hintFor = (id: string): HintUse | undefined => guided ? lessonRecord?.hints?.[id]
    : practiceHints[practiceAnswerKey(id)] ?? (run && !run.scopedHints ? olderHint(id) : undefined);
  const saveHint = (id: string) => (use: HintUse) => {
    if (guided) update((prev) => {
      const rec = readLessonRecord(prev.notes, lessonDate, lessonIdentity);
      return { ...prev, notes: updateLesson(prev.notes, lessonDate, current.unit, current.day, { ...lessonIdentity, hints: { ...(rec?.hints ?? {}), [id]: use } }) };
    });
    else update((prev) => {
      const key = practiceAnswerKey(id);
      const previous = readHints(prev.notes, date)[key];
      return { ...prev, notes: writeHint(prev.notes, date, key, previous ? mergeHintUse(previous, use) : use) };
    });
  };
  const item = current.items[pos];
  const previousExpressionId = [lessonDate, current.unit, current.day, lessonIdentity.sentenceId].join("/");
  const expressionId = retry > 1 ? previousExpressionId + "/r" + retry : previousExpressionId;
  function backSentence() {
    if (pos === 0 || !settled()) return;
    keepRun(pos - 1, records, "write");
    setPos(pos - 1); setPhase("write");
  }
  async function mark(value: Mark, revealed: boolean, info: { answer: string; firstVerdict?: Verdict; checkedText?: string }) {
    if (!settled()) return false;
    const attempted = answered(info.answer);
    if (!attempted) revealed = true;
    const level = judgeWritten({ rating: ratingOf[value], revealed, answer: info.answer, references: item.reference, firstVerdict: info.firstVerdict, checkedText: info.checkedText });
    const record = { sentenceId: item.id, rating: ratingOf[value], grammar: item.grammar,
      revealed, attempted, ...(guided && attempted ? { answer: info.answer } : {}), verified: level === "independent" };
    let list = records;
    let levels = checkpointLevels.current;
    let answers = runAnswers.current;
    await updateStoreNow(prev => {
      const alreadyShown = records.some(r => r.sentenceId === item.id);
      if (current.review) {
        if (!stillReviewing(prev.notes)) throw new Error("另一個分頁已完成或換了短複習。你的草稿還在這裡。");
        const latest = readRunProgress(prev.notes, date, true, current.unit, current.day, activeReviewId);
        if (latest?.records.some(r => r.sentenceId === item.id)) {
          list = latest.records;
          answers = latest.answers ?? {};
          if (!alreadyShown && (answers[item.id] ?? "") !== info.answer)
            throw new Error("另一個分頁已送出不同答案。你的草稿仍在作答欄。");
        }
      } else if (guided) {
        list = readLessonRecord(prev.notes, lessonDate, lessonIdentity)?.records ?? list;
        const remote = list.find(r => r.sentenceId === item.id);
        if (!alreadyShown && remote && (remote.answer ?? "") !== info.answer)
          throw new Error("另一個分頁已送出不同答案。你的草稿仍在作答欄。");
      }
      const first = !list.some(r => r.sentenceId === item.id);
      if (first) {
        list = [...list, record];
        if (!guided) answers = { ...answers, [item.id]: info.answer };
        if (current.checkpoint) levels = [...levels, level];
      }
      if (!guided) return { ...prev, notes: saveRunProgress(prev.notes, date, current.review,
        runProgress(pos, list, "sound", spoken, levels, answers)) };
      const pending = level === "pending" ? { answer: info.answer, prompt: item.zh, ref: item.reference[0] } : {};
      const notes = first && level ? addEvidence(prev.notes, current.unit, { day: date, level,
        source: "pattern", skill: "write", item: item.id, hints: hintFor(item.id)?.h, ...pending }) : prev.notes;
      return { ...prev, notes: updateLesson(notes, lessonDate, current.unit, current.day, { ...lessonIdentity, records: list, phase: "sound" }) };
    });
    checkpointLevels.current = levels;
    runAnswers.current = answers;
    setRecords(list);
    setPhase("sound");
    return true;
  }
  function saveSession(prev: AppState, skip = false): AppState {
    const lastLesson = guided ? readLessonRecord(prev.notes, lessonDate, lessonIdentity) : null;
    const lastRun = current.review && stillReviewing(prev.notes) ? readRunProgress(prev.notes, date, true, current.unit, current.day, activeReviewId) : null;
    const confirmedRecalls = lastLesson?.recalls ?? recalls;
    const confirmedRecords = lastLesson?.records ?? lastRun?.records ?? records;
    const results = skip ? [] : [...confirmedRecalls, ...confirmedRecords];
    const written = results.filter(answer => answer.attempted !== false);
    const spokenIds = [...new Set([...spoken, ...(lastLesson?.spoken ?? lastRun?.spoken ?? [])])];
    // Two devices can finish separate submissions after resuming the same unfinished checkpoint.
    const checkpointId = current.checkpoint && !skip ? sessionId : undefined;
    const drawn =
      !skip && retention ? confirmedRecalls.find(t => t.attempted !== false && t.sentenceId === retention.sentence.id) : undefined;
    const { finished: success, independent } = checkpointOutcome(confirmedRecords);
      if (prev.sessions.some((s) => s.id === sessionId)) return prev;
      const reviewed = results.reduce((s, answer) => logSentence(s, sessionId, date, answer), prev);
      if (current.review && !skip && !written.length && !spokenIds.length) {
        const notes = stillReviewing(reviewed.notes) ? saveRunProgress(reviewed.notes, date, true, null, activeReviewId) : reviewed.notes;
        return notes === reviewed.notes ? reviewed : { ...reviewed, notes };
      }
      const cards = [...reviewed.cards];
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
        next.day === current.day && next.retry === retry
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
          prev.curriculum.day === current.day && prev.curriculum.retry === retry,
        words: learned,
        rating: written.at(-1)?.rating,
        translations: written,
        spokenIds,
        feedback,
      };
      return {
        ...prev,
        sessions: [...prev.sessions, entry],
        cards,
        reviewEvents: reviewed.reviewEvents,
        curriculum: next,
        notes: (() => {
          let notes =
            drawn && retention
              ? recordRetention(
                  reviewed.notes,
                  retention.unit,
                  current.unit,
                  drawn.rating,
                  drawn.revealed,
                  drawn.verified === true,
                )
              : reviewed.notes;
          if (checkpointId) {
            const checkpointItems = Object.fromEntries(confirmedRecords.map((r, i) => [r.sentenceId, checkpointLevels.current[i] ?? null]));
            const level = judgeCheckpoint(Object.values(checkpointItems));
            if (level) notes = addEvidence(notes, current.unit, { day: date, source: "checkpoint", skill: "write",
              level, checkpointItems, checkpointId, attemptId: checkpointId + ":checkpoint" });
            for (const sentence of current.items) {
              const answer = runAnswers.current[sentence.id];
              if (checkpointItems[sentence.id] === "pending" && answered(answer)) {
                notes = addEvidence(notes, current.unit, { day: date, source: "checkpoint", skill: "write", level: "pending",
                  item: sentence.id, answer, prompt: sentence.zh, ref: sentence.reference[0],
                  checkpointId, attemptId: checkpointId + ":answer:" + sentence.id });
              }
            }
          }
          if (current.checkpoint && success && !independent && !alreadyAdvanced)
            notes = markAssisted(notes, current.unit, date);
          if (current.checkpoint && independent) notes = clearAssisted(notes, current.unit);
          // Same standard as the checkpoint: a blank, hinted or unchecked "correct" never makes a unit 「穩了」.
          if (retention && recheckMakesStable(drawn) && notes["unit-assisted." + retention.unit]) {
            notes = clearAssisted(notes, retention.unit);
            next.stableUnits = [...new Set([...next.stableUnits, retention.unit])];
          }
          // A checkpoint or review day finished: nothing left to go on with.
          return guided || (current.review && !stillReviewing(notes)) ? notes : saveRunProgress(notes, date, current.review, null, activeReviewId);
        })(),
        learningWords: [...new Set([...prev.learningWords, ...learned])],
      };
  }
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [recordedSession, setRecordedSession] = useState(true);
  const finishingRef = useRef(false);
  async function finish(skip = false) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    setFinishError("");
    try {
      const saved = await updateStoreNow(prev => saveSession(prev, skip));
      setRecordedSession(saved.sessions.some(s => s.id === sessionId));
      setPhase("done");
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : "練習紀錄未儲存，請再試一次。");
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
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
                <small>今天寫過的句子（答案不在這裡顯示，複習時再自己寫一次）：{it.zh}</small>
              </p>
            ))}
            <button type="button" className="pr-main" onClick={() => look(null)}>回到{hereName}</button>
          </section>
        )}
        <div className="pr-phase" hidden={!!reviewing}>
        {guided && lessonData === undefined && (lessonFailed ? (
          <div className="pr-hint" role="alert">
            <strong>今天這一堂的教材沒有下載到</strong>
            <p>可能是網路斷了。連上網路後按「重新載入」，會從剛剛做到的地方接著上，寫過的都還在。</p>
            <div className="pr-actions"><button className="pr-main" onClick={() => location.reload()}>重新載入</button></div>
          </div>
        ) : <p className="ls-help">準備今天這一堂…</p>)}
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
                draftKey={"guided." + currentLessonTarget + ".recall." + recallNow.sentence.id}
                onMark={async (mark, revealed, info) => {
                  if (!answered(info.answer)) revealed = true;
                  const level = judgeWritten({ rating: ratingOf[mark], revealed, answer: info.answer, references: recallNow.sentence.reference, firstVerdict: info.firstVerdict, checkedText: info.checkedText });
                  let list = recalls;
                  const s = recallNow.sentence;
                  await updateStoreNow(prev => {
                    list = readLessonRecord(prev.notes, lessonDate, lessonIdentity)?.recalls ?? list;
                    const remote = list.find(r => r.sentenceId === s.id);
                    if (remote) {
                      if ((remote.answer ?? "") !== info.answer)
                        throw new Error("另一個分頁已送出不同答案。你的草稿仍在作答欄。");
                      return prev;
                    }
                    list = [...list, { sentenceId: s.id, rating: ratingOf[mark], grammar: s.grammar, revealed,
                    verified: level === "independent", attempted: answered(info.answer), ...(info.answer.trim() ? { answer: info.answer } : {}) }];
                    const pending = level === "pending" ? { answer: info.answer, prompt: s.zh, ref: s.reference[0] } : {};
                    const notes = level && retention && s.id === retention.sentence.id
                      ? addEvidence(prev.notes, retention.unit, { day: date, level, source: "retention", skill: "write", item: s.id, ...pending }) : prev.notes;
                    return { ...prev, notes: updateLesson(notes, lessonDate, current.unit, current.day, { ...lessonIdentity, recalls: list, phase: "recall" }) };
                  });
                  setRecalls(list);
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
            saved={thisLessonHeard}
            onReveal={(heard) => {
              const record = { ...heard, day: date, lessonDate, lessonTarget: currentLessonTarget, at: Date.now() };
              update((prev) => {
                const key = heardKey(current.unit);
                const rec = readLessonRecord(prev.notes, lessonDate, lessonIdentity);
                const lessonNotes = rec?.heard ? prev.notes
                  : updateLesson(prev.notes, lessonDate, current.unit, current.day, { ...lessonIdentity, heard: record });
                if (readHeard(prev.notes, current.unit)) return lessonNotes === prev.notes ? prev : { ...prev, notes: lessonNotes };
                const notes = { ...lessonNotes, [key]: JSON.stringify(record) };
                const understood = heard.counted && heard.total > 0 && heard.correct === heard.total;
                return { ...prev, notes: understood ? addEvidence(notes, current.unit, { day: date, level: "independent", source: "listen", skill: "listen" }) : notes };
              });
            }}
            onDone={() => go("write", {}, "listen")}
          />
        )}
        {live && lessonData && phase === "vary" && (() => {
          const todays = variationsFor(lessonData, current.day);
          const at = Math.min(varied, todays.length - 1);
          const v = todays[at];
          // A variation already marked (going back to it with 「回上一句」) keeps its first record: marking it again only
          // moves on, so nothing is counted twice.
          const already = (lessonRecord?.varied ?? 0) > at;
          return (<>
            {at > 0 && <button type="button" className="pr-link ls-back" onClick={() => { changedAt.current = Date.now(); setVaried(at - 1); }}>← 回上一句（換個說法 {at}，你寫的還在）</button>}
            {already && <p className="ls-help">這句之前已經記過了：可以再改、再請 Claude 看，紀錄照第一次的算。</p>}
            <LessonVariation
              key={at}
              item={v}
              count={[at + 1, todays.length]}
              tutorId={item.id}
              pattern={current.title}
              rule={current.rule}
              peekedBefore={!!lessonRecord?.peeked?.includes(at)}
              saved={lessonRecord?.varyChecks?.[at]}
              alreadyMarked={already}
              draftKey={["vary", currentLessonTarget, at].join(".")}
              legacyDraftKey={"vary." + current.unit + "." + current.day + "." + at}
              onCheck={(check) => update((prev) => {
                const rec = readLessonRecord(prev.notes, lessonDate, lessonIdentity);
                const checks = rec?.varyChecks ?? {};
                const merged = checks[at] ? mergeVariationCheck(checks[at], check) : check;
                return { ...prev, notes: updateLesson(prev.notes, lessonDate, current.unit, current.day, { ...lessonIdentity, varyChecks: { ...checks, [at]: merged } }) };
              })}
              onPeek={() => update((prev) => {
                const rec = readLessonRecord(prev.notes, lessonDate, lessonIdentity);
                if (rec?.peeked?.includes(at)) return prev;
                return { ...prev, notes: updateLesson(prev.notes, lessonDate, current.unit, current.day, { ...lessonIdentity, peeked: [...(rec?.peeked ?? []), at] }) };
              })}
              onDone={async (m, answer, check) => {
                if (!settled()) return false;
                if (already && at + 1 < todays.length) {
                  changedAt.current = Date.now();
                  setVaried(at + 1);
                  requestAnimationFrame(() => pane.current?.scrollIntoView({ block: "start" }));
                  return true;
                }
                const level = judgeVariation(m, answer, [v.en, ...(v.alt ?? [])], check);
                const atEnd = at + 1 === todays.length;
                await updateStoreNow(prev => {
                  const rec = readLessonRecord(prev.notes, lessonDate, lessonIdentity);
                  if ((rec?.varied ?? 0) > at) {
                    if (!already && (rec?.varyChecks?.[at]?.answer ?? "") !== answer)
                      throw new Error("另一個分頁已送出不同答案。你的草稿仍在作答欄。");
                    return prev;
                  }
                  const checks = rec?.varyChecks ?? {};
                  const patch = { ...lessonIdentity, varied: at + 1, varyChecks: { ...checks, [at]: { ...checks[at], ...check, answer } } };
                  const pending = level === "pending" ? { answer: check.before ?? answer, prompt: v.zh, ref: v.en } : {};
                  const carried = level ? addEvidence(prev.notes, current.unit, { day: date, level,
                    source: "vary", skill: "write", item: item.id + "-v" + at, ...pending }) : prev.notes;
                  const notes = updateLesson(carried, lessonDate, current.unit, current.day,
                    atEnd ? { ...patch, phase: "express" } : patch, atEnd ? "pattern" : undefined);
                  const trained = m !== "good" || !level ? addSayCard({ ...prev, notes },
                    { zh: v.zh, en: v.en, why: "這課的句型：" + current.title, from: "lesson" }, date) : { ...prev, notes };
                  return atEnd ? saveSession(trained) : trained;
                });
                if (!atEnd) {
                  // The next sentence is a new screen: a double tap must not mark it too.
                  changedAt.current = Date.now();
                  setVaried(at + 1);
                  requestAnimationFrame(() => pane.current?.scrollIntoView({ block: "start" }));
                  return true;
                }
                setPhase("express");
                return true;
              }}
            />
          </>);
        })()}
        {live && lessonData && phase === "express" && (
          <LessonExpress
            key={expressionId}
            lessonId={expressionId}
            lesson={lessonData}
            prompt={promptFor(lessonData, current.day)}
            draftKey={"express." + expressionId}
            legacyDraftKey={retry > 1 ? "express." + previousExpressionId : "express." + current.unit + "." + current.day}
            pattern={current.title}
            saved={lessonRecord?.express}
            onRecord={recordExpression}
            onSave={(cards) => updateStoreNow((prev) => addSayCards(prev, cards, date, "lesson"))}
            onSpeak={async () => {
              const origin = location.hash;
              await updateStoreNow(prev => {
                if (!readLessonRecord(prev.notes, lessonDate, lessonIdentity)) throw new Error("這堂課的紀錄尚未載入，請同步後再開始口說。");
                return prev;
              });
              if (location.hash === origin) location.hash = "speaking/lesson-" + currentLessonTarget;
            }}
            onFinish={async (answer, drafted) => {
              if (!settled()) return false;
              const prompt = promptFor(lessonData, current.day);
              // Something written counts as the step done, with or without Claude's correction (the summary said 「今天跳過」).
              await updateStoreNow(prev => {
                const latest = readLessonRecord(prev.notes, lessonDate, lessonIdentity);
                if (!latest) throw new Error("這堂課的紀錄尚未載入，作答草稿仍在這裡。");
                if (latest.steps.includes("done")) {
                  const recorded = latest.express?.finalAnswer ?? latest.express?.lastAnswer ?? latest.express?.first ?? "";
                  if (recorded !== answer.trim()) throw new Error("另一個分頁已完成這堂課。你的草稿仍在作答欄。");
                  return prev;
                }
                const express = { ...(latest.express ?? drafted), ...(latest.express?.first ? {} : { first: drafted.first, firstHelp: drafted.firstHelp }),
                  ...(answer.trim() ? { finalAnswer: answer.trim() } : {}) };
                const responded = !!(express.first || answer.trim());
                const level = judgeExpress({ firstVerdict: express.firstResult?.verdict, help: express.firstHelp ?? express.help, answered: responded });
                const pending = level === "pending" ? { answer: express.first || answer, prompt: prompt.en, ref: prompt.sample } : {};
                let notes = level ? addEvidence(prev.notes, current.unit, { day: date, level, source: "express", skill: "write", ...pending }) : prev.notes;
                if (responded) notes = updateLesson(notes, lessonDate, current.unit, current.day, { ...lessonIdentity, express }, "express");
                return { ...prev, notes: updateLesson(notes, lessonDate, current.unit, current.day, { ...lessonIdentity, phase: "done" }, "done") };
              });
              setPhase("done");
              return true;
            }}
          />
        )}
        {phase === "write" && !(guided && lessonData === undefined) && (
          <>
            {!guided && pos > 0 && !current.freshReview && (
              <button className="pr-link" onClick={backSentence}>← 上一句（你寫的會放回去，紀錄照第一次的算）</button>
            )}
            {energy === "low" && state.settings.why && (
              <p>{state.settings.why}</p>
            )}
            {current.freshReview && (
              <div className="pr-recall">
                <h2 className="pr-question">說一句你已經會的英文。</h2>
                <p>還沒有個人複習卡，今天說完這一句就可以收工。</p>
                <button className="pr-main" disabled={finishing} onClick={() => void finish(true)}>我複習了自己熟悉的一句</button>
                {finishError && <p role="alert">{finishError}</p>}
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
                      saved={hintFor(recall.sentence.id)}
                      onHint={saveHint(recall.sentence.id)}
                      draftKey={"guided." + currentLessonTarget + ".recall." + recall.sentence.id}
                      onMark={async (mark, revealed, info) => {
                        if (!answered(info.answer)) revealed = true;
                        const s = recall.sentence;
                        const level = judgeWritten({ rating: ratingOf[mark], revealed, answer: info.answer, references: s.reference, firstVerdict: info.firstVerdict, checkedText: info.checkedText });
                        let list = recalls;
                        let saved = false;
                        await updateStoreNow(prev => {
                          const lesson = readLessonRecord(prev.notes, lessonDate, lessonIdentity);
                          if (lesson?.steps.includes("done")) throw new Error("這一堂課已完成。你的回想草稿還在。");
                          list = lesson?.recalls ?? list;
                          if (list.some(r => r.sentenceId === s.id)) return prev;
                          list = [...list, { sentenceId: s.id, rating: ratingOf[mark], grammar: s.grammar, revealed,
                            verified: level === "independent", attempted: answered(info.answer), ...(info.answer.trim() ? { answer: info.answer } : {}) }];
                          const pending = level === "pending" ? { answer: info.answer, prompt: s.zh, ref: s.reference[0] } : {};
                          const notes = level && retention && s.id === retention.sentence.id
                            ? addEvidence(prev.notes, retention.unit, { day: date, level, source: "retention", skill: "write", item: s.id, ...pending }) : prev.notes;
                          saved = true;
                          return { ...prev, notes: updateLesson(notes, lessonDate, current.unit, current.day, { ...lessonIdentity, recalls: list }) };
                        });
                        setRecalls(list);
                        return saved;
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
                draftKey={guided ? "guided." + currentLessonTarget + "." + item.id : practiceAnswerKey(item.id)}
                legacyHint={olderHint(item.id)}
                initialAnswer={runAnswers.current[item.id]}
                alreadyMarked={records.some(r => r.sentenceId === item.id)}
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
              onSpoken={() => {
                const ids = [...new Set([...spoken, item.id])];
                setSpoken(ids);
                if (guided) update(prev => {
                  const saved = readLessonRecord(prev.notes, lessonDate, lessonIdentity)?.spoken ?? [];
                  return { ...prev, notes: updateLesson(prev.notes, lessonDate, current.unit, current.day,
                    { ...lessonIdentity, spoken: [...new Set([...saved, item.id])] }) };
                });
                else keepRun(pos, records, "sound", ids);
              }}
            />
            <div className="pr-end-controls">
              {pos + 1 < current.items.length ? (
                <button
                  className="pr-main"
                  onClick={() => {
                    if (!settled()) return;
                    keepRun(pos + 1, records, "write");
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
                <button className="pr-main" disabled={finishing} onClick={() => { if (settled()) void finish(); }}>
                  今天到這裡
                </button>
              )}
            </div>
            {finishError && <p role="alert">{finishError}</p>}
          </>
        )}
        {phase === "done" && (
          <>
            <div className="pr-label">{recordedSession ? "練習已儲存" : "已略過"}</div>
            <h2 className="pr-question">{recordedSession ? "今天有練，就往前了一點。" : "這一句留待下次練習。"}</h2>
            {live && (() => {
              const heard = thisLessonHeard;
              const written = !!(lessonRecord?.express?.first || lessonRecord?.express?.lastAnswer || lessonRecord?.express?.finalAnswer);
              const spoke = !!lessonRecord?.voiceExpression;
              const writing = "用自己的話寫了一段" + (lessonRecord?.corrected ? "，請 Claude 批改過" : "");
              const expression = spoke && written ? writing + "，也和 Emma 練口說"
                : spoke ? "和 Emma 練口說" : written ? writing
                : stepsDone.includes("express") ? "舊紀錄未保留作答方式" : "今天跳過";
              const did = (id: LessonStep) => id === "express" ? written || spoke
                : stepsDone.includes(id) && (id !== "recall" || guidedRecall.length > 0);
              const lines: [LessonStep, string][] = [
                ["recall", guidedRecall.length ? "回想：" + recalls.filter(r => r.attempted !== false).length + " 句舊句" : "回想：今天沒有要回想的句子"],
                ["listen", heard?.total ? "聽懂：對話題目答對 " + heard.correct + " / " + heard.total + (heard.counted === false ? "（未計入獨立聽力）" : "") : "聽懂：聽對話、跟著唸"],
                ["pattern", "句型：今天的句子和一個變化"],
                ["express", "表達：" + expression],
                ["fix", did("fix") ? "訂正：上次指出的問題都改好了" : (lessonRecord?.express?.corrections ?? 0) >= 2 ? "訂正：再批過了，但還有問題沒改好，下次再試" : "訂正：下次試著改完再批一次"],
              ];
              return <>
                {current.cando && <p className="ls-goal"><small>今天的目標</small>{current.cando}</p>}
                <ul className="ls-summary">{lines.map(([id, text]) => <li key={id} data-skip={!did(id)}>{text}</li>)}</ul>
              </>;
            })()}
            {(live || current.checkpoint) && (() => {
              const today = readEvidence(state.notes, current.unit).filter((e) => e.day === date && !e.wrong && (e.source !== "checkpoint" || !e.item));
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
            {recordedSession && energy !== "low" && (
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
  const [opened, setOpened] = useState(false);
  const exact = typeof resume === "string" ? resume : undefined;
  const target = exact ? selectLessonRecord(state.notes, exact) : null;
  const completed = target?.rec.steps.includes("done");
  const studyBreak = period === "exam" || period === "internship";
  const available = !exact || (!!target && !completed && !studyBreak);
  useEffect(() => { if (available) setOpened(true); }, [available]);
  if (exact && !opened && !available) return <section className="pr-hint">
    <h1>{completed ? "這堂課已完成" : target && studyBreak ? "考週或實習期間暫停每日課" : "這堂課的紀錄尚未載入"}</h1>
    <p>{target ? `單元 ${target.rec.unit} 第 ${target.rec.day} 天` : "同步這堂課的進度後，即可從原位置繼續。"}</p>
    <a className="pr-link" href={parseLessonTarget(exact) ? "#history/day-" + exact : "#history"}>查看航行紀錄</a>
  </section>;
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
  const detail = location.hash.split("/")[2];
  const timed = (mode === "words" || mode === "translate") ? detail?.match(/^review-([1-9]|[12]\d|30)-(low|normal)$/) : null;
  const timedReview = timed ? Number(timed[1]) : undefined;
  const shortReview = (mode === "words" && detail === "low") || timed?.[2] === "low";
  const energy = shortReview ? "low" : timedReview ? "normal" : reviewEnergy(today, state.settings.periods);
  const id = "library-" + today;
  // Opening the library never counts as a practice session. Save only on an answer or a recall.
  const withActivity = (apply: (prev: AppState) => AppState) =>
    (prev: AppState) => {
      if (prev.sessions.some((s) => s.id === id)) return apply(prev);
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
      const started = { ...prev, sessions: [...prev.sessions, baseline] };
      const next = apply(started);
      return next === started ? prev : next;
    };
  return (
    <div className="practice-page">
      <Extras
        key={today + period + mode + energy + (timedReview ?? "")}
        mode={mode}
        state={state}
        update={update}
        onActivity={apply => update(withActivity(apply))}
        onSavedActivity={async apply => { await updateStoreNow(withActivity(apply)); }}
        navigate={navigate}
        energy={energy}
        timedReview={timedReview}
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
  timedReview,
  date,
  sessionId,
  onActivity = update,
  onSavedActivity,
}: PageProps & {
  mode: LibraryMode;
  energy: Energy;
  timedReview?: number;
  date: string;
  sessionId: string;
  onActivity?: PageProps["update"];
  onSavedActivity: (updater: (prev: AppState) => AppState) => Promise<void>;
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
  // #library/grammar opens 完整文法; /<unit> a course unit's teaching (from 主題總複習), /<section> like 14-2 that section.
  const [grammarHash, setGrammarHash] = useState(() => location.hash);
  // #library/case/<subject id> and #library/quiz/<subject id>: only that licensing-exam subject (from 國考科目).
  const subjectFromHash = () => {
    const [, page, id] = location.hash.replace(/^#/, "").split("/");
    return page === "case" || page === "quiz" ? examSubjects.subjects.find((x) => x.id === id)?.name : undefined;
  };
  const [examSubject, setExamSubject] = useState<string | undefined>(subjectFromHash);
  // Another address of the same page (#library/words/listen, #library/writing/<id>, #library/story/listen) opens that part.
  // A different kind of practice is a different page: the app opens it fresh.
  useEffect(() => {
    const onHash = () => {
      if (location.hash.startsWith("#library/words/")) setWordSkill(skillFromHash());
      if (location.hash.startsWith("#library/writing")) setWritingTask(taskFromHash());
      if (location.hash.startsWith("#library/story")) setStoryTab(storyFromHash());
      if (location.hash.startsWith("#library/grammar")) setGrammarHash(location.hash);
      if (location.hash.startsWith("#library/case") || location.hash.startsWith("#library/quiz")) setExamSubject(subjectFromHash());
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [limit] = useState(() => {
    if (timedReview !== undefined) return reviewLoad(state, date, energy, timedReview).words;
    const reviewed = new Set(
      state.reviewEvents
        .filter((e) => e.day === date && e.id.startsWith("word:"))
        .map((e) => e.id),
    );
    return Math.max(0, reviewBudget(energy) - reviewed.size);
  });
  const [offset, setOffset] = useState(0);
  const [see, setSee] = useState(false);
  const wordSaving = useRef(false);
  const [savingWord, setSavingWord] = useState(false);
  const [wordError, setWordError] = useState("");
  const [wordNotice, setWordNotice] = useState("");
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
  // 「← 上一句」: a sentence marked in this round keeps what he wrote (put back into its box), and marking it again only
  // moves on — its first record stands.
  const repeatAnswers = useRef(new Map<string, string>());
  const repeatMarked = useRef(new Set<string>());
  const [repeatSaving, setRepeatSaving] = useState(false);
  const [repeatNotice, setRepeatNotice] = useState("");
  const [repeatClosed, setRepeatClosed] = useState(false);
  function backRepeat() {
    const prev = translationPool[repeatIndex - 1];
    if (!prev) return;
    setRepeatIndex(repeatIndex - 1); setRepeatDone(false); setRepeatNotice("");
  }
  const [repeatDone, setRepeatDone] = useState(false);
  // Due sentence cards come first (oldest first), then familiar sentences, then new ones.
  const [{ pool: translationPool, due: dueSentenceIds }] = useState(() => {
    syncCustom(state.notes);
    let due = dueCards(
      state.cards.filter((c) => sentenceById.has(c.id)),
      date,
      energy,
    ).map((c) => c.id);
    if (timedReview !== undefined) due = due.slice(0, reviewLoad(state, date, energy, timedReview).sentences);
    const ids = timedReview !== undefined ? due : [
      ...new Set([
        ...due,
        ...familiar.slice().reverse(),
        ...(!quiet ? sentences.map((s) => s.id) : []),
      ]),
    ];
    return { pool: ids.flatMap((id) => sentenceById.get(id) ?? []), due: new Set(due) };
  });
  // What today's review still holds: the word screen points to 中翻英 when sentence cards are waiting.
  const load = reviewLoad(state, date, timedReview !== undefined ? energy : reviewEnergy(date, state.settings.periods), timedReview);
  const sentencesDone = reviewedSentenceCount(state.notes, date);
  const repeat = translationPool[repeatIndex];
  /** Same rule as the lesson: only a checked answer written alone counts as remembered. */
  async function logRepeat(mark: Mark, revealed: boolean, info: { answer: string; firstVerdict?: Verdict; checkedText?: string }) {
    if (!repeat || repeatDone || repeatSaving || repeatClosed) return false;
    if (repeatMarked.current.has(repeat.id)) { setRepeatDone(true); return false; }
    const attempted = answered(info.answer);
    if (!attempted) revealed = true;
    const level = judgeWritten({ rating: ratingOf[mark], revealed, answer: info.answer, references: repeat.reference, firstVerdict: info.firstVerdict, checkedText: info.checkedText });
    const translation = {
      sentenceId: repeat.id,
      rating: ratingOf[mark],
      grammar: repeat.grammar,
      revealed,
      verified: level === "independent",
      attempted,
    };
    setRepeatSaving(true);
    const blocked: { kind: "day" | "quota" | "card" | null } = { kind: null };
    try {
      const write = attempted ? onSavedActivity : updateStoreNow;
      await write(prev => {
        if (timedReview !== undefined && dayKey() !== date) { blocked.kind = "day"; return prev; }
        if (timedReview !== undefined && attempted) {
          if (reviewLoad(prev, date, energy, timedReview).sentences === 0) { blocked.kind = "quota"; return prev; }
          const card = prev.cards.find(current => current.id === repeat.id);
          if (!card || card.due > date || card.lastDay >= date) { blocked.kind = "card"; return prev; }
        }
        if (!availableSentence(prev.notes, repeat.id)) throw new Error("這張句子卡已在其他地方移除。你的草稿還在。");
        return logSentence(prev, sessionId, date, translation);
      });
      if (blocked.kind) {
        setRepeatNotice(blocked.kind === "day" ? "今天的日期已變更。草稿還在，請重新開啟今日複習。"
          : blocked.kind === "quota" ? "這次安排的句子複習額度已用完。草稿還在。"
          : "這張句子卡已在別處複習或目前未到期。草稿還在，這次沒有計分。");
        if (blocked.kind === "card") setRepeatDone(true); else setRepeatClosed(true);
        return false;
      }
      if (attempted) {
        repeatAnswers.current.set(repeat.id, info.answer);
        repeatMarked.current.add(repeat.id);
      } else setRepeatNotice("這一句已略過，會留在複習卡裡。");
      setRepeatDone(true);
      return attempted;
    } finally { setRepeatSaving(false); }
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
    return learning.map((w, i) => {
      const target = spellingTargets(w, turn + i);
      return { en: target.accept, zh: target.zh, spellingCue: target.cue, key: wordKey(w.en) };
    });
  });
  const [deck] = useState(() => {
    const due = dueCards(
      state.cards.filter((c) => c.id.startsWith("word:")),
      date,
      energy,
    );
    const cards = due.flatMap((c) => {
      const word = lookup.get(wordKey(c.id.slice(5)));
      return word ? [{ id: c.id, word }] : [];
    });
    return cards.slice(0, limit);
  });
  const entry = deck[offset];
  const word = entry?.word;
  // 記得 / 不記得 stay in the same place for the next card: a double tap must not score that one too.
  const wordReady = useTapGuard(offset);
  async function scoreWord(remembered: boolean) {
    if (!entry || wordSaving.current || !wordReady()) return;
    wordSaving.current = true;
    setSavingWord(true);
    setWordError("");
    const outcome: { status: "unavailable" | "limit" | "saved" } = { status: "unavailable" };
    try {
      await onSavedActivity((prev) => {
        const existing = prev.cards.find((card) => card.id === entry.id);
        if (!existing || dayKey() !== date) return prev;
        const { card, event } = reviewCard(existing, date, remembered, see);
        if (!event) return prev;
        if (reviewLoad(prev, date, energy, timedReview).words === 0) {
          outcome.status = "limit";
          return prev;
        }
        outcome.status = "saved";
        return {
          ...prev,
          cards: prev.cards.map((current) => (current.id === entry.id ? card : current)),
          reviewEvents: [...prev.reviewEvents, event],
          notes: remembered && !see ? markSkill(prev.notes, wordKey(entry.word.en), "read", date) : prev.notes,
        };
      });
      setWordNotice(outcome.status === "limit" ? "今天這個複習時段的單字額度已用完。"
        : outcome.status === "unavailable" ? "這張卡已在別處複習或目前未到期。這次沒有重複計分。" : "");
      setOffset(next => outcome.status === "limit" ? deck.length : next + 1);
      setSee(false);
    } catch (error) {
      setWordError(error instanceof Error ? error.message : "這張單字卡還沒儲存，請再試一次。");
    } finally {
      wordSaving.current = false;
      setSavingWord(false);
    }
  }
  // The page shows this one kind of practice and nothing else; the menu (sidebar, or the 英文練習 page) leads to the others.
  return (
    <section className="pr-pane pr-extras" data-mode={mode}>
      {mode === "words" && timedReview === undefined && (() => {
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
      {mode === "words" && wordSkill === "read" && wordNotice && <p role="status">{wordNotice}</p>}
      {mode === "words" && wordSkill === "read" &&
        (word ? (
          <div className="pr-stack">
            <p>
              複習卡 {offset + 1} / {deck.length}
            </p>
            <h3 className="ws-term" lang="en">{word.en}{" "}
              <button type="button" className="ws-mini" aria-label={"聽發音：" + word.en} onClick={() => void speakEnglish(word.en, state.settings.speechRate)}><Volume2 size={16} /></button>
            </h3>
            {see && <p>{word.zh}</p>}
            {see && <HomographNote en={word.en} side="everyday" />}
            <div className="ws-tools"><AskWord en={word.en} zh={see ? word.zh : undefined} label="問問 Claude" />
              <EmmaWordLink en={word.en} zh={word.zh} where="單字複習" part="read" seen={see} others={deck.slice(offset + 1, offset + 6).map((next) => next.word.en)} />
              {see && <UseWord key={word.en} en={word.en} zh={word.zh}
              onGood={() => onActivity((prev) => ({ ...prev, notes: markSkill(prev.notes, wordKey(word.en), "write", date) }))} />}</div>
            <div className="pr-actions">
              <button disabled={savingWord} onClick={() => void scoreWord(true)}>記得</button>
              <button disabled={savingWord} onClick={() => setSee(true)}>看中文意思</button>
              <button disabled={savingWord} onClick={() => void scoreWord(false)}>不記得</button>
            </div>
            {savingWord && <p role="status">正在儲存這張複習卡。</p>}
            {wordError && <p role="alert">{wordError}</p>}
          </div>
        ) : (
          <div className="pr-stack">
            <p>{offset ? "這次的複習卡完成了。" : "今天沒有到期的單字卡。"}</p>
            {load.sentences > 0 && (
              <p>還有 {load.sentences} 句句子卡要複習。{" "}
                <button onClick={() => { location.hash = timedReview === undefined ? "library/translate" : "library/translate/review-" + timedReview + "-" + energy; }}>去中翻英</button>
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
              <div className="pr-actions">
                {listen > 0 && <button className="pr-link" onClick={() => setListen(listen - 1)}>← 上一句</button>}
                <button onClick={() => setListen(listen + 1)}>換一句</button>
              </div>
            )}
          </div>
        ) : (
          <p>完成第一次句子練習後，就能在這裡跟讀舊句。</p>
        ))}
      {mode === "translate" && (
        <div className="pr-stack">
          {repeatNotice && <p role="status">{repeatNotice}</p>}
          {dueSentenceIds.size > 0 && (
            <p className="qz-meta">
              {timedReview !== undefined ? "這次安排 " + translationPool.length + " 句句子卡"
                : sentencesDone < SENTENCE_QUOTA
                ? "句子卡複習：今天 " + sentencesDone + " / " + SENTENCE_QUOTA + " 句" + (load.queued ? "，另有 " + load.queued + " 句排在之後的日子" : "")
                : "今天的 " + SENTENCE_QUOTA + " 句句子卡做完了。想多做可以繼續" + (load.queued ? "，排在後面的 " + load.queued + " 句會早點做到" : "") + "。"}
            </p>
          )}
          {repeatClosed ? <button className="pr-link" onClick={() => { location.hash = "today"; }}>回今日航行</button>
            : repeat ? (
            repeatDone ? (
              repeatIndex + 1 < translationPool.length ? (
                <div className="pr-actions">
                  {!repeatNotice && <p className="ls-help">這一句已記下（第 {repeatIndex + 1} / {translationPool.length} 句）。</p>}
                  {repeatIndex > 0 && <button className="pr-link" onClick={backRepeat}>← 上一句</button>}
                  <button
                    className="pr-main"
                    onClick={() => {
                      setRepeatIndex(repeatIndex + 1);
                      setRepeatDone(false);
                      setRepeatNotice("");
                    }}
                  >
                    下一句 →
                  </button>
                </div>
              ) : (
                <div className="pr-hint">
                  <strong>{timedReview !== undefined ? "這次安排的句子卡已到最後一張" : "這一輪已到最後一句"}</strong>
                  <p>這一輪已記下 {repeatMarked.current.size} 句作答。</p>
                  <div className="pr-actions">
                    {timedReview === undefined && <button className="pr-main" onClick={() => {
                      repeatAnswers.current.clear(); repeatMarked.current.clear();
                      setRepeatIndex(0); setRepeatDone(false);
                    }}>從第一句再來一輪</button>}
                    <button className="pr-link" onClick={() => { location.hash = "library"; }}>回英文練習</button>
                  </div>
                </div>
              )
            ) : (<>
              {repeatIndex > 0 && <button className="pr-link" disabled={repeatSaving} onClick={backRepeat}>← 上一句（你寫的會放回去）</button>}
              <Translation
                key={repeat.id}
                sentence={repeat}
                checkpoint={false}
                initialAnswer={repeatAnswers.current.get(repeat.id)}
                alreadyMarked={repeatMarked.current.has(repeat.id)}
                saved={readHints(state.notes, date)[repeat.id]}
                onHint={use => update(prev => {
                  const previous = readHints(prev.notes, date)[repeat.id];
                  return { ...prev, notes: writeHint(prev.notes, date, repeat.id, previous ? mergeHintUse(previous, use) : use) };
                })}
                onMark={logRepeat}
              />
            </>)
          ) : (
            <p>{timedReview !== undefined ? "這次安排沒有剩下的句子卡。" : "第一次完成句子練習後，就能回來複習。"}</p>
          )}
        </div>
      )}
      {mode === "passage" && (
        <PassageLibrary state={state} update={update} onSavedActivity={onSavedActivity} />
      )}
      {mode === "grammar" && <GrammarHome hash={grammarHash} state={state} onActivity={onActivity} onSavedActivity={onSavedActivity} date={date} />}
      {mode === "theme" && <ThemeReview state={state} onSavedActivity={onSavedActivity} date={date} sessionId={sessionId} />}
      {mode === "story" && <StoryLibrary state={state} update={update} onActivity={onActivity} onSavedActivity={onSavedActivity} date={date} initialTab={storyTab} />}
      {mode === "sound" && <Pronunciation state={state} onSavedActivity={onSavedActivity} update={update} date={date} />}
      {mode === "reading" && <ReadingPath key="reading" state={state} onActivity={onActivity} onSavedActivity={onSavedActivity} date={date} />}
      {mode === "nlisten" && <NursingListen state={state} onSavedActivity={onSavedActivity} date={date} />}
      {mode === "nread" && <ReadingPath key="nursing" set="nursing" state={state} onActivity={onActivity} onSavedActivity={onSavedActivity} date={date} />}
      {mode === "nwords" && <NursingWords state={state} onActivity={onActivity} date={date} />}
      {mode === "writing" && <WritingLadder key={writingTask ?? "ladder"} initialTask={writingTask} state={state} onSavedActivity={onSavedActivity} date={date} />}
      {mode === "unit" && <UnitPack state={state} onActivity={onActivity} onSavedActivity={onSavedActivity} date={date} />}
      {mode === "quiz" && (!quiet || periodQuiet) && (
        <QuizPractice key={examSubject ?? "all"} state={state} update={update} onSavedActivity={onSavedActivity} date={date}
          sections={periodQuiet ? ["nursing"] : undefined} subject={examSubject} />
      )}
      {mode === "case" && (!quiet || periodQuiet) && (
        <ClinicalCase key={examSubject ?? "all"} state={state} onSavedActivity={onSavedActivity} date={date} subject={examSubject} />
      )}
      {mode === "screen" && (quiet ? (
        <p>考週和實習期間單字快篩先暫停，到期的單字卡在「單字複習」。</p>
      ) : (
        <VocabScreen state={state} update={update} navigate={navigate} />
      ))}
    </section>
  );
}
