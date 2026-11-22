import type { AppState } from "./store";

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
