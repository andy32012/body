import type { AppState } from "./store";
import { addDays } from "./progress";

type Notes = AppState["notes"];
const key = (unit: number, field: string) =>
  "grammar-retention." + unit + "." + field;
const value = (notes: Notes, unit: number, field: string) =>
  Number(notes[key(unit, field)]) || 0;

export function getRetentionStatus(notes: Notes, unit: number) {
  return value(notes, unit, "misses") >= 2 ? "還常錯" : "穩了";
}

export function pickRetentionUnit(
  stable: readonly number[],
  current: number,
  notes: Notes,
) {
  const due = stable.filter((unit) => {
    const last = value(notes, unit, "lastUnit") || unit;
    const interval = value(notes, unit, "misses") > 0 ? 1 : 3;
    return current >= last + interval;
  });
  return due.sort(
    (a, b) =>
      value(notes, b, "misses") - value(notes, a, "misses") ||
      (value(notes, a, "lastUnit") || a) - (value(notes, b, "lastUnit") || b),
  )[0];
}

export const retentionDrawCount = (notes: Notes, unit: number) =>
  value(notes, unit, "draws");

/** A recheck only clears earlier misses when the answer was written alone and checked (`verified`).
 *  A self-marked "correct" nobody checked, or one written after seeing hints, leaves the count as it was. */
export function recordRetention(
  notes: Notes,
  unit: number,
  current: number,
  rating: "correct" | "minor" | "again",
  revealed: boolean,
  verified = false,
) {
  return {
    ...notes,
    [key(unit, "draws")]: String(value(notes, unit, "draws") + 1),
    [key(unit, "lastUnit")]: String(current),
    [key(unit, "misses")]: String(
      rating === "correct"
        ? revealed || !verified
          ? value(notes, unit, "misses")
          : 0
        : value(notes, unit, "misses") + 1,
    ),
  };
}
/** 「穩了」 from a later recheck: only an answer written alone and checked, never a blank or self-marked one. */
export const recheckMakesStable = (drawn: { rating: string; revealed: boolean; verified?: boolean } | undefined) =>
  !!drawn && drawn.rating === "correct" && !drawn.revealed && drawn.verified === true;

/** Units finished with help (hint or answer seen) wait here until an unaided recheck. */
const assistedKey = (unit: number) => "unit-assisted." + unit;
export const assistedUnits = (notes: Notes) =>
  Object.keys(notes)
    .filter((k) => k.startsWith("unit-assisted."))
    .map((k) => Number(k.slice("unit-assisted.".length)))
    .filter((n) => n > 0);
export function markAssisted(notes: Notes, unit: number, day: string): Notes {
  return { ...notes, [assistedKey(unit)]: day };
}
export function clearAssisted(notes: Notes, unit: number): Notes {
  const next = { ...notes };
  delete next[assistedKey(unit)];
  return next;
}
/** Checkpoint outcome: finished (move on) and independent (counts as stable).
 *  "Independent" needs an answer that was actually checked (exact match or Claude's first verdict):
 *  a self-marked "correct" nobody verified, or a blank answer, finishes the unit but never makes it stable. */
export function checkpointOutcome(records: readonly { rating: string; revealed: boolean; verified?: boolean }[]) {
  const correct = records.filter((t) => t.rating === "correct");
  return {
    finished: correct.length >= 2,
    independent: correct.filter((t) => !t.revealed && t.verified === true).length >= 2,
  };
}

type Rating = "correct" | "minor" | "again";
export type StarLabel = "穩了" | "還常錯" | "練習中";
interface StarTry { day: string; sentenceId: string; rating: Rating; revealed: boolean; verified: boolean }
/** 文法星圖 from the translations he wrote. 穩了: the latest answer for that grammar point was written alone and checked
 *  (Claude's first check or the exact reference), and another sentence with the same point was too, at least four days
 *  earlier — the same sentence twice is remembering a sentence, not the rule. 還常錯: the last two answers were not right. */
export function grammarStars(sessions: readonly { day: string; translations?: readonly { sentenceId: string; rating: Rating; grammar: readonly string[]; revealed: boolean; verified?: boolean; attempted?: boolean }[] }[]) {
  const logs = [...sessions].sort((a, b) => a.day.localeCompare(b.day));
  const history = new Map<string, StarTry[]>();
  const counts: Record<Rating, number> = { correct: 0, minor: 0, again: 0 };
  for (const session of logs)
    for (const t of session.translations ?? []) {
      if (t.attempted === false) continue;
      counts[t.rating]++;
      for (const tag of new Set(t.grammar))
        history.set(tag, [...history.get(tag) ?? [], { day: session.day, sentenceId: t.sentenceId, rating: t.rating, revealed: t.revealed, verified: t.verified === true }]);
    }
  const alone = (e: StarTry) => e.rating === "correct" && !e.revealed && e.verified;
  const stars: Record<StarLabel, string[]> = { "穩了": [], "還常錯": [], "練習中": [] };
  history.forEach((entries, tag) => {
    const latest = entries[entries.length - 1];
    const lastTwo = entries.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every(e => e.rating !== "correct")) stars["還常錯"].push(tag);
    else if (alone(latest) && entries.some(e => alone(e) && e.sentenceId !== latest.sentenceId && e.day <= addDays(latest.day, -4))) stars["穩了"].push(tag);
    else stars["練習中"].push(tag);
  });
  return { stars, counts, practised: history.size };
}
