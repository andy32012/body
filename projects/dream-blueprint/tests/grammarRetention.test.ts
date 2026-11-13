import test from "node:test";
import assert from "node:assert/strict";
import {
  getRetentionStatus,
  pickRetentionUnit,
  recordRetention,
} from "../src/lib/grammarRetention.ts";

test("第三個後續單元重抽，一次只安排一個已穩單元", () => {
  assert.equal(pickRetentionUnit([1, 2], 3, {}), undefined);
  assert.equal(pickRetentionUnit([1, 2], 4, {}), 1);
  const notes = recordRetention({}, 1, 4, "correct", false);
  assert.equal(pickRetentionUnit([1, 2], 5, notes), 2);
  assert.equal(pickRetentionUnit([1], 6, notes), undefined);
});
test("抽查連續兩次未能自行答出，優先練習，獨立答對後恢復", () => {
  let notes = recordRetention({}, 1, 4, "minor", false);
  assert.equal(pickRetentionUnit([1, 2], 5, notes), 1);
  notes = recordRetention(notes, 1, 5, "again", false);
  assert.equal(getRetentionStatus(notes, 1), "還常錯");
  assert.equal(pickRetentionUnit([1], 5, notes), undefined);
  notes = recordRetention(notes, 1, 6, "correct", false);
  assert.equal(getRetentionStatus(notes, 1), "穩了");
});
