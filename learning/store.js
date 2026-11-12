/** Local learning records. No account, network request, or fabricated progress. */
export const STORAGE_KEY = 'body:learning:v1';

const VERSION = 1;
const MAX_BYTES = 1024 * 1024;
const GOALS = new Set([5, 10, 15, 20, 30, 45, 60]);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,119}$/i;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTERVALS = [0, 1, 3, 7, 14, 30];
const clone = (value) => JSON.parse(JSON.stringify(value));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
class BackupValidationError extends Error {}
const fail = (message = '備份格式不正確，原有學習紀錄沒有變更。') => { throw new BackupValidationError(message); };

export function localDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) throw new TypeError('Invalid date');
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function freshState() {
  return {
    version: VERSION,
    goalMinutes: 15,
    lessons: {},
    favoriteLessons: [],
    favoriteWords: [],
    words: {},
    days: {},
    lastLesson: null,
  };
}

function exactKeys(value, keys) {
  if (!isObject(value) || Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key) || UNSAFE_KEYS.has(key))) fail();
}

function validTimestamp(value) {
  if (typeof value !== 'string' || value.length > 32) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() >= 2000 &&
    parsed.getUTCFullYear() <= 2100 && parsed.toISOString() === value;
}

function validDay(value) {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return year >= 2000 && year <= 2100 && localDateKey(parsed) === value;
}

function safeParse(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) {
    fail('請選擇小於 1 MB 的 Body 學習備份檔。');
  }
  return JSON.parse(text, (key, value) => {
    if (UNSAFE_KEYS.has(key)) fail();
    return value;
  });
}

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

/**
 * Inject storage and a clock for tests. Supplying a catalog enables strict ID
 * allowlists; leaving it out accepts well-formed IDs for standalone use.
 */
export function createStore(options = {}) {
  let storage;
  let available = false;
  try { storage = options.storage === undefined ? globalThis.localStorage : options.storage; } catch { storage = null; }
  const clock = typeof options.now === 'function' ? options.now : () => new Date();
  let operationDate = null;
  const catalog = options.catalog;
  const allowed = {
    lesson: catalog ? new Set(catalog.lessonIds || []) : null,
    word: catalog ? new Set(catalog.wordIds || []) : null,
    question: catalog ? new Set(catalog.questionIds || []) : null,
  };
  const validId = (id, type) => typeof id === 'string' && ID_PATTERN.test(id) &&
    !UNSAFE_KEYS.has(id) && !Object.prototype.hasOwnProperty.call(Object.prototype, id) &&
    (!allowed[type] || allowed[type].has(id));
  const lessonQuestions = (id) => catalog?.questionIdsByLesson?.[id] ||
    (allowed.question ? [...allowed.question].filter((qid) => qid.startsWith(`${id}-`)) : null);
  const currentDate = () => {
    const date = new Date(operationDate || clock());
    if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid clock');
    return date;
  };
  const listeners = new Set();
  let state = freshState();
  let lastStoredValue = null;
  let activeOperation = null;
  let pendingOperations = [];
  let replaying = false;
  let replayApplied = false;
  const originalMethods = new Map();

  function idList(value, type, limit = 10000) {
    if (!Array.isArray(value) || value.length > limit || new Set(value).size !== value.length ||
        value.some((id) => !validId(id, type))) fail();
  }

  function validateState(value) {
    exactKeys(value, ['version', 'goalMinutes', 'lessons', 'favoriteLessons', 'favoriteWords', 'words', 'days', 'lastLesson']);
    if (value.version !== VERSION || !GOALS.has(value.goalMinutes)) fail();
    if (!isObject(value.lessons) || Object.keys(value.lessons).length > 1000 ||
        !isObject(value.words) || Object.keys(value.words).length > 10000 ||
        !isObject(value.days) || Object.keys(value.days).length > 3660) fail();
    idList(value.favoriteLessons, 'lesson', 1000);
    idList(value.favoriteWords, 'word');
    if (value.lastLesson !== null && !validId(value.lastLesson, 'lesson')) fail();

    let completedCount = 0;
    let minimumRecordedCorrect = 0;
    for (const [id, lesson] of Object.entries(value.lessons)) {
      if (!validId(id, 'lesson')) fail();
      exactKeys(lesson, ['visitedAt', 'completedAt', 'bestScore', 'total', 'answers']);
      if (!validTimestamp(lesson.visitedAt) || (lesson.completedAt !== null && !validTimestamp(lesson.completedAt)) ||
          !integer(lesson.total, 0, 100) || !integer(lesson.bestScore, 0, lesson.total) ||
          !isObject(lesson.answers) || Object.keys(lesson.answers).length > 100) fail();
      if (lesson.completedAt && (lesson.total === 0 || lesson.bestScore / lesson.total < 0.8)) fail();
      for (const [qid, answer] of Object.entries(lesson.answers)) {
        if (!validId(qid, 'question') || !qid.startsWith(`${id}-`)) fail();
        exactKeys(answer, ['correct', 'attempts']);
        if (typeof answer.correct !== 'boolean' || !integer(answer.attempts, 1, 1000000)) fail();
      }
      if (lesson.completedAt && Object.keys(lesson.answers).length < lesson.total) fail();
      const expected = lessonQuestions(id);
      if (lesson.completedAt && expected && (lesson.total !== expected.length || expected.some((qid) => !lesson.answers[qid]))) fail();
      if (lesson.completedAt) {
        // A completed lesson may later be retried incorrectly. A wrong answer
        // can therefore support a past correct answer only after two attempts.
        const possiblyCorrectBefore = Object.values(lesson.answers)
          .filter((answer) => answer.correct || answer.attempts >= 2).length;
        if (possiblyCorrectBefore < lesson.bestScore) fail();
        completedCount++;
        minimumRecordedCorrect += lesson.bestScore;
      }
    }
    if (value.lastLesson !== null && !value.lessons[value.lastLesson]) fail();

    for (const [id, word] of Object.entries(value.words)) {
      if (!validId(id, 'word')) fail();
      exactKeys(word, ['stage', 'dueAt', 'lastReviewedAt', 'reviews', 'correctReviews']);
      if (!integer(word.stage, 0, 5) || !validTimestamp(word.dueAt) || !validTimestamp(word.lastReviewedAt) ||
          !integer(word.reviews, 1, 1000000) || !integer(word.correctReviews, 0, word.reviews)) fail();
      if (new Date(word.dueAt) < new Date(word.lastReviewedAt) || word.correctReviews < word.stage) fail();
    }

    const completions = new Set();
    let recordedCorrect = 0;
    for (const [dayKey, day] of Object.entries(value.days)) {
      if (!validDay(dayKey)) fail();
      exactKeys(day, ['seconds', 'attempts', 'correct', 'completedLessons', 'reviewedWords']);
      if (!integer(day.seconds, 0, 86400) || !integer(day.attempts, 0, 1000000) || !integer(day.correct, 0, day.attempts)) fail();
      recordedCorrect += day.correct;
      idList(day.completedLessons, 'lesson', 1000);
      idList(day.reviewedWords, 'word');
      for (const id of day.completedLessons) {
        if (!value.lessons[id]?.completedAt || completions.has(id)) fail();
        completions.add(id);
      }
      if (day.reviewedWords.some((id) => !value.words[id])) fail();
    }
    if (completions.size !== completedCount || recordedCorrect < minimumRecordedCorrect) fail();
    return clone(value);
  }

  try {
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      const saved = storage.getItem(STORAGE_KEY);
      lastStoredValue = saved;
      available = true;
      if (saved) {
        try { state = validateState(safeParse(saved)); } catch { state = freshState(); }
      }
    }
  } catch { available = false; }

  function notify() {
    for (const listener of listeners) {
      try { listener(clone(state)); } catch { /* A view cannot prevent other subscribers from updating. */ }
    }
  }

  /** Refresh from other tabs without discarding changes that could not be saved. */
  function readLatest(emit = false) {
    if (replaying) return true;
    let raw;
    try {
      if (!storage || typeof storage.getItem !== 'function') throw new Error('No storage');
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      available = false;
      return false;
    }
    if (raw === lastStoredValue) return true;
    let incoming;
    try { incoming = raw === null ? freshState() : validateState(safeParse(raw)); } catch {
      // An invalid external value cannot erase a valid in-memory record.
      return true;
    }

    const before = state;
    const previousDate = operationDate;
    state = incoming;
    replaying = true;
    try {
      // Reapply only unsaved actions, not an entire stale snapshot. This keeps
      // another tab's completed lessons and makes time/counters additive.
      for (const operation of pendingOperations) {
        operationDate = operation.at;
        replayApplied = false;
        if (operation.name === 'toggleFavoriteLesson' || operation.name === 'toggleFavoriteWord') {
          const key = operation.name === 'toggleFavoriteLesson' ? 'favoriteLessons' : 'favoriteWords';
          if (state[key].includes(operation.args[0]) === operation.desired) replayApplied = true;
          else originalMethods.get(operation.name)(...operation.args);
        } else originalMethods.get(operation.name)(...operation.args);
        if (!replayApplied) throw new Error('An unsaved action cannot be safely replayed');
      }
      lastStoredValue = raw;
    } catch {
      // Preserve the user's unsaved session rather than silently dropping a
      // completion that conflicts with an externally replaced backup.
      state = before;
      available = false;
      return false;
    } finally {
      replaying = false;
      operationDate = previousDate;
    }
    if (emit && JSON.stringify(before) !== JSON.stringify(state)) notify();
    return true;
  }

  function publish() {
    if (replaying) {
      replayApplied = true;
      return clone(state);
    }
    if (activeOperation) {
      const operation = { ...activeOperation, args: clone(activeOperation.args) };
      if (operation.name === 'toggleFavoriteLesson') operation.desired = state.favoriteLessons.includes(operation.args[0]);
      if (operation.name === 'toggleFavoriteWord') operation.desired = state.favoriteWords.includes(operation.args[0]);
      pendingOperations.push(operation);
    }
    const readable = readLatest();
    try {
      if (!readable || !storage || typeof storage.setItem !== 'function') throw new Error('No storage');
      const serialized = JSON.stringify(state);
      storage.setItem(STORAGE_KEY, serialized);
      lastStoredValue = serialized;
      pendingOperations = [];
      available = true;
    } catch { available = false; }
    notify();
    return clone(state);
  }

  function dayEntry(date = currentDate()) {
    const key = localDateKey(date);
    if (!state.days[key]) state.days[key] = { seconds: 0, attempts: 0, correct: 0, completedLessons: [], reviewedWords: [] };
    return state.days[key];
  }

  function lessonEntry(id, date = currentDate()) {
    if (!state.lessons[id]) {
      state.lessons[id] = { visitedAt: date.toISOString(), completedAt: null, bestScore: 0, total: 0, answers: {} };
    }
    return state.lessons[id];
  }

  function toggle(key, id, type) {
    if (!validId(id, type)) return false;
    const index = state[key].indexOf(id);
    if (index >= 0) state[key].splice(index, 1);
    else state[key].push(id);
    publish();
    return index < 0;
  }

  function hasActivity(day) {
    return Boolean(day && (day.seconds > 0 || day.attempts > 0 || day.completedLessons.length || day.reviewedWords.length));
  }

  const api = {
    get storageAvailable() { return available; },
    getState: () => clone(state),
    refresh() {
      readLatest(true);
      return clone(state);
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    visitLesson(id) {
      if (!validId(id, 'lesson')) return clone(state);
      const date = currentDate();
      lessonEntry(id, date).visitedAt = date.toISOString();
      state.lastLesson = id;
      return publish();
    },
    answerQuestion(lessonId, questionId, correct) {
      if (!validId(lessonId, 'lesson') || !validId(questionId, 'question') ||
          !questionId.startsWith(`${lessonId}-`) || typeof correct !== 'boolean') return clone(state);
      const date = currentDate();
      const entry = lessonEntry(lessonId, date);
      const old = entry.answers[questionId];
      entry.answers[questionId] = { correct, attempts: Math.min(1000000, (old?.attempts || 0) + 1) };
      state.lastLesson = lessonId;
      const day = dayEntry(date);
      day.attempts = Math.min(1000000, day.attempts + 1);
      if (correct) day.correct = Math.min(day.attempts, day.correct + 1);
      return publish();
    },
    completeLesson(id, score, total) {
      if (!validId(id, 'lesson') || !integer(total, 1, 100) || !integer(score, 0, total)) {
        return { ok: false, reason: '課程成績格式不正確。' };
      }
      const entry = state.lessons[id];
      const answers = Object.values(entry?.answers || {});
      const expected = lessonQuestions(id);
      if (expected && (total !== expected.length || expected.some((qid) => !entry?.answers[qid]))) {
        return { ok: false, reason: '請先完成這一課的所有練習。' };
      }
      if (answers.length !== total || answers.filter((answer) => answer.correct).length !== score) {
        return { ok: false, reason: '請先完成這一課的所有練習。' };
      }
      if (score / total < 0.8) return { ok: false, reason: '答對至少 80% 就能完成這一課，看看解析再試一次。' };
      const date = currentDate();
      const alreadyCompleted = Boolean(entry.completedAt);
      if (!alreadyCompleted) {
        entry.completedAt = date.toISOString();
        const day = dayEntry(date);
        if (!day.completedLessons.includes(id)) day.completedLessons.push(id);
      }
      entry.bestScore = Math.min(total, Math.max(entry.bestScore, score));
      entry.total = total;
      publish();
      return { ok: true, alreadyCompleted };
    },
    toggleFavoriteLesson: (id) => toggle('favoriteLessons', id, 'lesson'),
    toggleFavoriteWord: (id) => toggle('favoriteWords', id, 'word'),
    reviewWord(id, rating) {
      if (!validId(id, 'word') || !['again', 'hard', 'good'].includes(rating)) return null;
      const date = currentDate();
      const previous = state.words[id];
      let stage = previous?.stage || 0;
      let due = new Date(date);
      const olderPendingReview = replaying && previous && new Date(previous.lastReviewedAt) > date;
      if (olderPendingReview) {
        // The older offline attempt still counts, but must not rewind a newer
        // review performed in another tab.
        due = new Date(previous.dueAt);
      } else if (rating === 'again') {
        stage = 0;
        due.setMinutes(due.getMinutes() + 10);
      } else if (rating === 'hard') {
        stage = Math.min(stage, 1);
        due.setDate(due.getDate() + 1);
      } else {
        // Reopening today's card repeatedly does not turn it into a mastered word.
        const ready = !previous || new Date(previous.dueAt).getTime() <= date.getTime();
        if (ready) {
          stage = Math.min(5, stage + 1);
          due.setDate(due.getDate() + INTERVALS[stage]);
        } else due = new Date(previous.dueAt);
      }
      state.words[id] = {
        stage,
        dueAt: due.toISOString(),
        lastReviewedAt: olderPendingReview ? previous.lastReviewedAt : date.toISOString(),
        reviews: Math.min(1000000, (previous?.reviews || 0) + 1),
        correctReviews: Math.min(1000000, (previous?.correctReviews || 0) + (rating === 'good' ? 1 : 0)),
      };
      const day = dayEntry(date);
      if (!day.reviewedWords.includes(id)) day.reviewedWords.push(id);
      publish();
      return clone(state.words[id]);
    },
    addStudySeconds(seconds) {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return clone(state);
      const increment = Math.min(60, Math.round(seconds));
      if (increment === 0) return clone(state);
      const day = dayEntry();
      day.seconds = Math.min(86400, day.seconds + increment);
      return publish();
    },
    setGoal(minutes) {
      if (!GOALS.has(minutes)) return false;
      state.goalMinutes = minutes;
      publish();
      return true;
    },
    exportData() {
      readLatest();
      return JSON.stringify({ app: 'body-learning', version: VERSION, exportedAt: currentDate().toISOString(), state: clone(state) }, null, 2);
    },
    importData(text) {
      try {
        const data = safeParse(text);
        exactKeys(data, ['app', 'version', 'exportedAt', 'state']);
        if (data.app !== 'body-learning' || data.version !== VERSION || !validTimestamp(data.exportedAt)) fail();
        const validated = validateState(data.state);
        // A user-confirmed backup replacement supersedes older unsaved actions.
        if (!replaying) pendingOperations = [];
        state = validated;
        publish();
        return { ok: true, persisted: available };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof SyntaxError ? '這不是有效的 JSON 備份檔，原有紀錄沒有變更。'
            : error instanceof BackupValidationError ? error.message : '無法讀取備份檔，原有紀錄沒有變更。',
        };
      }
    },
    getStats() {
      const date = currentDate();
      const today = state.days[localDateKey(date)];
      let totalSeconds = 0;
      let attempts = 0;
      let correct = 0;
      for (const day of Object.values(state.days)) {
        totalSeconds += day.seconds;
        attempts += day.attempts;
        correct += day.correct;
      }
      // Calendar subtraction (not 86,400,000 ms) also works across DST changes.
      const cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
      if (!hasActivity(state.days[localDateKey(cursor)])) cursor.setDate(cursor.getDate() - 1);
      let streak = 0;
      while (hasActivity(state.days[localDateKey(cursor)])) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      return {
        completed: Object.values(state.lessons).filter((lesson) => lesson.completedAt).length,
        totalSeconds,
        todaySeconds: today?.seconds || 0,
        streak,
        attempts,
        correct,
        accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
        reviewedToday: today?.reviewedWords.length || 0,
        masteredWords: Object.values(state.words).filter((word) => word.stage >= 3).length,
      };
    },
    getDueWords() {
      const time = currentDate().getTime();
      return Object.entries(state.words)
        .filter(([, word]) => new Date(word.dueAt).getTime() <= time)
        .sort(([a, left], [b, right]) => new Date(left.dueAt) - new Date(right.dueAt) || a.localeCompare(b))
        .map(([id]) => id);
    },
    getDailySelection(ids, count = 10, seed = '') {
      if (!Array.isArray(ids) || !Number.isFinite(count)) return [];
      const size = Math.max(0, Math.min(100, Math.floor(count)));
      const salt = `${localDateKey(currentDate())}|${String(seed).slice(0,200)}|`;
      return [...new Set(ids.filter((id) => validId(id, 'word')))]
        .map((id) => ({ id, score: hash(salt + id) }))
        .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
        .slice(0, size)
        .map(({ id }) => id);
    },
  };

  for (const name of [
    'visitLesson', 'answerQuestion', 'completeLesson', 'toggleFavoriteLesson',
    'toggleFavoriteWord', 'reviewWord', 'addStudySeconds', 'setGoal', 'importData',
  ]) {
    const original = api[name];
    originalMethods.set(name, original);
    api[name] = (...args) => {
      readLatest();
      const previousOperation = activeOperation;
      const previousDate = operationDate;
      const at = currentDate().toISOString();
      activeOperation = { name, args, at };
      operationDate = at;
      try { return original(...args); }
      finally {
        activeOperation = previousOperation;
        operationDate = previousDate;
      }
    };
  }

  // The browser fires this event in other tabs. An injectable EventTarget also
  // lets tests exercise the same path without creating a browser or an account.
  const eventTarget = options.eventTarget || globalThis.window;
  const onStorage = (event) => {
    if ((event.key === STORAGE_KEY || event.key === null) && (!event.storageArea || event.storageArea === storage)) readLatest(true);
  };
  eventTarget?.addEventListener?.('storage', onStorage);
  api.destroy = () => {
    eventTarget?.removeEventListener?.('storage', onStorage);
    listeners.clear();
  };
  return api;
}
