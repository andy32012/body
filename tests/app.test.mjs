/**
 * Functional DOM tests, not browser layout or real speech playback tests.
 * Every case loads the actual page HTML and app.js and drives its DOM events.
 * External resource loading stays disabled; no account or network is needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { createStore, STORAGE_KEY, localDateKey } from '../learning/store.js';
import { courseById, courseLessons, lessonById, wordById, catalogIds, lessons } from '../learning/catalog.js';

const appURL = new URL('../learning/app.js', import.meta.url);
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const nativeSetInterval = globalThis.setInterval;
const nativeClearInterval = globalThis.clearInterval;
let mountNumber = 0;

const memoryStorage = () => {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key),
  };
};
const catalog = {
  ...catalogIds,
  questionIdsByLesson: Object.fromEntries(lessons.map(lesson => [lesson.id, lesson.questions.map(question => question.id)])),
};

function seedRecords({ completed = false, reviewed = false, seconds = 0, goal = 15, ago = 0 } = {}) {
  const storage = memoryStorage();
  const now = new Date(Date.now() - ago);
  const store = createStore({ storage, now: () => now, catalog });
  const lesson = courseLessons('ja')[0];
  if (completed) {
    store.visitLesson(lesson.id);
    for (const question of lesson.questions) store.answerQuestion(lesson.id, question.id, true);
    assert.equal(store.completeLesson(lesson.id, lesson.questions.length, lesson.questions.length).ok, true);
  }
  if (reviewed) store.reviewWord(lesson.words[0].id, 'again');
  while (seconds > 0) {
    const increment = Math.min(60, seconds);
    store.addStudySeconds(increment);
    seconds -= increment;
  }
  store.setGoal(goal);
  return { raw: storage.getItem(STORAGE_KEY), backup: store.exportData(), state: store.getState() };
}

async function mount(path, { raw = null } = {}) {
  const url = new URL(path, 'https://body.test');
  const folder = url.pathname.split('/').filter(Boolean)[0];
  const html = await readFile(new URL(`../${folder}/index.html`, import.meta.url), 'utf8');
  const window = new Window({
    url: url.href,
    settings: {
      enableJavaScriptEvaluation: false,
      disableJavaScriptFileLoading: true,
      enableCSSFileLoading: false,
      enableImageFileLoading: false,
      navigation: { disableMainFrameNavigation: true, disableChildPageNavigation: true },
    },
  });
  window.document.write(html);
  window.document.close();
  if (raw) window.localStorage.setItem(STORAGE_KEY, raw);

  const descriptors = new Map();
  const timeoutIds = new Set();
  const intervalIds = new Set();
  const globals = {
    window,
    document: window.document,
    location: window.location,
    history: window.history,
    localStorage: window.localStorage,
    setTimeout: (callback, delay, ...args) => {
      const id = nativeSetTimeout(callback, delay, ...args);
      timeoutIds.add(id);
      return id;
    },
    setInterval: (callback, delay, ...args) => {
      const id = nativeSetInterval(callback, delay, ...args);
      intervalIds.add(id);
      return id;
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const errors = [];
  window.addEventListener('error', event => errors.push(event.error?.message || event.message));

  const context = {
    window,
    document: window.document,
    query(selector) {
      const element = window.document.querySelector(selector);
      assert(element, `Expected DOM element: ${selector}`);
      return element;
    },
    all: selector => [...window.document.querySelectorAll(selector)],
    text: () => window.document.body.textContent,
    // Happy DOM 21.0.4 misselects the second option when parsing HTML with a
    // later `selected` attribute (reproduces in a standalone three-option
    // select). Assert the actual serialized app selection here; change tests
    // below still set .value and dispatch real DOM events to exercise app code.
    renderedSelection(selector) {
      return this.query(`${selector} option[selected]`).value;
    },
    click(selector) {
      const element = this.query(selector);
      assert.notEqual(element.disabled, true, `Control must be enabled before clicking: ${selector}`);
      element.click();
    },
    select(selector, value) {
      const element = this.query(selector);
      element.value = String(value);
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    type(selector, value) {
      const element = this.query(selector);
      element.focus();
      element.value = value;
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
    },
    choose(question, value = question.answer) {
      const element = this.query(`input[data-question="${question.id}"][value="${value}"]`);
      element.checked = true;
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    grade(question, value = question.answer) {
      this.choose(question, value);
      this.click(`[data-action="grade-question"][data-id="${question.id}"]`);
    },
    raw: () => window.localStorage.getItem(STORAGE_KEY),
    state: () => JSON.parse(window.localStorage.getItem(STORAGE_KEY)),
    async file(contents, name = 'body-backup.json') {
      const input = this.query('#backup-file');
      const transfer = new window.DataTransfer();
      transfer.items.add(new window.File([contents], name, { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
    },
    async close() {
      for (const id of timeoutIds) nativeClearTimeout(id);
      for (const id of intervalIds) nativeClearInterval(id);
      await window.happyDOM.close();
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      assert.deepEqual(errors, [], 'UI events must not produce uncaught DOM errors');
    },
  };
  try {
    await import(`${appURL.href}?dom-case=${++mountNumber}`);
    assert.equal(window.document.querySelector('#reload-learning'), null, 'The real app must initialize successfully');
    assert(window.document.querySelector('.main'), 'The main app shell must render');
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
}

test('Japanese roadmap, stage selection and search use the actual course catalog', async () => {
  const dom = await mount('/japanese/');
  try {
    assert.match(dom.query('h1').textContent, /日文/);
    assert.equal(dom.all('.lesson-list .lesson-card').length, 5);
    assert.equal(dom.all('.stage').length, 6);
    assert.match(dom.query('.overview-strip').textContent, /30/);
    assert.match(dom.query('.progress-caption').textContent, /0 \/ 30/);
    dom.click('[data-action="stage"][data-stage="ja-s6"]');
    assert.equal(dom.all('.lesson-list .lesson-card').length, 5);
    assert.match(dom.query('.lesson-list').textContent, /敬語/);
    assert.equal(dom.query('[data-stage="ja-s6"]').getAttribute('aria-pressed'), 'true');
    dom.type('#course-search', '時間');
    assert(dom.all('.lesson-list .lesson-card').length > 0);
    assert(dom.all('.lesson-list .lesson-card').some(link => link.dataset.lesson === 'ja-08'), 'Search should find lessons beyond the selected stage');
    assert.equal(dom.document.activeElement.id, 'course-search');
    dom.type('#course-search', '<img src=x onerror=alert(1)>');
    assert.match(dom.query('.lesson-list').textContent, /沒有找到/);
    assert.equal(dom.all('img[src="x"]').length, 0, 'Search text must not be interpreted as HTML');
    dom.type('#course-search', '');
    dom.click('[data-action="stage"][data-stage="all"]');
    assert.equal(dom.all('.lesson-list .lesson-card').length, 30);
  } finally { await dom.close(); }
});

test('Korean navigation opens Korean lessons and shows Korean teaching content', async () => {
  const dom = await mount('/korean/');
  try {
    assert.match(dom.query('h1').textContent, /안녕하세요/);
    dom.click('[data-action="stage"][data-stage="ko-s6"]');
    assert.equal(dom.all('.lesson-list .lesson-card').length, 5);
    const id = dom.query('.lesson-list .lesson-card').dataset.lesson;
    assert.equal(lessonById[id].language, 'ko');
    dom.click(`.lesson-list [data-lesson="${id}"]`);
    assert.equal(dom.window.location.search, `?lesson=${id}`);
    assert.equal(dom.query('.lesson-hero h1').textContent, lessonById[id].title);
    assert.equal(dom.all('.question').length, 3);
    assert.match(dom.query('#lesson-examples').textContent, /[가-힣]/);
    assert.equal(dom.state().lastLesson, id);
    dom.click('[data-action="back-course"]');
    assert.equal(dom.window.location.pathname, '/korean/');
    assert.equal(dom.window.location.search, '');
    assert.match(dom.document.title, /韓文學堂/);
  } finally { await dom.close(); }
});

test('answers are checked, explained, retried, completed and retained after a fresh app load', async () => {
  let dom = await mount('/japanese/?lesson=ja-01');
  const lesson = lessonById['ja-01'];
  let raw;
  try {
    assert.equal(dom.query('[data-action="complete-lesson"]').disabled, true);
    const first = lesson.questions[0];
    assert.equal(dom.query(`[data-action="grade-question"][data-id="${first.id}"]`).disabled, true);
    dom.grade(first, (first.answer + 1) % 4);
    assert.match(dom.query(`#question-${first.id} .question-feedback`).textContent, /正確答案/);
    assert(dom.query(`#question-${first.id} .question-feedback`).textContent.includes(first.explanation));
    assert.equal(dom.state().lessons[lesson.id].answers[first.id].correct, false);
    assert.equal(dom.state().days[localDateKey()].attempts, 1);
    dom.click(`[data-action="retry-question"][data-id="${first.id}"]`);
    assert.equal(dom.document.querySelector(`#question-${first.id} .question-feedback`), null);
    assert.equal(dom.query(`[data-action="grade-question"][data-id="${first.id}"]`).disabled, true);
    dom.grade(first);
    for (const question of lesson.questions.slice(1)) dom.grade(question);
    assert.equal(dom.query('[data-action="complete-lesson"]').disabled, false);
    assert.match(dom.query('.completion-card').textContent, /已檢查 3 \/ 3 題/);
    assert.equal(dom.state().lessons[lesson.id].completedAt, null, 'Answering alone must not auto-complete a lesson');
    dom.click('[data-action="complete-lesson"]');
    assert(dom.state().lessons[lesson.id].completedAt);
    assert.equal(dom.state().lessons[lesson.id].bestScore, 3);
    assert.equal(dom.state().days[localDateKey()].attempts, 4);
    assert.equal(dom.state().days[localDateKey()].correct, 3);
    assert.match(dom.query('.already-complete').textContent, /已於/);
    assert.match(dom.query('[data-action="complete-lesson"]').textContent, /更新練習紀錄/);
    raw = dom.raw();
  } finally { await dom.close(); }
  dom = await mount('/japanese/?lesson=ja-01', { raw });
  try {
    assert.match(dom.query('.already-complete').textContent, /完成/);
    assert.equal(dom.state().lessons['ja-01'].bestScore, 3);
    dom.click('[data-action="back-course"]');
    assert.match(dom.query('.progress-caption').textContent, /1 \/ 30/);
    assert(dom.query('.lesson-card[data-lesson="ja-01"]').classList.contains('done'));
  } finally { await dom.close(); }
});

test('a 2-of-3 result cannot unlock lesson completion', async () => {
  const dom = await mount('/korean/?lesson=ko-01');
  const lesson = lessonById['ko-01'];
  try {
    lesson.questions.forEach((question, index) => dom.grade(question, index === 0 ? (question.answer + 1) % 4 : question.answer));
    assert.equal(dom.query('[data-action="complete-lesson"]').disabled, true);
    assert.match(dom.query('.completion-card').textContent, /目前答對 2 題/);
    assert.equal(dom.state().lessons[lesson.id].completedAt, null);
  } finally { await dom.close(); }
});

test('lesson and vocabulary favorites update the rendered saved views', async () => {
  const dom = await mount('/japanese/?lesson=ja-02');
  const lesson = lessonById['ja-02'];
  try {
    dom.click('[data-action="favorite-lesson"]');
    assert.equal(dom.query('[data-action="favorite-lesson"]').getAttribute('aria-pressed'), 'true');
    dom.click(`[data-action="favorite-word"][data-id="${lesson.words[0].id}"]`);
    assert.deepEqual(dom.state().favoriteLessons, [lesson.id]);
    assert.deepEqual(dom.state().favoriteWords, [lesson.words[0].id]);
    dom.click('[data-action="back-course"]');
    dom.click('[data-action="course-tab"][data-tab="saved"]');
    assert.equal(dom.all('.lesson-list .lesson-card').length, 1);
    assert.equal(dom.query('.lesson-list .lesson-card').dataset.lesson, lesson.id);
  } finally { await dom.close(); }
});

test('alphabet charts switch groups and the real five-question drill can finish', async () => {
  const dom = await mount('/japanese/?tab=alphabet');
  try {
    assert.equal(dom.all('.glyph-btn').length, 46);
    dom.click('[data-action="alphabet-group"][data-id="katakana"]');
    assert.equal(dom.all('.glyph-btn').length, 46);
    dom.click('[data-action="glyph"][data-index="1"]');
    assert.equal(dom.query('.big-glyph').textContent, 'イ');
    assert.equal(dom.query('.glyph-detail h4').textContent, 'インク');
    dom.click('[data-action="start-drill"]');
    const group = courseById.ja.alphabet.groups.find(item => item.id === 'katakana');
    for (let step = 0; step < 5; step++) {
      const symbol = dom.query('.drill-symbol').textContent;
      const answer = group.items.find(item => item.symbol === symbol).reading;
      const option = dom.all('[data-action="drill-choice"]').find(element => element.textContent === answer);
      assert(option, `A correct choice must exist for ${symbol}`);
      option.click();
      dom.click('[data-action="drill-check"]');
      assert.match(dom.query('.question-feedback').textContent, /答對了/);
      dom.click('[data-action="drill-next"]');
    }
    assert.match(dom.query('#alphabet-drill').textContent, /答對 5 \/ 5/);
    assert.equal(dom.raw(), null, 'Alphabet drill must not manufacture a completed course record');
  } finally { await dom.close(); }
});

test('a lesson word deck reveals answers and persists explicit review ratings', async () => {
  const dom = await mount('/vocabulary/?lesson=ja-01');
  const first = lessonById['ja-01'].words[0];
  try {
    assert.match(dom.text(), /隨課複習/);
    assert.equal(dom.query('.flash-word').textContent, first.term);
    assert.equal(dom.document.querySelector('.flash-answer'), null);
    assert.equal(dom.document.querySelector('[data-action="rate-word"]'), null);
    dom.click('[data-action="favorite-word"]');
    assert.deepEqual(dom.state().favoriteWords, [first.id]);
    assert.deepEqual(dom.state().words, {}, 'Favoriting is not equivalent to learning a word');
    dom.click('[data-action="flip-card"]');
    assert.equal(dom.query('.flash-meaning').textContent, first.meaning);
    assert.deepEqual(dom.state().words, {}, 'Revealing the answer must not mark the word learned');
    dom.click('[data-action="rate-word"][data-rating="good"]');
    assert.equal(dom.state().words[first.id].stage, 1);
    assert.equal(dom.state().words[first.id].reviews, 1);
    assert.deepEqual(dom.state().days[localDateKey()].reviewedWords, [first.id]);
    assert.equal(dom.query('.flash-word').textContent, lessonById['ja-01'].words[1].term);
    assert.match(dom.query('.deck-status').textContent, /第 2 \/ 4 張/);
    assert.match(dom.query('.vocab-aside').textContent, /逐漸熟悉的字0/);
  } finally { await dom.close(); }
});

test('saved vocabulary can be searched and practiced as its own deck', async () => {
  const dom = await mount('/vocabulary/?lesson=ja-01');
  const first = lessonById['ja-01'].words[0];
  const second = lessonById['ja-01'].words[1];
  try {
    dom.click('[data-action="favorite-word"]');
    dom.click('[data-action="flip-card"]');
    dom.click('[data-action="rate-word"][data-rating="good"]');
    dom.click('[data-action="favorite-word"]');
    dom.click('[data-action="vocab-mode"][data-mode="saved"]');
    assert.equal(dom.all('.vocab-row').length, 2);
    dom.type('#word-search', second.meaning);
    assert.equal(dom.all('.vocab-row').length, 1);
    assert.equal(dom.query('.vocab-row strong').textContent, second.term);
    dom.click('[data-action="review-favorites"]');
    assert.equal(dom.query('.flash-word').textContent, second.term);
    assert.match(dom.query('.deck-status').textContent, /第 1 \/ 1 張/);
    dom.click('[data-action="flip-card"]');
    dom.click('[data-action="rate-word"][data-rating="hard"]');
    assert.match(dom.query('#flash-focus').textContent, /複習完了/);
    assert.match(dom.query('#flash-focus').textContent, /複習了 1 張/);
    assert.equal(dom.state().words[first.id].reviews, 1);
    assert.equal(dom.state().words[second.id].reviews, 1);
    assert.equal(dom.state().words[second.id].stage, 0);
  } finally { await dom.close(); }
});

test('vocabulary language and level filters produce the requested target-language cards', async () => {
  const dom = await mount('/vocabulary/?lang=ko');
  try {
    assert.equal(dom.renderedSelection('#vocab-language'), 'ko');
    let id = dom.query('.flashcard [data-action="favorite-word"]').dataset.id;
    assert.equal(wordById[id].language, 'ko');
    dom.select('#vocab-language', 'ja');
    dom.select('#vocab-stage', '5');
    id = dom.query('.flashcard [data-action="favorite-word"]').dataset.id;
    assert.equal(wordById[id].language, 'ja');
    assert.equal(wordById[id].stageIndex, 5);
    assert.equal(dom.query('.flash-label .lang-tag').textContent, '日文');
    dom.click('[data-action="vocab-mode"][data-mode="due"]');
    assert.match(dom.text(), /目前沒有到期的字卡/);
  } finally { await dom.close(); }
});

test('due vocabulary displays real scheduled cards and removes them after review', async () => {
  const seeded = seedRecords({ reviewed: true, ago: 20 * 60 * 1000 });
  const dom = await mount('/vocabulary/?mode=due', { raw: seeded.raw });
  try {
    const word = lessonById['ja-01'].words[0];
    assert.equal(dom.query('.flash-word').textContent, word.term);
    assert.match(dom.query('.deck-status').textContent, /第 1 \/ 1 張/);
    dom.click('[data-action="flip-card"]');
    dom.click('[data-action="rate-word"][data-rating="good"]');
    assert.match(dom.query('#flash-focus').textContent, /複習完了/);
    dom.click('[data-action="restart-deck"]');
    assert.match(dom.text(), /目前沒有到期的字卡/);
  } finally { await dom.close(); }
});

test('the progress dashboard shows actual completions, time, answers, words and editable goals', async () => {
  const seeded = seedRecords({ completed: true, reviewed: true, seconds: 120, goal: 20 });
  const dom = await mount('/progress/', { raw: seeded.raw });
  try {
    const metrics = dom.all('.metric-value').map(element => element.textContent);
    assert.deepEqual(metrics, ['1/ 60 課', '2分鐘', '1天', '100%']);
    assert.equal(dom.all('.heat-day').length, 28);
    assert.equal(dom.query('.heat-day.today').getAttribute('data-intensity'), '1');
    assert.match(dom.query('.recent-list').textContent, /從あいうえお開始/);
    assert.match(dom.all('.course-progress')[0].textContent, /1 \/ 30 課/);
    assert.match(dom.all('.course-progress')[1].textContent, /0 \/ 30 課/);
    assert.equal(dom.renderedSelection('#daily-goal'), '20');
    dom.select('#daily-goal', '30');
    assert.equal(dom.state().goalMinutes, 30);
    assert.equal(dom.renderedSelection('#daily-goal'), '30');
    assert.match(dom.text(), /今日答題 3 次/);
    assert.match(dom.text(), /複習 1 個字/);
  } finally { await dom.close(); }
});

test('new learners see zero progress and no invented accuracy or reading history', async () => {
  const dom = await mount('/progress/');
  try {
    assert.deepEqual(dom.all('.metric-value').map(element => element.textContent), ['0/ 60 課', '0分鐘', '0天', '—尚未練習']);
    assert.equal(dom.document.querySelector('.recent-list'), null);
    assert.equal(dom.all('.heat-day[data-intensity="0"]').length, 28);
    assert.match(dom.query('#backup').textContent, /沒有帳號雲端同步/);
  } finally { await dom.close(); }
});

test('unsupported device speech produces an actionable message without changing learning progress', async () => {
  const dom = await mount('/japanese/?lesson=ja-01');
  try {
    const raw = dom.raw();
    dom.click('#lesson-examples [data-action="speak"]');
    assert.match(dom.query('#live-toast').textContent, /不支援裝置朗讀/);
    assert.equal(dom.query('#live-toast').hidden, false);
    assert.equal(dom.raw(), raw);
  } finally { await dom.close(); }
});

test('unknown or wrong-language lesson URLs fall back safely to the selected language', async () => {
  for (const path of ['/japanese/?lesson=does-not-exist', '/japanese/?lesson=ko-01', '/korean/?lesson=ja-01']) {
    const dom = await mount(path);
    try {
      assert.equal(dom.window.location.search, '');
      assert.equal(dom.document.querySelector('.lesson-hero'), null);
      assert.equal(dom.all('.lesson-list .lesson-card').length, 5);
      assert.match(dom.query('#live-toast').textContent, /找不到這一課/);
      assert.equal(dom.raw(), null);
    } finally { await dom.close(); }
  }
});

test('invalid vocabulary source parameters cannot resolve inherited object properties', async () => {
  for (const query of ['lesson=does-not-exist', 'word=does-not-exist', 'lesson=constructor', 'word=__proto__']) {
    const dom = await mount(`/vocabulary/?${query}`);
    try {
      assert(dom.query('.flash-word').textContent.length > 0, 'An invalid source should fall back to the daily deck');
      assert.match(dom.query('.deck-status').textContent, /第 1 \/ 10 張/);
      assert(!dom.text().includes('隨課複習'), 'Unknown sources must not appear to be a real lesson or word');
      assert.equal(dom.raw(), null);
    } finally { await dom.close(); }
  }
});

test('backup import requires confirmation and cancellation preserves every existing record', async () => {
  const seeded = seedRecords({ completed: true, reviewed: true, goal: 20 });
  const incoming = seedRecords({ goal: 5 });
  const dom = await mount('/progress/', { raw: seeded.raw });
  try {
    const raw = dom.raw();
    await dom.file(incoming.backup, '<img src=x>.json');
    assert.equal(dom.query('[role="dialog"]').getAttribute('aria-modal'), 'true');
    assert.match(dom.query('#import-description').textContent, /<img src=x>\.json/);
    assert.equal(dom.all('.modal img').length, 0, 'Backup filenames must be text, not HTML');
    assert.equal(dom.raw(), raw, 'Selecting a file must not yet import it');
    assert.equal(dom.document.activeElement.id, 'cancel-import');
    dom.click('[data-action="cancel-import"]');
    assert.equal(dom.document.querySelector('[role="dialog"]'), null);
    assert.equal(dom.raw(), raw);
    assert.equal(dom.document.activeElement.dataset.action, 'pick-import');
    await dom.file(incoming.backup);
    dom.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(dom.document.querySelector('[role="dialog"]'), null);
    assert.equal(dom.raw(), raw, 'Escape must also cancel without replacing data');
  } finally { await dom.close(); }
});

test('confirmed valid backups update the dashboard and invalid backups retain the current state', async () => {
  const incoming = seedRecords({ completed: true, reviewed: true, seconds: 60, goal: 10 });
  const dom = await mount('/progress/');
  try {
    await dom.file(incoming.backup);
    dom.click('[data-action="confirm-import"]');
    assert.equal(dom.document.querySelector('[role="dialog"]'), null);
    assert.match(dom.query('#live-toast').textContent, /備份已匯入/);
    assert.equal(dom.renderedSelection('#daily-goal'), '10');
    assert.match(dom.all('.metric-value')[0].textContent, /^1/);
    const raw = dom.raw();
    await dom.file('{not valid json');
    dom.click('[data-action="confirm-import"]');
    assert.match(dom.query('#live-toast').textContent, /不是有效的 JSON/);
    assert.equal(dom.raw(), raw);
    assert.equal(dom.renderedSelection('#daily-goal'), '10');
  } finally { await dom.close(); }
});
