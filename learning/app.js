import { courses, courseById, lessons, words, lessonById, wordById, catalogIds, courseLessons, nextLesson, searchText } from './catalog.js?v=9d08f4ee2670';
import { createStore, localDateKey, STORAGE_KEY } from './store.js?v=298dd99771b4';
import { speak, stopSpeech, setSpeechStatusHandler } from './speech.js?v=2c1d9d68f956';

const app = document.getElementById('app');
const page = document.body.dataset.page;
const language = document.body.dataset.language;
const course = courseById[language];
const store = createStore({ catalog: {
  ...catalogIds,
  questionIdsByLesson: Object.fromEntries(lessons.map(lesson => [lesson.id, lesson.questions.map(question => question.id)])),
} });
const ui = {
  tab: 'roadmap', stage: course?.stages[0]?.id || 'all', query: '',
  group: course?.alphabet.groups[0]?.id || '', glyph: 0, drill: null,
  choices: {}, checked: {}, vocabMode: 'today', vocabLanguage: 'all', vocabStage: 'auto',
  deck: [], deckIndex: 0, flipped: false, reviewed: 0, wordQuery: '',
  importText: null, importName: '', modal: false,
};

const shapes = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', back: '<path d="M19 12H5m6 6-6-6 6-6"/>',
  book: '<path d="M12 6v14M3 4.5c3-1 6-.5 9 1.5 3-2 6-2.5 9-1.5v14c-3-1-6-.5-9 1.5-3-2-6-2.5-9-1.5z"/>',
  japanese: '<path d="M5 4h14M12 2v4M8 6c1 5 4 9 10 12M17 6c-1 5-5 10-12 13M15 15l5 5"/>',
  korean: '<path d="M4 5h10M9 2v3M16 4v16M16 12h5"/><circle cx="9" cy="12" r="4"/><path d="M4 21h10"/>',
  cards: '<rect x="6" y="5" width="13" height="16" rx="2"/><path d="M5 17H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h11M10 10h5m-5 4h3"/>',
  progress: '<path d="M4 20h17M7 16v-5m5 5V5m5 11V8"/>', home: '<path d="m3 10 9-7 9 7M5 9v12h5v-6h4v6h5V9"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  check: '<path d="m5 12 4 4L19 6"/>', circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/>',
  leaf: '<path d="M19 3c0 10-1 17-9 17-6 0-7-6-4-10 3-4 8-3 13-7Z"/><path d="M4 22 15 10"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  flame: '<path d="M13 3c1 5-5 6-3 10 2 1 4-1 4-3 4 3 5 5 4 8a7 7 0 0 1-12-1c-2-6 3-7 7-14Z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plant: '<path d="M12 21v-9M12 13C4 13 3 8 4 4c6 0 9 3 8 9Zm0 3c0-6 3-9 9-8 0 6-3 9-9 8ZM7 22h10"/>',
  repeat: '<path d="M20 7H7a4 4 0 0 0-4 4m17-4-4-4m4 4-4 4M4 17h13a4 4 0 0 0 4-4M4 17l4 4m-4-4 4-4"/>',
};
const icon = (name, extra = '') => `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${shapes[name] || shapes.book}</svg>`;
const e = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const n = value => Number(value || 0).toLocaleString('zh-TW');
const languagePath = id => id === 'ja' ? '../japanese/' : '../korean/';
const lessonUrl = lesson => `${languagePath(lesson.language)}?lesson=${encodeURIComponent(lesson.id)}`;
const currentLesson = () => {
  const lesson = lessonById[new URLSearchParams(location.search).get('lesson')];
  return lesson?.language === language ? lesson : null;
};
const percent = (part, total) => total ? Math.round(part / total * 100) : 0;
const minLabel = seconds => seconds > 0 && seconds < 60 ? '不到 1' : String(Math.floor(seconds / 60));
const dateLabel = date => new Date(date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
const doneCount = (items, state) => items.filter(item => state.lessons[item.id]?.completedAt).length;
const routeNames = { ja: '日文學堂', ko: '韓文學堂', vocabulary: '今日單字', progress: '學習進度' };
let toastTimer;

function toast(message, tone = '') {
  const element = document.getElementById('live-toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.dataset.tone = tone;
  element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 5000);
}
setSpeechStatusHandler(toast);

function navigation(mobile = false) {
  const active = page === 'course' ? language : page;
  const links = [
    ['ja', '日文學堂', 'japanese', '../japanese/'],
    ['ko', '韓文學堂', 'korean', '../korean/'],
    ['vocabulary', '今日單字', 'cards', '../vocabulary/'],
    ['progress', '學習進度', 'progress', '../progress/'],
  ];
  return links.map(([id, label, symbol, href]) => `<a class="${mobile ? '' : 'nav-link '}${active === id ? 'active' : ''}" href="${href}" ${active === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${active === id && !mobile ? '<i class="nav-dot"></i>' : ''}</a>`).join('');
}

function goalPill(state) {
  const seconds = state.days[localDateKey()]?.seconds || 0;
  return `<a class="goal-pill" href="../progress/" aria-label="今日學習 ${Math.floor(seconds / 60)} 分鐘，目標 ${state.goalMinutes} 分鐘">${icon('target', 'sm')}<span data-live-goal>${Math.floor(seconds / 60)} / ${state.goalMinutes} 分鐘</span></a>`;
}

function shell(content) {
  const state = store.getState();
  const title = routeNames[language || page];
  const lesson = currentLesson();
  return `
    <aside class="sidebar" aria-label="主要導覽">
      <a class="brand" href="../"><span class="brand-mark">b.</span><span><strong>Body</strong><small>LEARN A LITTLE, DAILY</small></span></a>
      <p class="nav-caption">我的學習空間</p><nav class="nav-list">${navigation()}</nav>
      <div class="sidebar-rule"></div><a class="nav-link home-link" href="../">${icon('home')}回到 Body 首頁</a>
      <div class="side-garden">${icon('plant')}<h3>每天一點點，就很好。</h3><p>從第一個字開始，<br>慢慢走進另一種語言的世界。</p></div>
      <div class="sidebar-footer"><span class="user-avatar">B</span><div><strong>我的學習筆記</strong><small>儲存在這台裝置</small></div></div>
    </aside>
    <header class="mobile-top"><a class="mobile-brand" href="../">Body<span>語言學習室</span></a>${goalPill(state)}</header>
    <main class="main" id="main-content"><div class="page-width">
      <div class="topbar"><div class="breadcrumb"><a href="../">Body</a>${icon('chevron', 'sm')}<b>${e(title)}</b>${lesson ? `${icon('chevron', 'sm')}<span>第 ${lesson.order} 課</span>` : ''}</div><div class="top-meta"><span class="today-date">${new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })}</span>${goalPill(state)}</div></div>
      ${!store.storageAvailable ? '<div class="storage-notice" role="status">這個瀏覽器目前無法保存紀錄。你可以繼續學習，離開前請到學習進度匯出備份。</div>' : ''}
      ${content}
      <footer class="page-footer"><span>BODY LANGUAGE STUDIO · 給每一天的小小進步</span><a href="../progress/#backup">紀錄保存在本機 · 匯出備份 ${icon('arrow', 'sm')}</a></footer>
    </div></main>
    <nav class="mobile-nav" aria-label="手機導覽">${navigation(true)}</nav>
    ${ui.modal ? importModal() : ''}`;
}

function render(preserveFocus = false) {
  const focused = preserveFocus ? document.activeElement : null;
  const focusedId = focused?.id;
  const selection = focused && 'selectionStart' in focused ? focused.selectionStart : null;
  let content;
  if (page === 'course') content = currentLesson() ? renderLesson(currentLesson()) : renderCourse();
  else if (page === 'vocabulary') content = renderVocabulary();
  else content = renderProgress();
  app.innerHTML = shell(content);
  if (focusedId) {
    const target = document.getElementById(focusedId);
    target?.focus({ preventScroll: true });
    if (selection !== null && target?.setSelectionRange) target.setSelectionRange(selection, selection);
  }
  if (ui.modal) document.getElementById('cancel-import')?.focus();
}

function courseArt() {
  const japanese = language === 'ja';
  return `<div class="hero-art" aria-hidden="true"><div class="art-circle"></div><span class="art-spark">✦</span><div class="art-card one"><small>${japanese ? 'HIRAGANA' : 'HANGEUL'}</small><strong>${japanese ? 'あ' : '한'}</strong><span>${japanese ? 'a · 一切的開始' : 'han · 第一個音節'}</span></div><div class="art-card two"><small>${japanese ? 'EVERYDAY WORDS' : 'EVERYDAY WORDS'}</small><strong>${japanese ? '日' : '봄'}</strong><span>${japanese ? 'ひ · 每一天' : 'bom · 春天'}</span></div><span class="art-spark second">✳</span><span class="art-note">${japanese ? 'こんにちは，新的一天。' : '안녕，新的開始。'}</span></div>`;
}

function renderCourse() {
  const state = store.getState();
  const all = courseLessons(language);
  const done = doneCount(all, state);
  const upcoming = nextLesson(language, state);
  const started = all.some(lesson => !!state.lessons[lesson.id]);
  const savedCount = state.favoriteLessons.filter(id => lessonById[id]?.language === language).length;
  const wordCount = words.filter(word => word.language === language).length;
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow">${language === 'ja' ? 'JAPANESE' : 'KOREAN'} · YOUR LEARNING JOURNEY</p><h1>${language === 'ja' ? '把第一句<span class="hero-language">日文</span>，<br>變成日常。' : '從 <span class="hero-language">안녕하세요</span>，<br>聊到你的世界。'}</h1><p class="hero-description">${language === 'ja' ? '從五十音到進階表達，用有情境的例句和小練習，<br>一步一步，把想說的話說出來。' : '從子音、母音到自然對話，把每一個小小的理解，<br>慢慢拼成自己的韓文能力。'}</p><div class="hero-actions"><a class="btn primary" href="${lessonUrl(upcoming)}" data-lesson="${upcoming.id}">${icon('book', 'sm')}${done === all.length ? '回顧課程' : started ? '繼續學習' : '開始第一課'}${icon('arrow', 'sm')}</a><button class="btn text" data-action="course-tab" data-tab="alphabet">先認識${language === 'ja' ? '五十音' : '韓文字母'} ${icon('arrow', 'sm')}</button></div></div>${courseArt()}</section>
    <div class="overview-strip"><div class="overview-stat"><span class="stat-icon">${icon('book')}</span><div><strong>${all.length}<small>堂主題課</small></strong><p>講解、對話、練習一次學</p></div></div><div class="overview-stat"><span class="stat-icon warm">${icon('plant')}</span><div><strong>${course.stages.length}<small>個學習階段</small></strong><p>零基礎 → 進階表達</p></div></div><div class="overview-stat"><span class="stat-icon gold">${icon('cards')}</span><div><strong>${wordCount}<small>張情境字卡</small></strong><p>搭配例句與間隔複習</p></div></div></div>
    <div class="workspace"><div class="workspace-main"><div class="tabs-row"><div class="tabs" aria-label="課程檢視"><button class="tab ${ui.tab === 'roadmap' ? 'active' : ''}" data-action="course-tab" data-tab="roadmap" aria-pressed="${ui.tab === 'roadmap'}">${icon('book', 'sm')}學習路線</button><button class="tab ${ui.tab === 'alphabet' ? 'active' : ''}" data-action="course-tab" data-tab="alphabet" aria-pressed="${ui.tab === 'alphabet'}">${icon(language === 'ja' ? 'japanese' : 'korean', 'sm')}字母練習</button><button class="tab ${ui.tab === 'saved' ? 'active' : ''}" data-action="course-tab" data-tab="saved" aria-pressed="${ui.tab === 'saved'}">${icon('star', 'sm')}收藏<span class="count">${savedCount || ''}</span></button></div>${ui.tab !== 'alphabet' ? `<label class="search">${icon('search')}<span class="sr-only">搜尋課程</span><input id="course-search" type="search" placeholder="搜尋主題、文法…" value="${e(ui.query)}" autocomplete="off"></label>` : ''}</div>
    ${ui.tab === 'alphabet' ? renderAlphabet() : renderCourseList(state, all, upcoming)}
    <details class="info-disclosure"><summary>關於這條學習路線與教材參考</summary><p>這是 Body 自編的六階段主題學習路線，每課以「學完能做什麼」為目標。可自由選課；完成一課的練習並達到 80% 後，才會記入完成進度。進階主題供循序練習，課程階段不直接等同 JLPT 或 TOPIK 級數。</p><p>${e(course.alphabet.intro)}</p><p>裝置朗讀使用瀏覽器與系統提供的日語／韓語聲音，音色與可用性依裝置而異。羅馬字或讀音用來輔助辨識，請搭配聲音與文字一起練習。</p><ul class="sources-list">${(course.sources || []).map(source => `<li><a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)} ↗</a></li>`).join('')}</ul></details>
    </div><aside class="workspace-aside" aria-label="課程概況"><section class="panel"><div class="panel-head"><h3>你的學習旅程</h3>${icon('plant', 'sm')}</div><div class="progress-ring" style="--percent:${percent(done, all.length)}"><span>${percent(done, all.length)}<small>%</small></span></div><p class="progress-caption">已完成 ${done} / ${all.length} 堂課</p><div class="aside-note">${icon('info')}<span>小練習答完並通過後，記得按「完成這一課」。</span></div></section><section class="panel accent"><p class="tiny-label">A LITTLE EVERY DAY</p><h3 style="margin-top:10px">今天，留一點時間給自己</h3><p>用幾張單字卡，把剛學過的內容再想起來一次。</p><a class="btn wide" href="../vocabulary/?lang=${language}">複習${course.language}單字 ${icon('arrow', 'sm')}</a></section><section class="panel"><h3>跟著自己的步調</h3><ul class="check-list"><li>${icon('check')}先看重點，再聽例句</li><li>${icon('check')}說一次，再做小練習</li><li>${icon('check')}不熟的字，留給明天複習</li></ul></section></aside></div>`;
}

function renderCourseList(state, all, upcoming) {
  const term = searchText(ui.query);
  const filtered = all.filter(lesson => {
    if (ui.tab === 'saved' && !state.favoriteLessons.includes(lesson.id)) return false;
    if (!term && ui.tab !== 'saved' && ui.stage !== 'all' && lesson.stageId !== ui.stage) return false;
    return !term || searchText([lesson.title, lesson.subtitle, lesson.canDo, ...lesson.points.map(point => point.title + ' ' + point.body)].join(' ')).includes(term);
  });
  const activeStage = course.stages.find(stage => stage.id === ui.stage);
  const stageButtons = `<div class="section-heading"><div><h2>一步一步，走得更遠</h2><p>找到自己的起點，也可以自由探索下一個階段。</p></div><button class="chip ${ui.stage === 'all' ? 'active' : ''}" data-action="stage" data-stage="all">全部 ${all.length} 課</button></div><div class="stages">${course.stages.map((stage, index) => {
    const list = all.filter(lesson => lesson.stageId === stage.id);
    const completed = doneCount(list, state);
    return `<button class="stage ${ui.stage === stage.id ? 'active' : ''}" data-action="stage" data-stage="${stage.id}" aria-pressed="${ui.stage === stage.id}"><span class="stage-top"><span>STAGE ${String(index + 1).padStart(2, '0')}</span><span>${completed}/${list.length}</span></span><strong>${e(stage.label)}</strong><p>${e(stage.title)}</p><span class="stage-track"><i style="width:${percent(completed, list.length)}%"></i></span></button>`;
  }).join('')}</div>`;
  let heading;
  if (term) heading = `<div class="section-heading"><div><h2>搜尋「${e(ui.query)}」</h2><p>找到 ${filtered.length} 堂${ui.tab === 'saved' ? '收藏' : ''}課程</p></div></div>`;
  else if (ui.tab === 'saved') heading = `<div class="section-heading"><div><h2>想再回來讀的課</h2><p>在課程頁按星星，就能放進這裡。</p></div></div>`;
  else if (activeStage) heading = `<div class="stage-description"><span class="stage-num">${String(course.stages.indexOf(activeStage) + 1).padStart(2, '0')}</span><div><h3>${e(activeStage.title)}</h3><p>${e(activeStage.description)}</p><div class="outcome-list">${activeStage.outcomes.map(outcome => `<span class="outcome-tag">${icon('check', 'sm')}${e(outcome)}</span>`).join('')}</div></div></div>`;
  else heading = '<div class="section-heading"><div><h2>完整學習路線</h2><p>從文字到表達，每一課都可以直接開始。</p></div></div>';
  return `${ui.tab === 'roadmap' && !term ? stageButtons : ''}${heading}<div class="lesson-list">${filtered.map(lesson => lessonCard(lesson, state, upcoming)).join('') || emptyState(term ? '沒有找到這個主題' : '還沒有收藏課程', term ? '試試「介紹」、「時間」、「理由」等關鍵字。' : '先打開一堂感興趣的課，再按右上角的星星。', 'book')}</div>`;
}

function lessonCard(lesson, state, upcoming) {
  const completed = !!state.lessons[lesson.id]?.completedAt;
  return `<a class="lesson-card ${completed ? 'done' : lesson.id === upcoming.id ? 'next' : ''}" href="${lessonUrl(lesson)}" data-lesson="${lesson.id}"><span class="lesson-number">${completed ? icon('check') : String(lesson.order).padStart(2, '0')}</span><div class="lesson-copy"><h4>${e(lesson.title)}</h4><p>${e(lesson.subtitle)}</p><div class="lesson-meta"><span>${icon('clock')}${lesson.duration} 分鐘</span><span>${lesson.questions.length} 題練習</span>${ui.stage === 'all' || ui.query || ui.tab === 'saved' ? `<span>${e(lesson.stage.label)}</span>` : ''}${completed ? '<span class="lesson-status">已完成</span>' : lesson.id === upcoming.id ? '<span class="lesson-status">從這裡開始</span>' : ''}</div></div><span class="lesson-arrow">${icon('arrow')}</span></a>`;
}

function emptyState(title, description, symbol = 'plant', action = '') {
  return `<div class="empty"><div class="empty-symbol">${icon(symbol, 'lg')}</div><h3>${e(title)}</h3><p>${e(description)}</p>${action}</div>`;
}

function audioButtons(text, locale, slow = false) {
  return `<div class="audio-actions"><button class="audio-btn" data-action="speak" data-text="${e(text)}" data-locale="${locale}" aria-label="朗讀 ${e(text)}" title="使用裝置朗讀">${icon('sound')}</button>${slow ? `<button class="audio-btn slow" data-action="speak" data-text="${e(text)}" data-locale="${locale}" data-slow="true" aria-label="慢速朗讀 ${e(text)}">慢速</button>` : ''}</div>`;
}

function wordTile(word, state) {
  const liked = state.favoriteWords.includes(word.id);
  return `<article class="word-tile"><div class="word-tools">${audioButtons(word.term, word.locale)}<button class="bookmark" data-action="favorite-word" data-id="${word.id}" aria-pressed="${liked}" aria-label="${liked ? '取消收藏' : '收藏'} ${e(word.term)}">${icon('star')}</button></div><p class="original" lang="${word.language}">${e(word.term)}</p><p class="reading">${e(word.reading)}</p><p class="translation">${e(word.meaning)}</p><div class="word-example"><span lang="${word.language}">${e(word.example)}</span><small>${e(word.exampleMeaning)}</small></div></article>`;
}

function renderLesson(lesson) {
  const state = store.getState();
  const saved = state.favoriteLessons.includes(lesson.id);
  const completed = state.lessons[lesson.id]?.completedAt;
  const checked = lesson.questions.filter(question => ui.checked[question.id]);
  const correct = checked.filter(question => ui.choices[question.id] === question.answer).length;
  const ready = checked.length === lesson.questions.length && correct / lesson.questions.length >= .8;
  const list = courseLessons(language);
  const index = list.findIndex(item => item.id === lesson.id);
  const next = list[index + 1];
  document.title = `${lesson.title} · ${course.language}學堂 · Body`;
  return `<div class="lesson-topline"><a href="${languagePath(language)}" class="back-link" data-action="back-course">${icon('back', 'sm')}回到${course.language}學習路線</a><button class="bookmark" data-action="favorite-lesson" data-id="${lesson.id}" aria-pressed="${saved}">${icon('star', 'sm')}${saved ? '已收藏' : '收藏這一課'}</button></div>
    <header class="lesson-hero"><div class="lesson-kicker"><span class="pill">${e(lesson.stage.label)}</span><span>LESSON ${String(lesson.order).padStart(2, '0')}</span><span>· 約 ${lesson.duration} 分鐘</span></div><h1>${e(lesson.title)}</h1><p class="can-do">學完這一課，我可以：${e(lesson.canDo)}</p><nav class="lesson-outline" aria-label="課程段落"><a href="#lesson-points">01 學習重點</a><a href="#lesson-examples">02 情境例句</a><a href="#lesson-dialogue">03 小對話</a><a href="#lesson-words">04 隨課單字</a><a href="#lesson-practice">05 動手練習</a></nav>${completed ? `<p class="already-complete">${icon('circleCheck', 'sm')}這一課已於 ${dateLabel(completed)} 完成，可以隨時回來複習。</p>` : ''}</header>
    <article class="lesson-body">
      <section class="lesson-section" id="lesson-points"><h2><span class="section-n">01</span>先抓住這些重點</h2><div class="point-grid">${lesson.points.map(point => `<article class="point-card"><h3>${e(point.title)}</h3><p>${e(point.body)}</p></article>`).join('')}</div></section>
      <section class="lesson-section" id="lesson-examples"><h2><span class="section-n">02</span>放進句子，就懂了</h2><div class="example-stack">${lesson.examples.map(example => `<article class="example"><div><p class="original" lang="${language}">${e(example.original)}</p><p class="reading">${e(example.reading)}</p><p class="translation">${e(example.meaning)}</p>${example.note ? `<p class="example-note">${e(example.note)}</p>` : ''}</div>${audioButtons(example.original, lesson.locale, true)}</article>`).join('')}</div></section>
      <section class="lesson-section" id="lesson-dialogue"><h2><span class="section-n">03</span>試著把對話說出來</h2><div class="dialogue">${lesson.dialogue.map(line => `<div class="dialogue-line"><span class="speaker">${e(line.speaker)}</span><div><p class="original" lang="${language}">${e(line.original)}</p><p class="reading">${e(line.reading)}</p><p class="translation">${e(line.meaning)}</p></div>${audioButtons(line.original, lesson.locale)}</div>`).join('')}</div></section>
      <section class="lesson-section" id="lesson-words"><h2><span class="section-n">04</span>帶走這幾個單字</h2><div class="word-grid">${lesson.words.map(word => wordTile(wordById[word.id], state)).join('')}</div><div class="section-link"><a class="btn text" href="../vocabulary/?lesson=${lesson.id}">用字卡複習這一課 ${icon('arrow', 'sm')}</a></div></section>
      <section class="lesson-section" id="lesson-practice"><h2><span class="section-n">05</span>換你試試看</h2><p class="alphabet-intro">選好答案後按「檢查答案」，看看自己理解了多少。答錯可以看解析再試一次；每次檢查都會記錄在答題統計裡。</p>${lesson.questions.map((question, index) => questionView(question, index)).join('')}
      <div class="completion-card"><div><h3>${ready ? '做得好，這一課學會了。' : '把理解，變成自己的能力。'}</h3><p>已檢查 ${checked.length} / ${lesson.questions.length} 題 · 目前答對 ${correct} 題${ready ? '' : ' · 達到 80% 即可完成'}</p></div><div class="actions"><button class="btn primary" data-action="complete-lesson" data-id="${lesson.id}" ${ready ? '' : 'disabled'}>${icon('check', 'sm')}${completed ? '更新練習紀錄' : '完成這一課'}</button>${completed && next ? `<a class="btn" href="${lessonUrl(next)}" data-lesson="${next.id}">下一課 ${icon('arrow', 'sm')}</a>` : ''}</div></div></section>
    </article><nav class="lesson-navigator" aria-label="前後課程">${index > 0 ? `<a href="${lessonUrl(list[index - 1])}" data-lesson="${list[index - 1].id}">← 上一課：${e(list[index - 1].title)}</a>` : '<span></span>'}${next ? `<a href="${lessonUrl(next)}" data-lesson="${next.id}">下一課：${e(next.title)} →</a>` : `<a href="../progress/">查看我的學習進度 →</a>`}</nav>`;
}

function questionView(question, index) {
  const checked = !!ui.checked[question.id];
  const selected = ui.choices[question.id];
  const correct = selected === question.answer;
  return `<fieldset class="question" id="question-${question.id}"><legend><span class="qnum">Q${String(index + 1).padStart(2, '0')}</span>${e(question.prompt)}</legend><div class="choices">${question.choices.map((choice, option) => `<label class="choice ${checked && option === question.answer ? 'right' : checked && selected === option && !correct ? 'wrong' : ''}"><input id="${question.id}-${option}" type="radio" name="${question.id}" value="${option}" data-question="${question.id}" ${selected === option ? 'checked' : ''} ${checked ? 'disabled' : ''}><span>${e(choice)}</span></label>`).join('')}</div>${checked ? `<div class="question-feedback ${correct ? '' : 'wrong'}" role="status"><strong>${correct ? '答對了！' : `再想一下。正確答案是：${e(question.choices[question.answer])}`}</strong>${e(question.explanation)}</div>` : ''}<div class="question-actions"><span class="question-count">${checked ? correct ? '已掌握這個重點' : '讀完解析，再挑戰一次' : '先選一個答案'}</span><button class="btn small ${checked && correct ? 'soft' : 'primary'}" data-action="${checked && !correct ? 'retry-question' : 'grade-question'}" data-id="${question.id}" ${selected === undefined || (checked && correct) ? 'disabled' : ''}>${checked ? correct ? '已答對 ✓' : '再試一次' : '檢查答案'}</button></div></fieldset>`;
}

function renderAlphabet() {
  const group = course.alphabet.groups.find(item => item.id === ui.group) || course.alphabet.groups[0];
  const glyph = group.items[Math.min(ui.glyph, group.items.length - 1)];
  return `<div class="section-heading"><div><h2>${language === 'ja' ? '從一個音，打開日文' : '把字母，拼成第一句話'}</h2><p>點一個字，看看讀音和例詞；準備好了就來做個小測驗。</p></div></div><div class="alphabet-tabs">${course.alphabet.groups.map(item => `<button class="chip ${group.id === item.id ? 'active' : ''}" data-action="alphabet-group" data-id="${item.id}" aria-pressed="${group.id === item.id}">${e(item.title)} <span>${item.items.length}</span></button>`).join('')}</div><p class="alphabet-intro">${e(group.description)}</p>
    <div class="alphabet-layout"><div class="alphabet-grid" aria-label="${e(group.title)}">${group.items.map((item, index) => `<button class="glyph-btn ${index === ui.glyph ? 'active' : ''}" data-action="glyph" data-index="${index}" aria-pressed="${index === ui.glyph}" aria-label="${e(item.symbol)}，${e(item.reading)}"><strong lang="${language}">${e(item.symbol)}</strong><small>${e(item.reading)}</small></button>`).join('')}</div><div class="glyph-detail" aria-live="polite"><div class="big-glyph" lang="${language}">${e(glyph.symbol)}</div><div class="glyph-reading">${e(glyph.reading)}</div><h4 lang="${language}">${e(glyph.example)}</h4><p>${e(glyph.meaning)}</p><button class="btn small" data-action="speak" data-text="${e(glyph.example)}" data-locale="${course.locale}">${icon('sound', 'sm')}聽例詞</button></div></div>
    ${ui.drill ? renderDrill() : `<div class="panel accent" style="margin-top:22px"><div class="panel-head"><div><h3>來一組字母熱身？</h3><p>從「${e(group.title)}」抽出 5 題，練習辨認讀音。</p></div>${icon('spark')}</div><button class="btn" data-action="start-drill">開始 5 題練習 ${icon('arrow', 'sm')}</button></div>`}<p class="drill-caption">字母熱身用來熟悉文字，不會直接標記課程完成。裝置朗讀播放的是例詞，請留意字母在詞中的實際聲音。</p>`;
}

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function startDrill() {
  const group = course.alphabet.groups.find(item => item.id === ui.group) || course.alphabet.groups[0];
  const selected = shuffled(group.items).slice(0, 5);
  ui.drill = {
    index: 0, correct: 0, checked: false, selected: null,
    items: selected.map(item => {
      const others = [...new Set(group.items.map(other => other.reading))].filter(reading => reading !== item.reading);
      return { ...item, choices: shuffled([item.reading, ...shuffled(others).slice(0, 3)]) };
    }),
  };
}

function renderDrill() {
  const drill = ui.drill;
  if (drill.index >= drill.items.length) return `<section class="drill-box" id="alphabet-drill"><p class="eyebrow">LITTLE PRACTICE, REAL PROGRESS</p><h3 style="margin-top:13px">這一組答對 ${drill.correct} / ${drill.items.length} 題</h3><p class="alphabet-intro" style="margin-top:9px">${drill.correct === drill.items.length ? '字母越看越熟了！試著把例詞跟著唸一次。' : '不熟悉的字再看一次，練習幾回就會慢慢記住。'}</p><button class="btn" data-action="start-drill">${icon('repeat', 'sm')}再練一組</button></section>`;
  const item = drill.items[drill.index];
  const correct = item.choices[drill.selected] === item.reading;
  return `<section class="drill-box" id="alphabet-drill"><div class="panel-head"><h3>這個字怎麼讀？</h3><span class="tiny-label">${drill.index + 1} / ${drill.items.length}</span></div><p class="drill-symbol" lang="${language}">${e(item.symbol)}</p><div class="drill-options">${item.choices.map((choice, index) => `<button class="${drill.selected === index ? 'selected' : ''} ${drill.checked && choice === item.reading ? 'correct' : drill.checked && drill.selected === index ? 'incorrect' : ''}" data-action="drill-choice" data-index="${index}" aria-pressed="${drill.selected === index}" ${drill.checked ? 'disabled' : ''}>${e(choice)}</button>`).join('')}</div>${drill.checked ? `<p class="question-feedback ${correct ? '' : 'wrong'}" role="status">${correct ? '答對了！' : '再記一次：'} ${e(item.symbol)} 的輔助讀音是 ${e(item.reading)}。例詞：${e(item.example)}（${e(item.meaning)}）。</p>` : ''}<div class="question-actions"><span class="question-count">${drill.checked ? '跟著例詞讀一次吧' : '選出對應的輔助讀音'}</span><button class="btn small primary" data-action="${drill.checked ? 'drill-next' : 'drill-check'}" ${drill.selected === null ? 'disabled' : ''}>${drill.checked ? drill.index === drill.items.length - 1 ? '看看結果' : '下一題' : '檢查答案'}</button></div></section>`;
}

function customVocabularySource() {
  const params = new URLSearchParams(location.search);
  const fromLesson = lessonById[params.get('lesson')];
  const fromWord = wordById[params.get('word')];
  if (fromLesson) return { title: fromLesson.title, words: fromLesson.words.map(word => wordById[word.id]) };
  if (fromWord) return { title: fromWord.term, words: [fromWord] };
  return null;
}

function filteredWords({ useAuto = false } = {}) {
  const state = store.getState();
  return words.filter(word => {
    if (ui.vocabLanguage !== 'all' && word.language !== ui.vocabLanguage) return false;
    if (ui.vocabStage !== 'all' && ui.vocabStage !== 'auto' && word.stageIndex !== Number(ui.vocabStage)) return false;
    if (useAuto && ui.vocabStage === 'auto') {
      const list = courseLessons(word.language);
      const firstUnfinished = list.find(lesson => !state.lessons[lesson.id]?.completedAt);
      const recommended = firstUnfinished?.stageIndex ?? courseById[word.language].stages.length - 1;
      if (word.stageIndex !== recommended) return false;
    }
    return true;
  });
}

function rebuildDeck() {
  const custom = customVocabularySource();
  const state = store.getState();
  let pool;
  if (custom && ui.vocabMode === 'today') pool = custom.words;
  else if (ui.vocabMode === 'due') {
    const due = new Set(store.getDueWords());
    pool = filteredWords().filter(word => due.has(word.id)).sort((a, b) => new Date(state.words[a.id].dueAt) - new Date(state.words[b.id].dueAt));
  } else if (ui.vocabMode === 'saved') pool = filteredWords().filter(word => state.favoriteWords.includes(word.id));
  else {
    const available = filteredWords({ useAuto: true });
    if (ui.vocabLanguage === 'all') pool = courses.flatMap(item => store.getDailySelection(available.filter(word => word.language === item.id).map(word => word.id), 5, item.id + ':' + ui.vocabStage).map(id => wordById[id]));
    else pool = store.getDailySelection(available.map(word => word.id), 10, ui.vocabLanguage + ':' + ui.vocabStage).map(id => wordById[id]);
  }
  ui.deck = pool.map(word => word.id);
  ui.deckIndex = 0;
  ui.flipped = false;
  ui.reviewed = 0;
}

function renderVocabulary() {
  const state = store.getState();
  const stats = store.getStats();
  const dueCount = store.getDueWords().length;
  const custom = customVocabularySource();
  const word = wordById[ui.deck[ui.deckIndex]];
  const stageLabels = ['零基礎', '入門', '基礎生活', '初中階', '中階', '進階'];
  const pool = filteredWords().filter(item => state.favoriteWords.includes(item.id) && (!ui.wordQuery || searchText([item.term, item.reading, item.meaning].join(' ')).includes(searchText(ui.wordQuery))));
  return `<section class="hero compact-hero"><div class="hero-copy"><p class="eyebrow">DAILY WORDS · LITTLE BY LITTLE</p><h1>今天，也記住一點點。</h1><p class="hero-description">翻開一張字卡，把單字放進生活裡。<br>先想一想，再看答案，讓每一次複習都有收穫。</p></div><div class="hero-badge" aria-hidden="true">字</div></section>
    <div class="vocab-toolbar"><div class="select-group"><label class="sr-only" for="vocab-language">單字語言</label><select class="select-field" id="vocab-language"><option value="all" ${ui.vocabLanguage === 'all' ? 'selected' : ''}>日文 ＋ 韓文</option><option value="ja" ${ui.vocabLanguage === 'ja' ? 'selected' : ''}>日文</option><option value="ko" ${ui.vocabLanguage === 'ko' ? 'selected' : ''}>韓文</option></select><label class="sr-only" for="vocab-stage">單字程度</label><select class="select-field" id="vocab-stage"><option value="auto" ${ui.vocabStage === 'auto' ? 'selected' : ''}>依學習進度</option><option value="all" ${ui.vocabStage === 'all' ? 'selected' : ''}>全部程度</option>${stageLabels.map((label, index) => `<option value="${index}" ${ui.vocabStage === String(index) ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="tabs" aria-label="單字練習模式"><button class="tab ${ui.vocabMode === 'today' ? 'active' : ''}" data-action="vocab-mode" data-mode="today" aria-pressed="${ui.vocabMode === 'today'}">今日精選</button><button class="tab ${ui.vocabMode === 'due' ? 'active' : ''}" data-action="vocab-mode" data-mode="due" aria-pressed="${ui.vocabMode === 'due'}">到期複習 <span class="count">${dueCount}</span></button><button class="tab ${ui.vocabMode === 'saved' ? 'active' : ''}" data-action="vocab-mode" data-mode="saved" aria-pressed="${ui.vocabMode === 'saved'}">收藏字庫 <span class="count">${state.favoriteWords.length}</span></button></div></div>
    ${custom && ui.vocabMode === 'today' ? `<div class="section-heading"><div><h2>隨課複習</h2><p>來自「${e(custom.title)}」· 共 ${custom.words.length} 張字卡</p></div><button class="chip" data-action="clear-source">回到今日精選 ${icon('close', 'sm')}</button></div>` : ui.vocabMode === 'practice' ? `<div class="section-heading"><div><h2>收藏字卡複習</h2><p>這一組有 ${ui.deck.length} 個你收藏的單字。</p></div><button class="chip" data-action="vocab-mode" data-mode="saved">回到收藏字庫 ${icon('back', 'sm')}</button></div>` : ''}
    <div class="vocab-layout"><div>
      ${ui.vocabMode === 'saved' ? renderSavedVocabulary(pool, state) : word ? renderFlashcard(word, state) : ui.deck.length ? `<div class="flashcard" id="flash-focus" tabindex="-1"><p class="eyebrow" style="margin-top:35px">TODAY'S LITTLE ACHIEVEMENT</p><div class="empty-symbol" style="margin-top:25px">${icon('plant', 'lg')}</div><h2>這一組，複習完了。</h2><p class="alphabet-intro" style="margin-top:13px">你剛剛複習了 ${ui.reviewed} 張字卡。<br>不熟的字會再回來，記得的字會隔久一點再見。</p><div class="hero-actions" style="justify-content:center"><button class="btn" data-action="restart-deck">再練一次 ${icon('repeat', 'sm')}</button><a class="btn primary" href="../progress/">看看今天的累積 ${icon('arrow', 'sm')}</a></div></div>` : emptyState(ui.vocabMode === 'due' ? '目前沒有到期的字卡' : '這個範圍還沒有字卡', ui.vocabMode === 'due' ? '先到今日精選學幾個字；到複習時間時，它們會出現在這裡。' : '試著切換語言或程度，再找一組適合自己的單字。', 'cards', `<button class="btn primary" data-action="vocab-mode" data-mode="today">看看今日精選 ${icon('arrow', 'sm')}</button>`)}
      ${ui.vocabMode !== 'saved' && ui.deck.length ? `<div class="deck-status"><span>${ui.deckIndex >= ui.deck.length ? '已完成這一組' : `第 ${ui.deckIndex + 1} / ${ui.deck.length} 張`}</span><span>本組已複習 ${ui.reviewed} 張</span></div><div class="linear-progress" role="progressbar" aria-label="本組字卡複習進度" aria-valuenow="${ui.reviewed}" aria-valuemin="0" aria-valuemax="${ui.deck.length}"><span style="width:${percent(ui.reviewed, ui.deck.length)}%"></span></div>` : ''}
    </div><aside class="vocab-aside"><section class="panel"><p class="tiny-label">YOUR WORD GARDEN</p><h3 style="margin-top:9px">每天複習，慢慢熟悉</h3><div class="vocab-side-stat"><span>今天已複習</span><strong>${stats.reviewedToday}<small style="font-size:10px;font-weight:400;margin-left:4px">個字</small></strong></div><div class="vocab-side-stat"><span>等待複習</span><strong>${dueCount}</strong></div><div class="vocab-side-stat"><span>逐漸熟悉的字</span><strong>${stats.masteredWords}</strong></div><div class="aside-note">${icon('info')}<span>同一個字在不同天多次記住後，才會計入「逐漸熟悉」。翻開答案不會直接算學會。</span></div></section><section class="panel accent" style="margin-top:18px"><h3>為什麼過幾天再複習？</h3><p>給記憶一點間隔，也給自己一次重新想起來的機會。記住了就拉長間隔，不熟就早點再見。</p><div class="review-steps"><span>1 天</span><span>3 天</span><span>7 天</span><span>14 天</span><span>30 天</span></div><p style="margin-top:12px;font-size:10px">這是固定間隔的複習工具，可依自己的感受選擇評級。</p></section></aside></div>`;
}

function renderFlashcard(word, state) {
  const liked = state.favoriteWords.includes(word.id);
  const review = state.words[word.id];
  const due = !review || new Date(review.dueAt) <= new Date();
  const nextStage = due ? Math.min(5, (review?.stage || 0) + 1) : review.stage;
  const interval = [0, 1, 3, 7, 14, 30][nextStage];
  return `<article class="flashcard" id="flash-focus" tabindex="-1"><div class="flash-topline"><div class="flash-label"><span class="lang-tag ${word.language}">${word.languageName}</span><span class="tiny-label">${e(word.stageLabel)}</span></div><button class="bookmark" data-action="favorite-word" data-id="${word.id}" aria-pressed="${liked}" aria-label="${liked ? '取消收藏' : '收藏'} ${e(word.term)}">${icon('star', 'sm')}</button></div><h2 class="flash-word" lang="${word.language}">${e(word.term)}</h2><p class="flash-reading">${e(word.reading)}</p><div class="flash-pronunciation">${audioButtons(word.term, word.locale, true)}</div>
    ${ui.flipped ? `<div class="flash-answer" aria-live="polite"><h3 class="flash-meaning">${e(word.meaning)}</h3><div class="flash-example"><div class="panel-head"><p class="original" lang="${word.language}">${e(word.example)}</p>${audioButtons(word.example, word.locale)}</div><p class="reading">${e(word.exampleReading)}</p><p class="translation">${e(word.exampleMeaning)}</p></div></div>` : `<div class="flash-reveal"><button class="btn" data-action="flip-card">想好了，看看答案 ${icon('arrow', 'sm')}</button><p class="flash-hint">先回想意思，也可以試著說一個句子。</p></div>`}
    <p class="flash-source">來自 <a href="${lessonUrl(lessonById[word.lessonId])}">${e(word.lessonTitle)}</a></p></article>
    ${ui.flipped ? `<div class="review-buttons" aria-label="你記得這個單字嗎"><button class="review-btn again" data-action="rate-word" data-rating="again">再練一次<small>約 10 分鐘後</small></button><button class="review-btn hard" data-action="rate-word" data-rating="hard">有點印象<small>明天再複習</small></button><button class="review-btn good" data-action="rate-word" data-rating="good">記住了<small>${due ? `${interval} 天後再見` : '保留原複習時間'}</small></button></div>` : ''}`;
}

function renderSavedVocabulary(pool, state) {
  return `<div class="section-heading"><div><h2>留給自己的單字筆記</h2><p>把想記住的字留下來，隨時回來練習。</p></div></div><div class="tabs-row"><label class="search" style="max-width:none">${icon('search')}<span class="sr-only">搜尋收藏單字</span><input id="word-search" type="search" value="${e(ui.wordQuery)}" placeholder="搜尋原文、讀音或中文意思…"></label>${pool.length ? '<button class="btn small" data-action="review-favorites">用字卡練習</button>' : ''}</div><div class="vocab-list">${pool.map(word => `<div class="vocab-row"><span class="lang-tag ${word.language}">${word.languageName}</span><div><strong lang="${word.language}">${e(word.term)}</strong><small>${e(word.reading)} · ${e(word.meaning)}</small></div>${audioButtons(word.term, word.locale)}<button class="bookmark" data-action="favorite-word" data-id="${word.id}" aria-pressed="true" aria-label="取消收藏 ${e(word.term)}">${icon('star')}</button><a class="btn small" href="../vocabulary/?word=${word.id}" aria-label="練習 ${e(word.term)}">${icon('arrow', 'sm')}</a></div>`).join('') || emptyState('還沒有這個範圍的收藏', '在字卡或課程裡按星星，就能把單字留在這裡。', 'star', '<button class="btn primary" data-action="vocab-mode" data-mode="today">去看看今日單字</button>')}</div>`;
}

function renderProgress() {
  const state = store.getState();
  const stats = store.getStats();
  const today = state.days[localDateKey()] || { seconds: 0, attempts: 0, correct: 0, reviewedWords: [] };
  const recent = Object.entries(state.lessons).sort((a, b) => new Date(b[1].visitedAt) - new Date(a[1].visitedAt)).slice(0, 5);
  const days = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - 27 + index);
    const key = localDateKey(date);
    return { key, date, record: state.days[key] };
  });
  const dayActive = record => !!record && (record.seconds > 0 || record.attempts > 0 || record.reviewedWords.length > 0 || record.completedLessons.length > 0);
  const activeDays = days.filter(day => dayActive(day.record)).length;
  const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const goalPercent = Math.min(100, percent(today.seconds, state.goalMinutes * 60));
  return `<section class="hero compact-hero"><div class="hero-copy"><p class="eyebrow">YOUR PROGRESS · EVERY STEP COUNTS</p><h1>每一點進步，都算數。</h1><p class="hero-description">從第一個字，到能說出自己的想法。<br>這裡記下你在日文與韓文路線上的每一步。</p></div><div class="hero-badge" aria-hidden="true">${icon('plant', 'lg')}</div></section>
    <div class="metrics-grid"><article class="metric"><div class="metric-top"><span>已完成課程</span>${icon('book')}</div><p class="metric-value">${stats.completed}<small>/ ${lessons.length} 課</small></p><p class="metric-sub">完成練習且通過後計入</p></article><article class="metric"><div class="metric-top"><span>累積學習時間</span>${icon('clock')}</div><p class="metric-value">${minLabel(stats.totalSeconds)}<small>分鐘</small></p><p class="metric-sub">在學習頁活動時累積</p></article><article class="metric"><div class="metric-top"><span>連續學習</span>${icon('flame')}</div><p class="metric-value">${stats.streak}<small>天</small></p><p class="metric-sub">每一天的小小堅持</p></article><article class="metric"><div class="metric-top"><span>練習答對率</span>${icon('target')}</div><p class="metric-value">${stats.attempts ? stats.accuracy : '—'}<small>${stats.attempts ? '%' : '尚未練習'}</small></p><p class="metric-sub">${stats.attempts ? `${n(stats.correct)} / ${n(stats.attempts)} 次作答答對` : '從一題開始，慢慢理解'}</p></article></div>
    <div class="progress-grid"><section class="dashboard-panel"><div class="panel-head"><div><h2>讓學習成為日常</h2><p class="backup-note">最近 28 天的學習足跡</p></div><span class="pill">${dateLabel(days[0].date)} — ${dateLabel(days[27].date)}</span></div><div class="heatmap" aria-label="最近28天學習紀錄">${Array.from({ length: 7 }, (_, index) => `<span class="heat-label">${weekLabels[(days[0].date.getDay() + index) % 7]}</span>`).join('')}${days.map(day => {
      const active = dayActive(day.record);
      const intensity = !active ? 0 : day.record.seconds >= 1800 ? 4 : day.record.seconds >= 900 ? 3 : day.record.seconds >= 300 ? 2 : 1;
      const label = `${day.key}：${active ? `學習 ${Math.floor(day.record.seconds / 60)} 分鐘、作答 ${day.record.attempts} 次、複習 ${day.record.reviewedWords.length} 個字` : '尚無學習紀錄'}`;
      return `<span class="heat-day ${day.key === localDateKey() ? 'today' : ''}" data-intensity="${intensity}" tabindex="0" title="${label}" aria-label="${label}">${day.date.getDate()}</span>`;
    }).join('')}</div><div class="heatmap-key"><span>少</span><i style="background:#f0f3e9"></i><i style="background:#dfead2"></i><i style="background:#bed3a8"></i><i style="background:#7e9f64"></i><i style="background:#426c3c"></i><span>多</span></div><div class="activity-summary"><span>最近 28 天，已有 <strong>${activeDays}</strong> 天留下足跡</span>${icon('leaf', 'sm')}</div></section>
    <section class="dashboard-panel"><h2>兩種語言，各自前進</h2><p>完整路線可以自由選課，按自己的步調走。</p>${courses.map(item => {
      const list = courseLessons(item.id);
      const completed = doneCount(list, state);
      const next = nextLesson(item.id, state);
      return `<div class="course-progress"><span class="language-tile ${item.id}">${item.id === 'ja' ? 'あ' : '한'}</span><div><h3>${item.language}學堂 <span>${completed} / ${list.length} 課</span></h3><p>${completed === list.length ? '這條路線已完成，隨時回來複習。' : `接下來：${e(next.title)}`}</p><div class="linear-progress" role="progressbar" aria-label="${item.language}課程完成度" aria-valuenow="${completed}" aria-valuemin="0" aria-valuemax="${list.length}"><span style="width:${percent(completed, list.length)}%"></span></div><a href="${lessonUrl(next)}">${completed === list.length ? '回顧課程' : '繼續學習'} →</a></div></div>`;
    }).join('')}</section>
    <section class="dashboard-panel"><h2>最近翻開的課</h2><p>不用重新找，從上次停下的地方繼續。</p>${recent.length ? `<div class="recent-list">${recent.map(([id, record]) => {
      const lesson = lessonById[id];
      return `<a class="recent-item" href="${lessonUrl(lesson)}">${icon(record.completedAt ? 'circleCheck' : 'book')}<div><strong>${e(lesson.title)}</strong><small>${lesson.languageName} · ${e(lesson.stage.label)} · ${dateLabel(record.visitedAt)}</small></div><span class="recent-status">${record.completedAt ? '已完成' : '繼續學習'}</span></a>`;
    }).join('')}</div>` : `<div style="margin-top:18px">${emptyState('你的第一課，從這裡開始', '挑一種想學的語言，給今天一個小小的開始。', 'book', '<a class="btn small" href="../japanese/">學日文</a> <a class="btn small" href="../korean/">學韓文</a>')}</div>`}</section>
    <section class="dashboard-panel"><h2>今天的小目標</h2><p>目標可以很小，重要的是適合你的生活。</p><div class="goal-setting"><label for="daily-goal" style="font-size:12px;color:var(--muted)">每日學習目標</label><select class="select-field" id="daily-goal">${[5, 10, 15, 20, 30, 45, 60].map(minutes => `<option value="${minutes}" ${state.goalMinutes === minutes ? 'selected' : ''}>${minutes} 分鐘</option>`).join('')}</select></div><div class="goal-meter"><div class="goal-meter-head"><span>今天已學 ${minLabel(today.seconds)} 分鐘</span><strong>${goalPercent}%</strong></div><div class="linear-progress" role="progressbar" aria-label="今日時間目標" aria-valuenow="${goalPercent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${goalPercent}%"></span></div></div><div class="activity-summary"><span>今日答題 ${today.attempts} 次</span><span>複習 ${today.reviewedWords.length} 個字</span></div><p class="backup-note" style="margin-top:15px">計時只在課程、字母練習或字卡頁顯示於前景時累積；一段時間未操作就暫停，切到其他分頁也會暫停。</p></section>
    <section class="dashboard-panel" id="backup" style="grid-column:1/-1"><div class="panel-head"><div><h2>把進步，好好留著</h2><p class="backup-note">課程紀錄、收藏與複習排程，都保存在這個瀏覽器。</p></div>${icon('leaf')}</div><div class="backup-controls"><button class="btn" data-action="export">${icon('download', 'sm')}匯出學習備份</button><button class="btn" data-action="pick-import">${icon('upload', 'sm')}匯入備份</button><input type="file" id="backup-file" accept="application/json,.json" hidden></div><p class="backup-note">換裝置前可以先匯出 JSON 備份，再到新裝置匯入。清除瀏覽器資料或使用無痕模式，可能讓紀錄消失；目前日韓學習紀錄沒有帳號雲端同步。匯入前會再次確認，因為它會替換這台裝置的現有紀錄。</p></section></div>`;
}

function importModal() {
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" aria-describedby="import-description"><h2 id="import-title">匯入這份學習備份？</h2><p id="import-description">將使用「${e(ui.importName)}」替換這台裝置現有的課程進度、收藏和單字複習排程。</p><p>如果想保留目前紀錄，可以先取消並匯出備份。格式不正確的檔案不會被匯入。</p><div class="actions"><button class="btn" data-action="cancel-import" id="cancel-import">先不要</button><button class="btn primary" data-action="confirm-import">確認匯入</button></div></section></div>`;
}

function openLesson(id) {
  const lesson = lessonById[id];
  if (!lesson || lesson.language !== language) return;
  flushStudyTime();
  stopSpeech();
  ui.choices = {}; ui.checked = {};
  history.pushState({}, '', `?lesson=${encodeURIComponent(id)}`);
  store.visitLesson(id);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.querySelector('.lesson-hero h1')?.setAttribute('tabindex', '-1');
  document.querySelector('.lesson-hero h1')?.focus({ preventScroll: true });
  lastInteraction = Date.now();
}

function clearSource() {
  const params = new URLSearchParams(location.search);
  params.delete('lesson'); params.delete('word');
  const query = params.toString();
  history.replaceState({}, '', location.pathname + (query ? '?' + query : ''));
}

app.addEventListener('click', event => {
  const target = event.target.closest('[data-action], [data-lesson]');
  if (!target || target.disabled) return;
  if (target.dataset.lesson && page === 'course') {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); openLesson(target.dataset.lesson); return;
  }
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === 'speak') { speak(target.dataset.text, target.dataset.locale, target.dataset.slow === 'true'); return; }
  if (action === 'back-course') {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); flushStudyTime(); stopSpeech();
    history.pushState({}, '', languagePath(language));
    document.title = `${course.language}學堂 · Body`;
    render(); window.scrollTo({ top: 0, behavior: 'instant' }); return;
  }
  if (action === 'course-tab') { flushStudyTime(); ui.tab = target.dataset.tab; ui.query = ''; render(); return; }
  if (action === 'stage') { ui.stage = target.dataset.stage; ui.query = ''; render(); return; }
  if (action === 'favorite-lesson') {
    const saved = store.toggleFavoriteLesson(id); render(); toast(saved ? '已放進收藏課程，想複習時隨時回來。' : '已取消收藏這一課。'); return;
  }
  if (action === 'favorite-word') {
    const saved = store.toggleFavoriteWord(id); render(); toast(saved ? '已加入收藏字庫。' : '已取消收藏這個字。'); return;
  }
  if (action === 'grade-question') {
    const lesson = currentLesson();
    const question = lesson?.questions.find(item => item.id === id);
    if (!question || ui.choices[id] === undefined || ui.checked[id]) return;
    ui.checked[id] = true;
    store.answerQuestion(lesson.id, id, ui.choices[id] === question.answer);
    render();
    document.querySelector(`#question-${id} .question-feedback`)?.setAttribute('tabindex', '-1');
    document.querySelector(`#question-${id} .question-feedback`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'retry-question') {
    ui.checked[id] = false; delete ui.choices[id]; render();
    document.querySelector(`#question-${id} input`)?.focus({ preventScroll: true }); return;
  }
  if (action === 'complete-lesson') {
    const lesson = currentLesson();
    if (!lesson || lesson.id !== id) return;
    const checked = lesson.questions.filter(item => ui.checked[item.id]);
    if (checked.length !== lesson.questions.length) return;
    const score = checked.filter(item => ui.choices[item.id] === item.answer).length;
    const result = store.completeLesson(id, score, lesson.questions.length);
    render(); toast(result.ok ? '這一課完成了！你的學習進度已更新。' : result.reason, result.ok ? '' : 'error'); return;
  }
  if (action === 'alphabet-group') { ui.group = id; ui.glyph = 0; ui.drill = null; render(); return; }
  if (action === 'glyph') { ui.glyph = Number(target.dataset.index); render(); return; }
  if (action === 'start-drill') { startDrill(); render(); document.getElementById('alphabet-drill')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (action === 'drill-choice') {
    if (!ui.drill || ui.drill.checked) return;
    ui.drill.selected = Number(target.dataset.index); render(); return;
  }
  if (action === 'drill-check') {
    if (!ui.drill || ui.drill.checked || ui.drill.selected === null) return;
    ui.drill.checked = true;
    const item = ui.drill.items[ui.drill.index];
    if (item.choices[ui.drill.selected] === item.reading) ui.drill.correct++;
    render(); return;
  }
  if (action === 'drill-next') {
    if (!ui.drill || !ui.drill.checked) return;
    ui.drill.index++; ui.drill.checked = false; ui.drill.selected = null; render(); return;
  }
  if (action === 'vocab-mode') {
    flushStudyTime();
    ui.vocabMode = target.dataset.mode; ui.wordQuery = ''; rebuildDeck(); render(); return;
  }
  if (action === 'clear-source') { clearSource(); ui.vocabMode = 'today'; rebuildDeck(); render(); return; }
  if (action === 'flip-card') { if (!ui.deck[ui.deckIndex]) return; ui.flipped = true; render(); return; }
  if (action === 'rate-word') {
    if (!ui.flipped || !ui.deck[ui.deckIndex]) return;
    flushStudyTime();
    const result = store.reviewWord(ui.deck[ui.deckIndex], target.dataset.rating);
    if (!result) return;
    stopSpeech(); ui.reviewed++; ui.deckIndex++; ui.flipped = false;
    render(); document.getElementById('flash-focus')?.focus({ preventScroll: true }); return;
  }
  if (action === 'restart-deck') {
    if (ui.vocabMode === 'due') rebuildDeck();
    else { ui.deckIndex = 0; ui.reviewed = 0; ui.flipped = false; }
    render(); return;
  }
  if (action === 'review-favorites') {
    flushStudyTime();
    const state = store.getState();
    ui.deck = filteredWords().filter(word => state.favoriteWords.includes(word.id) && (!ui.wordQuery || searchText([word.term, word.reading, word.meaning].join(' ')).includes(searchText(ui.wordQuery)))).map(word => word.id);
    ui.deckIndex = 0; ui.reviewed = 0; ui.flipped = false; ui.vocabMode = 'practice';
    render(); return;
  }
  if (action === 'export') {
    flushStudyTime();
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `body-learning-${localDateKey()}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('已建立學習備份，請保留下載的 JSON 檔。'); return;
  }
  if (action === 'pick-import') { document.getElementById('backup-file')?.click(); return; }
  if (action === 'cancel-import') { ui.modal = false; ui.importText = null; render(); document.querySelector('[data-action="pick-import"]')?.focus(); return; }
  if (action === 'confirm-import') {
    const result = store.importData(ui.importText);
    ui.modal = false; ui.importText = null; render();
    toast(result.ok ? result.persisted ? '備份已匯入，學習紀錄已更新。' : '備份已載入，但瀏覽器無法保存，離開前請再次匯出。' : result.reason, result.ok && result.persisted ? '' : 'error');
    return;
  }
});

app.addEventListener('change', async event => {
  const target = event.target;
  if (target.dataset.question) {
    const id = target.dataset.question;
    if (!ui.checked[id]) { ui.choices[id] = Number(target.value); render(true); }
  } else if (target.id === 'vocab-language' || target.id === 'vocab-stage') {
    clearSource();
    if (target.id === 'vocab-language') ui.vocabLanguage = target.value;
    else ui.vocabStage = target.value;
    if (ui.vocabMode === 'practice') ui.vocabMode = 'today';
    rebuildDeck(); render();
  } else if (target.id === 'daily-goal') {
    store.setGoal(Number(target.value)); render(); toast('每日學習目標已更新。');
  } else if (target.id === 'backup-file' && target.files?.[0]) {
    const file = target.files[0];
    if (file.size > 1024 * 1024) { toast('請選擇小於 1 MB 的 Body 學習備份檔。', 'error'); target.value = ''; return; }
    try {
      ui.importText = await file.text(); ui.importName = file.name; ui.modal = true; render();
    } catch { toast('無法讀取這個檔案，請重新選擇備份。', 'error'); }
  }
});

app.addEventListener('input', event => {
  if (event.target.id === 'course-search') { ui.query = event.target.value; render(true); }
  if (event.target.id === 'word-search') { ui.wordQuery = event.target.value; render(true); }
});

document.addEventListener('keydown', event => {
  if (!ui.modal) return;
  if (event.key === 'Escape') { ui.modal = false; ui.importText = null; render(); document.querySelector('[data-action="pick-import"]')?.focus(); return; }
  if (event.key === 'Tab') {
    const buttons = [...document.querySelectorAll('.modal button')];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

let lastInteraction = Date.now();
let lastTick = Date.now();
const isStudyView = () => page === 'course' ? !!currentLesson() || ui.tab === 'alphabet' : page === 'vocabulary' && ui.vocabMode !== 'saved' && ui.deckIndex < ui.deck.length;
function flushStudyTime() {
  const now = Date.now();
  const elapsed = Math.max(0, Math.min(30, Math.floor((now - lastTick) / 1000)));
  if (elapsed && document.visibilityState === 'visible' && now - lastInteraction < 90000 && isStudyView()) store.addStudySeconds(elapsed);
  lastTick = now;
}
for (const type of ['pointerdown', 'keydown', 'scroll']) document.addEventListener(type, () => { lastInteraction = Date.now(); }, { passive: true });
setInterval(flushStudyTime, 15000);
function refreshSharedState() {
  store.refresh();
  render(true);
}
document.addEventListener('visibilitychange', () => {
  lastTick = Date.now();
  if (document.visibilityState === 'visible') { lastInteraction = Date.now(); refreshSharedState(); }
});
window.addEventListener('pageshow', refreshSharedState);
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) refreshSharedState();
});
window.addEventListener('pagehide', () => { flushStudyTime(); stopSpeech(); });
window.addEventListener('popstate', () => {
  flushStudyTime(); stopSpeech(); ui.choices = {}; ui.checked = {};
  const lesson = currentLesson();
  if (lesson) store.visitLesson(lesson.id);
  else if (course) document.title = `${course.language}學堂 · Body`;
  render(); window.scrollTo({ top: 0, behavior: 'instant' });
});
store.subscribe(state => {
  const minutes = Math.floor((state.days[localDateKey()]?.seconds || 0) / 60);
  document.querySelectorAll('[data-live-goal]').forEach(element => { element.textContent = `${minutes} / ${state.goalMinutes} 分鐘`; });
});

function initialize() {
  if (page === 'course' && !course) throw new Error('Unknown course');
  if (page === 'course') {
    const params = new URLSearchParams(location.search);
    const lesson = currentLesson();
    if (lesson) store.visitLesson(lesson.id);
    else if (params.has('lesson')) { history.replaceState({}, '', location.pathname); toast('找不到這一課，已回到學習路線。', 'error'); }
    if (params.get('tab') === 'alphabet') ui.tab = 'alphabet';
  }
  if (page === 'vocabulary') {
    const params = new URLSearchParams(location.search);
    if (['ja', 'ko'].includes(params.get('lang'))) ui.vocabLanguage = params.get('lang');
    if (['due', 'saved'].includes(params.get('mode'))) ui.vocabMode = params.get('mode');
    if ((params.has('lesson') && !lessonById[params.get('lesson')]) || (params.has('word') && !wordById[params.get('word')])) {
      clearSource(); toast('找不到這組字卡，已顯示今日精選。', 'error');
    }
    rebuildDeck();
  }
  render();
}

try { initialize(); }
catch (error) {
  console.error('Body learning initialization failed:', error);
  app.innerHTML = `<main class="initial-loading" id="main-content"><a class="initial-brand" href="../">Body</a><h1>學習筆記暫時沒有打開</h1><p>請重新整理頁面；你已儲存的紀錄仍留在這個瀏覽器。</p><div class="hero-actions" style="justify-content:center"><button class="btn primary" id="reload-learning">重新整理</button><a class="btn" href="../">回到首頁</a></div></main>`;
  document.getElementById('reload-learning')?.addEventListener('click', () => location.reload());
}
