import test from "node:test";
import assert from "node:assert/strict";
import {
  getRetentionStatus,
  pickRetentionUnit,
  recheckMakesStable,
  recordRetention,
} from "../src/lib/grammarRetention.ts";

test("第三個後續單元重抽，一次只安排一個已穩單元", () => {
  assert.equal(pickRetentionUnit([1, 2], 3, {}), undefined);
  assert.equal(pickRetentionUnit([1, 2], 4, {}), 1);
  const notes = recordRetention({}, 1, 4, "correct", false, true);
  assert.equal(pickRetentionUnit([1, 2], 5, notes), 2);
  assert.equal(pickRetentionUnit([1], 6, notes), undefined);
});
test("抽查連續兩次未能自行答出，優先練習，獨立答對後恢復", () => {
  let notes = recordRetention({}, 1, 4, "minor", false);
  assert.equal(pickRetentionUnit([1, 2], 5, notes), 1);
  notes = recordRetention(notes, 1, 5, "again", false);
  assert.equal(getRetentionStatus(notes, 1), "還常錯");
  assert.equal(pickRetentionUnit([1], 5, notes), undefined);
  // A self-marked "correct" nobody checked does not clear the misses…
  notes = recordRetention(notes, 1, 6, "correct", false);
  assert.equal(getRetentionStatus(notes, 1), "還常錯");
  // …an answer written alone and checked does.
  notes = recordRetention(notes, 1, 7, "correct", false, true);
  assert.equal(getRetentionStatus(notes, 1), "穩了");
});
test("後續回想：空白、看過提示或沒人確認的「對了」都不能升成穩了", () => {
  assert.equal(recheckMakesStable({ rating: "correct", revealed: false, verified: true }), true);
  assert.equal(recheckMakesStable({ rating: "correct", revealed: false }), false);
  assert.equal(recheckMakesStable({ rating: "correct", revealed: false, verified: false }), false);
  assert.equal(recheckMakesStable({ rating: "correct", revealed: true, verified: true }), false);
  assert.equal(recheckMakesStable(undefined), false);
});

// R032: 穩了 needs two checked, unaided answers at least four days apart on different sentences.
test("the grammar star map needs another sentence, not the same one twice", async () => {
  const { grammarStars } = await import("../src/lib/grammarRetention.ts");
  const t = (day: string, sentenceId: string, rating: "correct" | "minor" | "again" = "correct") =>
    ({ day, translations: [{ sentenceId, rating, grammar: ["be 動詞"], revealed: false, verified: true }] });
  // The same sentence twice, five days apart: still practising.
  assert.deepEqual(grammarStars([t("2026-11-26", "s-001"), t("2026-11-21", "s-001")]).stars["練習中"], ["be 動詞"]);
  // Another sentence four days later, written alone and checked: 穩了.
  assert.deepEqual(grammarStars([t("2026-11-21", "s-001"), t("2026-11-25", "s-002")]).stars["穩了"], ["be 動詞"]);
  // Too close together, or not checked, or with the answer seen: not yet.
  assert.deepEqual(grammarStars([t("2026-11-21", "s-001"), t("2026-11-24", "s-002")]).stars["練習中"], ["be 動詞"]);
  const unchecked = { day: "2026-11-25", translations: [{ sentenceId: "s-002", rating: "correct" as const, grammar: ["be 動詞"], revealed: false }] };
  assert.deepEqual(grammarStars([t("2026-11-21", "s-001"), unchecked]).stars["練習中"], ["be 動詞"]);
  // The last two wrong: 還常錯 (unchanged rule), and the counts per rating stay.
  const wrong = grammarStars([t("2026-11-21", "s-001", "again"), t("2026-11-22", "s-002", "minor")]);
  assert.deepEqual(wrong.stars["還常錯"], ["be 動詞"]);
  assert.deepEqual(wrong.counts, { correct: 0, minor: 1, again: 1 });
});
