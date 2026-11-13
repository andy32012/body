import ScenePhoto from "../components/ScenePhoto";
import { useState, type ReactNode } from "react";
import { ChevronLeft, Headphones, Check, PenLine } from "lucide-react";
import curriculum from "../data/curriculum.json";
import sentences from "../data/sentences.json";
import words from "../data/words.json";
import quiz from "../data/quiz.json";
import SpeechPractice from "../components/SpeechPractice";
import type { AppState, PageProps, Session } from "../lib/store";
import {
  activePeriod,
  dayKey,
  dueCards,
  newCard,
  reviewCard,
} from "../lib/progress";
import { isKnownWord, wordKey, officialWords } from "../lib/vocab";
import VocabScreen from "../components/VocabScreen";
import { workloadWords } from "../lib/workloadWords";
import {
  pickRetentionUnit,
  recordRetention,
  retentionDrawCount,
} from "../lib/grammarRetention";
import "./practice.css";

type Word = { en: string; zh: string; example?: string; exampleZh?: string };
type Sentence = {
  id: string;
  zh: string;
  grammar: string[];
  hints: string[];
  reference: string[];
  why: string;
  newWords: Word[];
};
type LessonDay = Sentence & { bonusWords?: Word[]; listening?: Word[] };
type Unit = {
  id: number;
  title: string;
  rule?: string;
  examples?: string[];
  examplesZh?: string[];
  days: LessonDay[];
  checkpoint: Sentence[];
  backup: Sentence[];
};
type Energy = "low" | "normal" | "high";
type Mark = "good" | "small" | "again";
const units: Unit[] = curriculum.units;
const allSentences: Sentence[] = units
  .flatMap((unit) => [...unit.days, ...unit.checkpoint, ...unit.backup])
  .concat(sentences);
const sentenceById = new Map(allSentences.map((s) => [s.id, s]));
const marks: [Mark, string][] = [
  ["good", "對了"],
  ["small", "小錯"],
  ["again", "不會"],
];
const levels = { low: "累爆", normal: "普通", high: "有電" };
const anchor = sentences[0];

export function PracticeCover({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="pr-cover">
      <ScenePhoto className="pr-cover-photo" />
      <div className="pr-cover-copy">{children}<h1>{title}</h1></div>
    </header>
  );
}

function Translation({
  sentence,
  onMark,
  checkpoint,
  preparation,
}: {
  preparation?: ReactNode;
  sentence: Sentence;
  onMark: (mark: Mark, revealed: boolean) => void;
  checkpoint: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState(0);
  const [copied, setCopied] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [seenHint, setSeenHint] = useState(false);
  async function copyAnswer() {
    const value =
      sentence.zh +
      "\n我的答案：" +
      answer +
      "\n參考句：" +
      sentence.reference.join(" / ");
    try {
      await navigator.clipboard.writeText(value);
      setCopied("已複製");
    } catch {
      setManualCopy(value);
      setCopied("請長按選取並複製下方文字。");
    }
  }
  return (
    <>
      <div className="pr-label">{checkpoint ? "單元小關卡" : "一句中翻英"}</div>
      <h2 className="pr-question">{sentence.zh}</h2>
      <div className="pr-tags">
        {sentence.grammar.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      {preparation}
      <label className="pr-field">
        我的英文
        <textarea
          lang="en"
          autoCapitalize="sentences"
          autoComplete="off"
          spellCheck={false}
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="把想到的英文寫在這裡"
        />
      </label>
      {hint === 0 && (
        <div className="pr-actions">
          <button className="pr-main" onClick={() => setHint(1)}>
            我寫好了
          </button>
          <button
            className="pr-link"
            onClick={() => {
              setSeenHint(true);
              setHint(2);
            }}
          >
            我想看提示
          </button>
        </div>
      )}
      {hint >= 1 && (
        <section className="pr-hint">
          <strong>自己檢查看看</strong>
          <p>{sentence.hints[0]}</p>
          {hint >= 2 && <p>{sentence.hints[1] || sentence.why}</p>}
          {hint < 3 && (
            <div className="pr-actions">
              {hint === 1 && (
                <button
                  className="pr-link"
                  onClick={() => {
                    setSeenHint(true);
                    setHint(2);
                  }}
                >
                  再清楚一點
                </button>
              )}
              <button className="pr-link" onClick={() => setHint(3)}>
                看參考句
              </button>
            </div>
          )}
        </section>
      )}
      {hint === 3 && (
        <section className="pr-reference">
          <small>參考句</small>
          {sentence.reference.map((en) => (
            <p lang="en" key={en}>
              {en}
            </p>
          ))}
          <span>{sentence.why}</span>
          {sentence.newWords.length > 0 && (
            <div className="pr-tags">
              {sentence.newWords.map((word) => (
                <span key={word.en}>
                  {word.en} · {word.zh}
                </span>
              ))}
            </div>
          )}
          <button className="pr-link" onClick={copyAnswer}>
            複製這句和我的答案
          </button>
          <small role="status">{copied}</small>
          {manualCopy && (
            <textarea
              aria-label="可複製的答案"
              readOnly
              value={manualCopy}
              onFocus={(e) => e.target.select()}
            />
          )}
        </section>
      )}
      {hint >= 1 && (
        <fieldset className="pr-marks">
          <legend>我的自評</legend>
          {marks.map(([mark, label]) => (
            <button
              key={mark}
              onClick={() => onMark(mark, seenHint || hint === 3)}
            >
              {label}
            </button>
          ))}
        </fieldset>
      )}
    </>
  );
}

function lesson(state: AppState, energy: Energy, date: string) {
  const cursor = state.curriculum;
  const unit =
    units.find((u) => u.id === cursor.unit) ?? units[units.length - 1];
  const index = Math.min(6, Math.max(1, cursor.day));
  const entry = unit.days[index - 1];
  const retry = cursor.retry > 0;
  const advancedToday = state.sessions.some(
    (s) => s.day === date && (s.advanced ?? s.energy !== "low"),
  );
  const period = activePeriod(date, state.settings.periods);
  const quiet = period === "exam" || period === "internship";
  const review =
    quiet || energy==="low" || cursor.unit > units.length || advancedToday;
  const checkpoint = index === 6 && !review;
  const completed = state.sessions
    .flatMap((s) => s.translations?.map((t) => t.sentenceId) ?? [s.sentenceId])
    .filter(Boolean);
  const due = dueCards(
    state.cards.filter((card) => sentenceById.has(card.id)),
    date,
    energy,
  )[0];
  const previous = sentenceById.get(due?.id ?? completed.at(-1) ?? "");
  const items = review
    ? [previous ?? anchor]
    : checkpoint
      ? retry
        ? unit.backup.slice(-3)
        : unit.checkpoint
      : retry && index >= 4
        ? [unit.backup[index - 4] ?? entry]
        : [entry];
  const previousPair = [...new Set(completed)]
    .reverse()
    .flatMap((id) => sentenceById.get(id) ?? [])
    .slice(0, 2);
  const vacation = activePeriod(date, state.settings.periods) === "vacation";
  const proposed =
    vacation && energy === "high"
      ? [...entry.newWords, ...(entry.bonusWords ?? [])]
      : entry.newWords;
  const base = proposed.filter((w) => !isKnownWord(w.en, state.knownWords));
  const added = review || checkpoint ? [] : workloadWords(state, base);
  const vocabulary = review || checkpoint ? [] : [...base, ...added];
  return {
    unit: unit.id,
    day: index,
    title: review ? "熟悉的一句" : unit.title,
    zh: review && !previous ? "用自己記得的一句英文複習。" : items[0].zh,
    newWords: vocabulary,
    review,
    checkpoint,
    items,
    added,
    rule: unit.rule,
    examples: unit.examples ?? [],
    examplesZh: unit.examplesZh ?? [],
    listening: entry.listening ?? [],
    earlier: unit.days.slice(0, 2),
    previousPair,
    vacation,
    freshReview: review && !previous,
  };
}

export function getLessonPreview(
  state: AppState,
  energy: Energy,
  date = dayKey(),
) {
  return lesson(state, energy, date);
}

type TranslationRecord = NonNullable<Session["translations"]>[number];
const ratingOf = { good: "correct", small: "minor", again: "again" } as const;
function PracticeSession({
  state,
  update,
  navigate,
  energy: requested,
}: PageProps & { energy: Energy }) {
  const [date] = useState(() => dayKey());
  const [period] = useState(() => activePeriod(date, state.settings.periods));
  const energy =
    period === "exam" || period === "internship" ? "low" : requested;
  const [current] = useState(() => lesson(state, energy, date));
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<"write" | "sound" | "done">("write");
  const [records, setRecords] = useState<TranslationRecord[]>([]);
  const [spoken, setSpoken] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Session["feedback"]>();
  const [sessionId] = useState(
    () =>
      globalThis.crypto?.randomUUID?.() ??
      Date.now() + "-" + Math.random().toString(36).slice(2),
  );
  const [extra, setExtra] = useState(false);
  const [recalls, setRecalls] = useState<TranslationRecord[]>([]);
  const [retention] = useState(() => {
    const id = pickRetentionUnit(
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
  const item = current.items[pos];
  function mark(value: Mark, revealed: boolean) {
    setRecords([
      ...records,
      {
        sentenceId: item.id,
        rating: ratingOf[value],
        grammar: item.grammar,
        revealed,
      },
    ]);
    setPhase("sound");
  }
  function finish(skip = false) {
    const results = skip ? [] : [...recalls, ...records];
    const drawn =
      retention && recalls.find((t) => t.sentenceId === retention.sentence.id);
    const success = records.filter((t) => t.rating === "correct").length >= 2;
    update((prev) => {
      if (prev.sessions.some((s) => s.id === sessionId)) return prev;
      const cards = [...prev.cards];
      const events = [...prev.reviewEvents];
      function addCard(id: string, remembered: boolean, shown: boolean) {
        const i = cards.findIndex((card) => card.id === id);
        if (i === -1) cards.push(newCard(id, date));
        else {
          const { card, event } = reviewCard(cards[i], date, remembered, shown);
          cards[i] = card;
          if (event) events.push(event);
        }
      }
      results.forEach((t) =>
        addCard(t.sentenceId, t.rating === "correct", t.revealed),
      );
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
        notes:
          drawn && retention
            ? recordRetention(
                prev.notes,
                retention.unit,
                current.unit,
                drawn.rating,
                drawn.revealed,
              )
            : prev.notes,
        learningWords: [...new Set([...prev.learningWords, ...learned])],
      };
    });
    setPhase("done");
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
      <PracticeCover title={levels[energy] + "練習"}>
        <button type="button" className="pr-back" onClick={() => navigate("today")}>
          <ChevronLeft size={16} aria-hidden="true"/>回今天
        </button>
      </PracticeCover>
      <div className="pr-pane pr-session" data-phase={phase}>
        <div className="pr-session-meta">
          <span className="pr-stage-icon" aria-hidden="true">
            {phase === "write" ? <PenLine size={17}/> : phase === "sound" ? <Headphones size={17}/> : <Check size={17}/>}
          </span>
          <span>{current.review ? "舊句複習" : "單元 " + current.unit + " · 第 " + current.day + " 天"}</span>
          {phase !== "done" && current.checkpoint && <span className="pr-item-index">{pos + 1} / {current.items.length}</span>}
        </div>
        {phase === "write" && (
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
            {!current.review && current.day === 5 && (
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
                      onMark={(mark, revealed) =>
                        setRecalls([
                          ...recalls,
                          {
                            sentenceId: recall.sentence.id,
                            rating: ratingOf[mark],
                            grammar: recall.sentence.grammar,
                            revealed,
                          },
                        ])
                      }
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
                preparation={!current.review && current.day === 1 && current.rule && (
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
                )}
                onMark={mark}
              />
            )}
          </>
        )}
        {phase === "sound" && (
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
                    setPos(pos + 1);
                    setPhase("write");
                  }}
                >
                  下一句
                </button>
              ) : (
                <button className="pr-main" onClick={() => finish()}>
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
            {current.checkpoint && (
              <p>
                {records.filter((t) => t.rating === "correct").length >= 2
                  ? "這個單元穩了。下次從下一站接著練。"
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
                    </strong>
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
              {!extra && (
                <button onClick={() => setExtra(true)}>再多做一點</button>
              )}
            </div>
          </>
        )}
      </div>
      {phase === "done" && extra && (
        <Extras
          state={state}
          update={update}
          navigate={navigate}
          energy={energy}
          sessionId={sessionId}
          date={date}
        />
      )}
    </section>
  );
}
export default PracticeSession;

export function PracticeLibrary({ state, update, navigate }: PageProps) {
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
        key={today + period}
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
  state,
  update,
  navigate,
  energy,
  date,
  sessionId,
  onActivity = update,
}: PageProps & {
  energy: Energy;
  date: string;
  sessionId: string;
  onActivity?: PageProps["update"];
}) {
  const [mode, setMode] = useState<
    "words" | "listen" | "quiz" | "screen" | "translate"
  >("words");
  const [limit] = useState(() => {
    const reviewed = new Set(
      state.reviewEvents
        .filter((e) => e.day === date && e.id.startsWith("word:"))
        .map((e) => e.id),
    );
    return Math.max(0, { low: 1, normal: 5, high: 10 }[energy] - reviewed.size);
  });
  const [offset, setOffset] = useState(0);
  const [see, setSee] = useState(false);
  const [picked, setPicked] = useState<number>();
  const [listen, setListen] = useState(0);
  const quiet =
    energy === "low" ||
    ["exam", "internship"].includes(activePeriod(date, state.settings.periods));
  const familiar = state.sessions.flatMap(
    (s) => s.translations?.map((t) => t.sentenceId) ?? [s.sentenceId],
  );
  const listeningPool =
    quiet
      ? allSentences.filter((s) => familiar.includes(s.id))
      : sentences;
  const [repeatIndex, setRepeatIndex] = useState(0);
  const [repeatDone, setRepeatDone] = useState(false);
  const [translationPool] = useState(() => {
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
    return ids.flatMap((id) => sentenceById.get(id) ?? []);
  });
  const repeat = translationPool[repeatIndex];
  function logRepeat(mark: Mark, revealed: boolean) {
    if (!repeat || repeatDone) return;
    const translation = {
      sentenceId: repeat.id,
      rating: ratingOf[mark],
      grammar: repeat.grammar,
      revealed,
    };
    onActivity((prev) => {
      const found = prev.cards.find((c) => c.id === repeat.id);
      const result = found
        ? reviewCard(found, date, mark === "good", revealed)
        : null;
      const cards = result
        ? prev.cards.map((c) => (c.id === repeat.id ? result.card : c))
        : [...prev.cards, newCard(repeat.id, date)];
      return {
        ...prev,
        cards,
        reviewEvents: result?.event
          ? [...prev.reviewEvents, result.event]
          : prev.reviewEvents,
        sessions: prev.sessions.map((s) =>
          s.id === sessionId
            ? { ...s, translations: [...(s.translations ?? []), translation] }
            : s,
        ),
      };
    });
    setRepeatDone(true);
  }
  const listening = listeningPool[listen % Math.max(1, listeningPool.length)];
  const [deck] = useState(() => {
    const lookup = new Map<string, Word>();
    for (const w of [
      ...officialWords,
      ...words,
      ...allSentences.flatMap((s) => s.newWords),
      ...state.customWords,
    ])
      lookup.set(wordKey(w.en), w);
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
  const [quizIndex, setQuizIndex] = useState(0);
  const question = quiz[quizIndex % quiz.length];
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
      };
    });
    setOffset(offset + 1);
    setSee(false);
  }
  return (
    <section className="pr-pane pr-extras">
      <h2>自選加練</h2>
      <div className="pr-options">
        {(
          [
            ["words", "單字複習"],
            ["listen", "句子跟讀"],
            ["translate", "中翻英"],
            ["quiz", "選擇題"],
            ["screen", "單字快篩"],
          ] as const
        )
          .filter(
            ([key]) =>
              !quiet ||
              key === "listen" ||
              key === "words" ||
              key === "translate",
          )
          .map(([key, label]) => (
            <button
              key={key}
              aria-pressed={key === mode}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
      </div>
      {mode === "words" &&
        (word ? (
          <div className="pr-stack">
            <p>
              複習卡 {offset + 1} / {deck.length}
            </p>
            <h3 lang="en">{word.en}</h3>
            {see && <p>{word.zh}</p>}
            <div className="pr-actions">
              <button onClick={() => scoreWord(true)}>記得</button>
              <button onClick={() => setSee(true)}>看中文意思</button>
              <button onClick={() => scoreWord(false)}>不記得</button>
            </div>
          </div>
        ) : (
          <p>{offset ? "這次的複習卡完成了。" : "今天沒有到期的單字卡。"}</p>
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
                onMark={logRepeat}
              />
            )
          ) : (
            <p>第一次完成句子練習後，就能回來複習。</p>
          )}
        </div>
      )}
      {mode === "quiz" && !quiet && (
        <div className="pr-stack">
          <small>
            第 {(quizIndex % quiz.length) + 1} / {quiz.length} 題
          </small>
          <h3 lang="en">{question.en}</h3>
          <p>{question.zh}</p>
          <div className="pr-options">
            {question.options.map((label, i) => (
              <button
                key={label}
                disabled={picked !== undefined}
                aria-pressed={i === picked}
                onClick={() => {
                  setPicked(i);
                  onActivity((prev) => prev);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {picked !== undefined && (
            <div className="pr-hint">
              <strong>
                {picked === question.answerIndex
                  ? "答對了"
                  : "這題的答案是「" +
                    question.options[question.answerIndex] +
                    "」"}
              </strong>
              <p>{question.explanation}</p>
              {question.source && (
                <a href={question.source} target="_blank" rel="noreferrer">
                  查看資料來源
                </a>
              )}
              <div>
                <button
                  onClick={() => {
                    setQuizIndex(quizIndex + 1);
                    setPicked(undefined);
                  }}
                >
                  下一題
                </button>
              </div>
            </div>
          )}
          <button
            className="pr-link"
            disabled={state.flagged.includes(question.id)}
            onClick={() =>
              update((prev) => ({
                ...prev,
                flagged: [...new Set([...prev.flagged, question.id])],
              }))
            }
          >
            {state.flagged.includes(question.id)
              ? "已記到設定頁"
              : "這題怪怪的"}
          </button>
        </div>
      )}
      {mode === "screen" && !quiet && (
        <VocabScreen state={state} update={update} navigate={navigate} />
      )}
    </section>
  );
}
