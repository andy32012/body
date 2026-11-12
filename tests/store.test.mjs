import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../learning/store.js', import.meta.url), 'utf8');
const { createStore, STORAGE_KEY, localDateKey } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const catalog = {
  lessonIds: ['ja-01', 'ja-02', 'ko-01'],
  wordIds: ['ja-w001', 'ja-w002', 'ja-w003', 'ko-w001', 'ko-w002'],
  questionIds: ['ja-01-q1', 'ja-01-q2', 'ja-01-q3', 'ja-02-q1', 'ko-01-q1'],
};

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

function fixture(start = new Date(2026, 10, 12, 12, 0)) {
  let date = new Date(start);
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => date, catalog });
  return { store, storage, setDate: (value) => { date = new Date(value); } };
}

function passLesson(store) {
  store.visitLesson('ja-01');
  ['ja-01-q1', 'ja-01-q2', 'ja-01-q3'].forEach((id) => store.answerQuestion('ja-01', id, true));
  return store.completeLesson('ja-01', 3, 3);
}

test('new learner has real zero progress and visits alone do not create a streak', () => {
  const { store } = fixture();
  assert.deepEqual(store.getStats(), { completed: 0, totalSeconds: 0, todaySeconds: 0, streak: 0, attempts: 0, correct: 0, accuracy: 0, reviewedToday: 0, masteredWords: 0 });
  store.visitLesson('ja-01');
  assert.equal(store.getState().lastLesson, 'ja-01');
  assert.equal(store.getStats().streak, 0);
  assert.equal(store.getStats().completed, 0);
});

test('completion requires checked answers, passes at 80%, and is idempotent', () => {
  const { store, setDate } = fixture();
  assert.equal(store.completeLesson('ja-01', 3, 3).ok, false);
  store.answerQuestion('ja-01', 'ja-01-q1', true);
  assert.equal(store.completeLesson('ja-01', 1, 1).ok, false, 'cannot call one answered question the whole course');
  store.answerQuestion('ja-01', 'ja-01-q2', true);
  store.answerQuestion('ja-01', 'ja-01-q3', false);
  assert.equal(store.completeLesson('ja-01', 3, 3).ok, false, 'cannot invent a correct answer');
  assert.equal(store.completeLesson('ja-01', 2, 3).ok, false);
  store.answerQuestion('ja-01', 'ja-01-q3', true);
  assert.equal(store.completeLesson('ja-01', 3, 3).ok, true);
  const firstCompletion = store.getState().lessons['ja-01'].completedAt;
  setDate(new Date(2026, 10, 13, 12));
  assert.equal(store.completeLesson('ja-01', 3, 3).alreadyCompleted, true);
  assert.equal(store.getState().lessons['ja-01'].completedAt, firstCompletion);
  assert.equal(store.getStats().completed, 1);
  assert.equal(Object.values(store.getState().days).flatMap((day) => day.completedLessons).length, 1);
  assert.equal(store.getStats().attempts, 4);
  assert.equal(store.getStats().accuracy, 75);
});

test('a later unsuccessful retry preserves the completed lesson and best result', () => {
  const { store } = fixture();
  passLesson(store);
  store.answerQuestion('ja-01', 'ja-01-q3', false);
  assert.equal(store.completeLesson('ja-01', 2, 3).ok, false);
  assert.equal(store.getState().lessons['ja-01'].bestScore, 3);
  assert.equal(store.getStats().completed, 1);
});

test('SRS advances only on due reviews and records real daily word counts', () => {
  const { store, setDate } = fixture();
  const first = store.reviewWord('ja-w001', 'good');
  assert.equal(first.stage, 1);
  assert.equal(localDateKey(first.dueAt), '2026-11-13');
  store.reviewWord('ja-w001', 'good');
  assert.equal(store.getState().words['ja-w001'].stage, 1, 'early repeated clicks do not increase mastery');
  assert.equal(store.getStats().reviewedToday, 1);
  assert.deepEqual(store.getDueWords(), []);
  setDate(new Date(2026, 10, 13, 12));
  assert.deepEqual(store.getDueWords(), ['ja-w001']);
  assert.equal(store.reviewWord('ja-w001', 'good').stage, 2);
  setDate(new Date(2026, 10, 16, 12));
  const third = store.reviewWord('ja-w001', 'good');
  assert.equal(third.stage, 3);
  assert.equal(localDateKey(third.dueAt), '2026-11-23');
  assert.equal(store.getStats().masteredWords, 1);
  const hard = store.reviewWord('ja-w001', 'hard');
  assert.equal(hard.stage, 1);
  assert.equal(localDateKey(hard.dueAt), '2026-11-17');
  const again = store.reviewWord('ja-w001', 'again');
  assert.equal(again.stage, 0);
  assert.equal(new Date(again.dueAt).getTime() - new Date(2026, 10, 16, 12).getTime(), 600000);
  assert.equal(store.getStats().masteredWords, 0);
});

test('study time is bounded and invalid time cannot inflate progress', () => {
  const { store } = fixture();
  store.addStudySeconds(14.6);
  store.addStudySeconds(10000);
  [-1, 0, NaN, Infinity, '12'].forEach((seconds) => store.addStudySeconds(seconds));
  assert.equal(store.getStats().todaySeconds, 75);
  assert.equal(store.setGoal(20), true);
  assert.equal(store.setGoal(9999), false);
  assert.equal(store.getState().goalMinutes, 20);
});

test('streak respects local dates, yesterday grace, and calendar boundaries', () => {
  const { store, setDate } = fixture(new Date(2026, 9, 31, 23, 59));
  store.addStudySeconds(30);
  setDate(new Date(2026, 10, 1, 0, 1));
  store.addStudySeconds(30);
  assert.equal(store.getStats().streak, 2);
  setDate(new Date(2026, 10, 2, 12));
  assert.equal(store.getStats().streak, 2, 'yesterday remains a current streak until today ends');
  assert.equal(store.getStats().todaySeconds, 0);
  setDate(new Date(2026, 10, 3, 12));
  assert.equal(store.getStats().streak, 0);
  assert.equal(store.getStats().totalSeconds, 60);
});

test('daily selection is stable, unique, allowlisted, and does not mutate input', () => {
  const { store } = fixture();
  const ids = [...catalog.wordIds, 'ja-w001', 'unknown', '__proto__'];
  const original = [...ids];
  const first = store.getDailySelection(ids, 3, 'ja');
  assert.deepEqual(first, store.getDailySelection(ids, 3, 'ja'));
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  assert(first.every((id) => catalog.wordIds.includes(id)));
  assert.deepEqual(ids, original);
  assert.equal(store.getDailySelection(ids, 99).length, catalog.wordIds.length);
});

test('backup round trip restores records, favorites and preferences', () => {
  const { store } = fixture();
  passLesson(store);
  store.reviewWord('ko-w001', 'good');
  store.addStudySeconds(30);
  store.toggleFavoriteLesson('ja-01');
  store.toggleFavoriteWord('ko-w001');
  store.setGoal(30);
  const restored = fixture().store;
  assert.deepEqual(restored.importData(store.exportData()), { ok: true, persisted: true });
  assert.deepEqual(restored.getState(), store.getState());
});

test('invalid imports reject atomically, including unknown IDs and prototype pollution', () => {
  const { store } = fixture();
  passLesson(store);
  const before = store.getState();
  const bad = JSON.parse(store.exportData());
  bad.state.favoriteWords.push('ja-unknown');
  assert.equal(store.importData(JSON.stringify(bad)).ok, false);
  const polluted = store.exportData().replace('"state": {', '"state": { "__proto__": {"polluted": true},');
  assert.equal(store.importData(polluted).ok, false);
  assert.equal({}.polluted, undefined);
  assert.equal(store.importData('{').ok, false);
  assert.equal(store.importData(' '.repeat(1024 * 1024 + 1)).ok, false);
  assert.deepEqual(store.getState(), before);
});

test('invalid numeric, date and completion data cannot become a backup', () => {
  const { store } = fixture();
  passLesson(store);
  for (const mutate of [
    (data) => { data.state.days['2026-11-12'].seconds = -10; },
    (data) => { data.state.days['2026-11-12'].correct = 999; },
    (data) => { data.state.days['2026-02-31'] = data.state.days['2026-11-12']; },
    (data) => { data.state.lessons['ja-01'].bestScore = 1; },
    (data) => { data.state.lastLesson = 'ko-01'; },
    (data) => { data.exportedAt = 'invalid'; },
  ]) {
    const data = JSON.parse(store.exportData());
    mutate(data);
    assert.equal(store.importData(JSON.stringify(data)).ok, false);
  }
});

test('storage corruption and write failures keep a safe in-memory app', () => {
  const corrupted = memoryStorage({ [STORAGE_KEY]: '{not-json' });
  const store = createStore({ storage: corrupted, catalog });
  assert.equal(store.getStats().completed, 0);
  store.visitLesson('ja-01');
  assert.equal(store.storageAvailable, true);
  const blocked = createStore({ storage: { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('quota'); } }, catalog });
  assert.equal(blocked.storageAvailable, false);
  blocked.addStudySeconds(20);
  assert.equal(blocked.getStats().todaySeconds, 20);
  assert.equal(blocked.storageAvailable, false);
  assert.equal(JSON.parse(blocked.exportData()).state.version, 1);
});

test('snapshots and subscribers cannot mutate store state and invalid IDs are ignored', () => {
  const { store } = fixture();
  let calls = 0;
  const off = store.subscribe((state) => { calls++; state.goalMinutes = 999; });
  store.visitLesson('ja-01');
  assert.equal(calls, 1);
  assert.equal(store.getState().goalMinutes, 15);
  const snapshot = store.getState();
  snapshot.lessons['ja-01'].bestScore = 99;
  assert.equal(store.getState().lessons['ja-01'].bestScore, 0);
  store.answerQuestion('ja-01', 'ko-01-q1', true);
  assert.equal(store.getStats().attempts, 0);
  store.visitLesson('__proto__');
  assert.equal(store.toggleFavoriteWord('missing'), false);
  assert.equal(store.reviewWord('missing', 'good'), null);
  assert.equal(store.reviewWord('ja-w001', 'bad'), null);
  off();
  store.addStudySeconds(5);
  assert.equal(calls, 1, 'only the valid visit notifies; invalid actions and unsubscribed updates emit nothing');
});

test('persisted records reload with the same catalog', () => {
  const { store, storage } = fixture();
  passLesson(store);
  const reloaded = createStore({ storage, catalog });
  assert.deepEqual(reloaded.getState(), store.getState());
});

test('standalone stores also reject object prototype names as record IDs', () => {
  const store = createStore({ storage: memoryStorage() });
  for (const id of ['toString', 'valueOf', 'hasOwnProperty', 'constructor', '__proto__']) {
    store.visitLesson(id);
    assert.equal(store.reviewWord(id, 'good'), null);
  }
  assert.deepEqual(store.getState().lessons, {});
  assert.deepEqual(store.getState().words, {});
});

test('imports reject impossible completion histories without rejecting legitimate retakes', () => {
  const { store } = fixture();
  for (const id of ['ja-01-q1', 'ja-01-q2', 'ja-01-q3']) store.answerQuestion('ja-01', id, false);
  const fabricated = JSON.parse(store.exportData());
  Object.assign(fabricated.state.lessons['ja-01'], { completedAt: fabricated.exportedAt, bestScore: 3, total: 3 });
  fabricated.state.days['2026-11-12'].completedLessons.push('ja-01');
  fabricated.state.days['2026-11-12'].correct = 3;
  assert.equal(store.importData(JSON.stringify(fabricated)).ok, false, 'three wrong first attempts cannot support a past perfect result');

  const legitimate = fixture().store;
  passLesson(legitimate);
  for (const id of ['ja-01-q1', 'ja-01-q2', 'ja-01-q3']) legitimate.answerQuestion('ja-01', id, false);
  assert.equal(store.importData(legitimate.exportData()).ok, true, 'an earlier perfect result remains valid after a poor retake');

  const missingDay = JSON.parse(legitimate.exportData());
  missingDay.state.days['2026-11-12'].completedLessons = [];
  assert.equal(store.importData(JSON.stringify(missingDay)).ok, false, 'every completed lesson has a completion-day entry');
  const missingCorrect = JSON.parse(legitimate.exportData());
  missingCorrect.state.days['2026-11-12'].correct = 0;
  assert.equal(store.importData(JSON.stringify(missingCorrect)).ok, false, 'the history must contain enough correct answers for the best result');
});

test('imports reject a review due before its last review or mastery without successful reviews', () => {
  const { store } = fixture();
  store.reviewWord('ja-w001', 'good');
  const wrongDate = JSON.parse(store.exportData());
  wrongDate.state.words['ja-w001'].dueAt = new Date(2026, 10, 11, 12).toISOString();
  assert.equal(store.importData(JSON.stringify(wrongDate)).ok, false);
  const fakeMastery = JSON.parse(store.exportData());
  fakeMastery.state.words['ja-w001'].stage = 5;
  assert.equal(store.importData(JSON.stringify(fakeMastery)).ok, false);
  assert.equal(store.getState().words['ja-w001'].stage, 1, 'failed imports leave the existing record intact');
});

test('a stale tab adds favorites without overwriting a lesson completed in another tab', () => {
  const storage = memoryStorage();
  const now = () => new Date(2026, 10, 12, 12);
  const a = createStore({ storage, now, catalog });
  const b = createStore({ storage, now, catalog });
  a.toggleFavoriteWord('ja-w001');
  passLesson(b);
  a.toggleFavoriteWord('ja-w002');
  const reloaded = createStore({ storage, now, catalog });
  assert.equal(reloaded.getStats().completed, 1);
  assert.equal(reloaded.getStats().attempts, 3);
  assert.deepEqual(reloaded.getState().favoriteWords, ['ja-w001', 'ja-w002']);
  b.addStudySeconds(30);
  a.addStudySeconds(20);
  assert.equal(a.getStats().totalSeconds, 50, 'separate tabs add time to the latest record');
});

test('standard storage events refresh other tabs and destroy removes the listener', () => {
  const storage = memoryStorage();
  const eventTarget = new EventTarget();
  const now = () => new Date(2026, 10, 12, 12);
  const a = createStore({ storage, now, catalog, eventTarget });
  const b = createStore({ storage, now, catalog });
  let notifications = 0;
  a.subscribe(() => notifications++);
  const emit = (key) => {
    const event = new Event('storage');
    Object.defineProperties(event, { key: { value: key }, storageArea: { value: storage } });
    eventTarget.dispatchEvent(event);
  };
  b.addStudySeconds(25);
  emit('unrelated:key');
  assert.equal(a.getStats().totalSeconds, 0);
  emit(STORAGE_KEY);
  assert.equal(a.getStats().totalSeconds, 25);
  assert.equal(notifications, 1);
  emit(STORAGE_KEY);
  assert.equal(notifications, 1, 'the same stored value does not cause a render loop');
  a.destroy();
  b.addStudySeconds(10);
  emit(STORAGE_KEY);
  assert.equal(a.getStats().totalSeconds, 25);
  a.refresh();
  assert.equal(a.getStats().totalSeconds, 35, 'an explicit foreground refresh still works');
});

test('unsaved memory changes survive refresh and merge with another tab when storage recovers', () => {
  const backing = memoryStorage();
  let blocked = true;
  let date = new Date(2026, 10, 12, 12);
  const now = () => date;
  const unreliable = {
    getItem: (key) => backing.getItem(key),
    setItem(key, value) { if (blocked) throw new Error('quota'); backing.setItem(key, value); },
  };
  const a = createStore({ storage: unreliable, now, catalog });
  const b = createStore({ storage: backing, now, catalog });
  a.addStudySeconds(20);
  a.toggleFavoriteWord('ja-w001');
  a.reviewWord('ja-w002', 'good');
  assert.equal(a.storageAvailable, false);
  date = new Date(2026, 10, 13, 12);
  passLesson(b);
  b.addStudySeconds(30);
  b.toggleFavoriteWord('ja-w001');
  b.reviewWord('ja-w002', 'good');
  const newerReview = b.getState().words['ja-w002'].lastReviewedAt;
  a.refresh();
  assert.equal(a.getStats().totalSeconds, 50);
  assert.equal(a.getStats().completed, 1);
  assert.deepEqual(a.getState().favoriteWords, ['ja-w001'], 'replaying a saved favorite intent does not toggle it off');
  assert.equal(a.getState().words['ja-w002'].lastReviewedAt, newerReview);
  assert.equal(a.getState().words['ja-w002'].reviews, 2);
  blocked = false;
  a.addStudySeconds(10);
  assert.equal(a.storageAvailable, true);
  const reloaded = createStore({ storage: backing, now, catalog });
  assert.equal(reloaded.getStats().totalSeconds, 60);
  assert.equal(reloaded.getStats().completed, 1);
  assert.equal(reloaded.getStats().attempts, 3);
  assert.deepEqual(reloaded.getState().favoriteWords, ['ja-w001']);
  assert.equal(reloaded.getState().words['ja-w002'].reviews, 2);
  assert.equal(reloaded.importData(reloaded.exportData()).ok, true, 'the merged history remains a valid backup');
});
