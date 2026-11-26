import curriculum from "../data/curriculum.json";
import sentences from "../data/sentences.json";
import starters from "../data/starters.json";
import type { AppState } from "./store";
import { activePeriod, dayKey, dueCards, reviewEnergy, reviewLoad, type Energy } from "./progress";
import { isKnownWord } from "./vocab";
import { workloadWords } from "./workloadWords";
import { readSayCard, sayCardSentence } from "./sayCards";
import { unitGate } from "./cefr";
import { topics } from "./topics";
import type { LessonRecord } from "./lesson";

/** Today's lesson, built from the course position: which sentence or checkpoint, its new words, or a review day. */
export type Word = { en: string; zh: string; example?: string; exampleZh?: string };
export type Sentence = {
  id: string;
  zh: string;
  grammar: string[];
  hints: string[];
  reference: string[];
  why: string;
  newWords: Word[];
};
export type LessonDay = Sentence & { bonusWords?: Word[]; listening?: Word[] };
export type Unit = {
  id: number;
  title: string;
  rule?: string;
  examples?: string[];
  examplesZh?: string[];
  cando?: string;
  days: LessonDay[];
  checkpoint: Sentence[];
  backup: Sentence[];
};
export const units: Unit[] = curriculum.units;
export const allSentences: Sentence[] = units
  .flatMap((unit) => [...unit.days, ...unit.checkpoint, ...unit.backup])
  .concat(sentences)
  .concat(starters)
  .concat(topics.flatMap((t) => [...t.practice, ...t.review.practice]));
export const sentenceById = new Map(allSentences.map((s) => [s.id, s]));
/** Sentences saved from Emma, passages or lessons live in state.notes as "say.<id>". */
export function syncCustom(notes: Record<string, string>) {
  for (const id of sentenceById.keys()) if (id.startsWith("say-")) sentenceById.delete(id);
  for (const [k, v] of Object.entries(notes)) {
    if (!k.startsWith("say.")) continue;
    const d = readSayCard(v);
    if (d) sentenceById.set(k.slice(4), sayCardSentence(k.slice(4), d));
  }
}
const anchor = sentences[0];

type LessonPosition = Pick<LessonRecord, 'unit' | 'day' | 'retry' | 'sentenceId' | 'records' | 'hints'>;

export function lessonSentence(unit: Unit, day: number, retry: number, saved?: LessonPosition): Sentence {
  const original = unit.days[day - 1];
  const alternate = day >= 4 ? unit.backup[day - 4] : undefined;
  if (!alternate) return original;
  const candidates = [original, alternate];
  const attempted = saved?.records?.find(record => candidates.some(c => c.id === record.sentenceId));
  const hinted = candidates.filter(sentence => saved?.hints?.[sentence.id]);
  const savedId = saved?.sentenceId ?? attempted?.sentenceId ?? (hinted.length === 1 ? hinted[0].id : undefined);
  return candidates.find(sentence => sentence.id === savedId) ?? (retry > 0 ? alternate : original);
}

/** `at` continues a lesson that was already started (its core may be saved and the curriculum moved on). */
export function lesson(state: AppState, energy: Energy, date: string, at?: LessonPosition) {
  syncCustom(state.notes);
  const cursor = at ?? state.curriculum;
  const unit =
    units.find((u) => u.id === cursor.unit) ?? units[units.length - 1];
  const index = Math.min(6, Math.max(1, cursor.day));
  const entry = unit.days[index - 1];
  const retry = cursor.retry ?? (cursor.unit === state.curriculum.unit ? state.curriculum.retry : 0);
  const advancedToday = state.sessions.some(
    (s) => s.day === date && (s.advanced ?? s.energy !== "low"),
  );
  const period = activePeriod(date, state.settings.periods);
  const quiet = period === "exam" || period === "internship";
  // The next level's units wait for the certificate before them (passed, or at least booked).
  const gate = at ? null : unitGate(state.notes, cursor.unit);
  const review =
    !at && (quiet || energy==="low" || cursor.unit > units.length || advancedToday || !!gate);
  const checkpoint = index === 6 && !review;
  const completed = state.sessions
    .flatMap((s) => s.translations?.map((t) => t.sentenceId) ?? [s.sentenceId])
    .filter(Boolean);
  const due = dueCards(
    state.cards.filter((card) => sentenceById.has(card.id)),
    date,
    energy,
  )[0];
  // With nothing to review yet, hand over a ready everyday sentence instead of asking for one.
  const starter = starters[Number(date.replace(/-/g, "")) % starters.length] as Sentence;
  const previous = sentenceById.get(due?.id ?? completed.at(-1) ?? "") ?? (review ? starter : undefined);
  const items = review
    ? [previous ?? anchor]
    : checkpoint
      ? retry > 0
        ? unit.backup.slice(-3)
        : unit.checkpoint
      : [lessonSentence(unit, index, retry, at)];
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
  // Same brake as the daily words: only word cards piling up past today's review hold back the extra words.
  const busyReview = reviewLoad(state, date, reviewEnergy(date, state.settings.periods)).backlog > 30;
  const added = review || checkpoint || busyReview ? [] : workloadWords(state, base);
  const vocabulary = review || checkpoint ? [] : [...base, ...added];
  return {
    unit: unit.id,
    day: index,
    retry,
    title: review ? "今天只練這一句" : unit.title,
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
    previousDay: index > 1 ? unit.days[index - 2] : undefined,
    cando: unit.cando ?? "",
    previousPair,
    vacation,
    freshReview: review && !previous,
    gate,
    /** Every written unit is done: the days go to review, words and the four skills (see the month plan). */
    done: !at && cursor.unit > units.length,
  };
}

export function getLessonPreview(
  state: AppState,
  energy: Energy,
  date = dayKey(),
  at?: LessonPosition,
) {
  return lesson(state, energy, date, at);
}
