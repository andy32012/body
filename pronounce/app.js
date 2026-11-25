import {
  SPEEDS, STARTER_WORDS, MAX_LENGTH,
  normalizeText, hasEnglish, splitWords, wordAt, spellingParts,
  englishVoices, pickVoice, voiceGender, voiceAccent,
  addToHistory, readSaved, writeSaved,
} from './core.js?v=1';

const $ = id => document.getElementById(id);
const synth = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window ? window.speechSynthesis : null;
const storage = (() => { try { return window.localStorage; } catch { return null; } })();

const state = readSaved(storage);
let voices = [];
let currentText = '';
let tokens = [];
let runId = 0;
let liveUtterance = null;
let recorder = null;
let recordChunks = [];
let recordTimer = 0;
let mineURL = '';

const el = {
  form: $('say-form'), input: $('say-input'), clear: $('clear-btn'), status: $('status'),
  stage: $('stage'), words: $('words'),
  again: $('again-btn'), slow: $('slow-btn'), spell: $('spell-btn'), repeat: $('repeat-btn'), stop: $('stop-btn'),
  voiceNote: $('voice-note'), voiceSelect: $('voice-select'),
  rec: $('rec-btn'), recLabel: $('rec-label'), mine: $('mine-btn'), compare: $('compare-btn'), audio: $('mine-audio'),
  history: $('history'), starters: $('starters'),
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const save = () => writeSaved(storage, state);

function setStatus(text, error = false) {
  el.status.textContent = text;
  el.status.classList.toggle('error', error);
}

/* ---------- 聲音 ---------- */

function loadVoices() {
  if (!synth) return;
  voices = englishVoices(synth.getVoices());
  renderVoiceSelect();
  describeVoice();
}

function chosenVoice() {
  if (state.voiceURI) {
    const manual = voices.find(voice => voice.voiceURI === state.voiceURI);
    if (manual) return { voice: manual, accentMatched: true, genderMatched: true, manual: true };
  }
  return pickVoice(voices, state);
}

const genderWord = gender => (gender === 'male' ? '男生' : gender === 'female' ? '女生' : '');
const accentWord = accent => (accent === 'us' ? '美式' : accent === 'uk' ? '英式' : '其他口音');

function voiceLabel(voice) {
  const name = voice.name.replace(/^(Microsoft|Google)\s+/i, '').replace(/\s*-\s*English.*$/i, '').replace(/\s*\(.*\)\s*$/, '');
  const bits = [accentWord(voiceAccent(voice)), genderWord(voiceGender(voice))].filter(Boolean).join('・');
  return `${name}（${bits}）`;
}

function describeVoice() {
  if (!synth) {
    el.voiceNote.textContent = '這個瀏覽器不能念英文。請改用 Safari 或 Chrome 打開這一頁。';
    return;
  }
  if (!voices.length) {
    el.voiceNote.textContent = '還找不到英文聲音。如果一直念不出來：iPhone / iPad 到「設定 → 輔助使用 → 朗讀內容 → 聲音 → 英文」下載一個聲音；Windows 到「設定 → 時間與語言 → 語音」加入英文。';
    return;
  }
  const pick = chosenVoice();
  if (!pick.voice) return;
  let note = `現在是：${voiceLabel(pick.voice)}`;
  if (!pick.manual && (!pick.accentMatched || !pick.genderMatched)) {
    const want = `${accentWord(state.accent)}${genderWord(state.gender)}`;
    note += `。這台裝置沒有${want}的聲音，先用最接近的代替；可以在下面「自己挑聲音」換。`;
  }
  el.voiceNote.textContent = note;
}

function renderVoiceSelect() {
  const keep = state.voiceURI;
  el.voiceSelect.replaceChildren(new Option('自動幫我挑', ''));
  const sorted = [...voices].sort((a, b) => voiceAccent(a).localeCompare(voiceAccent(b)) || a.name.localeCompare(b.name));
  for (const voice of sorted) el.voiceSelect.add(new Option(voiceLabel(voice), voice.voiceURI));
  el.voiceSelect.value = voices.some(voice => voice.voiceURI === keep) ? keep : '';
}

function speakOnce(text, { rate, onWord } = {}) {
  return new Promise(resolve => {
    if (!synth) { resolve(false); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    const pick = chosenVoice();
    utterance.lang = pick.voice?.lang || (state.accent === 'uk' ? 'en-GB' : 'en-US');
    if (pick.voice) utterance.voice = pick.voice;
    utterance.rate = rate ?? SPEEDS[state.speed].rate;
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      if (liveUtterance === utterance) liveUtterance = null;
      resolve(ok);
    };
    // 有些瀏覽器偶爾不會回報「念完了」，所以估一個最長時間當保險。
    const guard = setTimeout(() => finish(true), 4000 + (text.length * 220) / utterance.rate);
    utterance.onend = () => finish(true);
    utterance.onerror = event => {
      if (!['interrupted', 'canceled'].includes(event.error)) setStatus('念不出來，請確認手機沒有開靜音，或換一個聲音再試。', true);
      finish(false);
    };
    if (onWord) utterance.onboundary = event => { if (event.name === 'word' || event.name === undefined) onWord(event.charIndex); };
    liveUtterance = utterance; // 留住它，Chrome 才不會念到一半把它丟掉
    if (synth.paused) synth.resume();
    synth.speak(utterance);
  });
}

async function stopAll() {
  runId += 1;
  if (synth && (synth.speaking || synth.pending)) {
    synth.cancel();
    await sleep(60);
  }
  if (!el.audio.paused) { el.audio.pause(); el.audio.currentTime = 0; }
  highlight(-1);
  if (el.words.dataset.mode === 'letters') renderWords();
}

/* ---------- 畫面 ---------- */

function renderWords() {
  el.words.dataset.mode = 'words';
  el.words.replaceChildren(...tokens.map((token, index) => {
    if (!token.word) return document.createTextNode(token.text);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = token.text;
    button.dataset.index = String(index);
    button.setAttribute('aria-label', `只念 ${token.text}`);
    return button;
  }));
}

function highlight(index) {
  for (const node of el.words.querySelectorAll('.on')) node.classList.remove('on');
  if (index < 0) return;
  el.words.querySelector(`[data-index="${index}"]`)?.classList.add('on');
}

function show(text) {
  currentText = text;
  tokens = splitWords(text);
  renderWords();
  el.stage.hidden = false;
  el.compare.disabled = !mineURL;
}

function renderChips(container, list, emptyText) {
  if (!list.length) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.lang = 'zh-Hant';
    empty.textContent = emptyText;
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...list.map(text => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.dataset.say = text;
    return button;
  }));
}

function renderHistory() {
  renderChips(el.history, state.history, '念過的字會出現在這裡。');
}

function syncSegments() {
  for (const group of document.querySelectorAll('.seg')) {
    const value = state[group.dataset.setting];
    for (const button of group.querySelectorAll('button')) button.setAttribute('aria-checked', String(button.dataset.value === value));
  }
}

/* ---------- 動作 ---------- */

async function sayCurrent({ rate } = {}) {
  await stopAll();
  const mine = runId;
  setStatus('');
  const ok = await speakOnce(currentText, { rate, onWord: charIndex => { if (mine === runId) highlight(wordAt(tokens, charIndex)); } });
  if (mine === runId) highlight(-1);
  return ok;
}

async function submit(raw) {
  const text = normalizeText(raw);
  if (!text) { setStatus('先打一個英文單字，例如 beautiful。'); el.input.focus(); return; }
  if (!hasEnglish(text)) { setStatus('這裡只會念英文喔，請打英文字母。', true); return; }
  if (!synth) { setStatus('這個瀏覽器不能念英文，請改用 Safari 或 Chrome。', true); return; }
  if (String(raw).trim().length > MAX_LENGTH) setStatus(`太長了，先念前 ${MAX_LENGTH} 個字元。`);
  el.input.value = text;
  syncClear();
  show(text);
  state.history = addToHistory(state.history, text);
  save();
  renderHistory();
  await sayCurrent();
}

async function sayWord(index) {
  const token = tokens[index];
  if (!token) return;
  await stopAll();
  const mine = runId;
  highlight(index);
  await speakOnce(token.text, { rate: Math.min(SPEEDS[state.speed].rate, 0.8) });
  if (mine === runId) highlight(-1);
}

async function spell() {
  const letters = spellingParts(currentText).slice(0, 40);
  if (!letters.length) return;
  await stopAll();
  const mine = runId;
  el.words.dataset.mode = 'letters';
  const spans = letters.map(letter => {
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = letter;
    return span;
  });
  el.words.replaceChildren(...spans);
  for (let i = 0; i < letters.length; i += 1) {
    if (mine !== runId) return;
    spans.forEach((span, n) => span.classList.toggle('on', n === i));
    await speakOnce(letters[i], { rate: 0.8 });
    await sleep(120);
  }
  if (mine !== runId) return;
  renderWords();
  await sleep(300);
  if (mine === runId) await speakOnce(currentText, { onWord: charIndex => { if (mine === runId) highlight(wordAt(tokens, charIndex)); } });
  if (mine === runId) highlight(-1);
}

async function repeat(times = 3) {
  await stopAll();
  const mine = runId;
  for (let i = 0; i < times; i += 1) {
    if (mine !== runId) return;
    setStatus(`第 ${i + 1} 遍，跟著念：`);
    await speakOnce(currentText, { onWord: charIndex => { if (mine === runId) highlight(wordAt(tokens, charIndex)); } });
    highlight(-1);
    await sleep(900);
  }
  if (mine === runId) setStatus('念完 3 遍了，換你自己念念看。');
}

/* ---------- 錄音 ---------- */

const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

function setRecording(on) {
  el.rec.classList.toggle('recording', on);
  el.recLabel.textContent = on ? '錄好了，按這裡停' : (mineURL ? '重新錄一次' : '開始錄我的聲音');
}

async function toggleRecord() {
  if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
  if (!canRecord()) { setStatus('這個瀏覽器不能錄音，可以改用 Safari 或 Chrome。', true); return; }
  await stopAll();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    setStatus('沒有拿到麥克風。請在跳出來的視窗按「允許」，或到瀏覽器設定打開這個網站的麥克風。', true);
    return;
  }
  recordChunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = event => { if (event.data?.size) recordChunks.push(event.data); };
  recorder.onstop = () => {
    clearTimeout(recordTimer);
    stream.getTracks().forEach(track => track.stop());
    if (mineURL) URL.revokeObjectURL(mineURL);
    mineURL = recordChunks.length ? URL.createObjectURL(new Blob(recordChunks, { type: recorder.mimeType || 'audio/mp4' })) : '';
    el.audio.src = mineURL;
    el.mine.disabled = !mineURL;
    el.compare.disabled = !mineURL || !currentText;
    setRecording(false);
    setStatus(mineURL ? '錄好了！按「先聽它、再聽我」比比看。' : '沒有錄到聲音，再試一次。', !mineURL);
  };
  recorder.start();
  setRecording(true);
  setStatus('錄音中…念完按一下「停」，最多錄 10 秒。');
  recordTimer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 10000);
}

function playMine() {
  return new Promise(resolve => {
    if (!mineURL) { resolve(); return; }
    el.audio.currentTime = 0;
    el.audio.onended = () => resolve();
    el.audio.onpause = () => resolve();
    el.audio.play().catch(() => { setStatus('播不出你的錄音，再錄一次看看。', true); resolve(); });
  });
}

async function compare() {
  if (!currentText || !mineURL) return;
  await stopAll();
  const mine = runId;
  setStatus('它念 👉');
  await speakOnce(currentText, { onWord: charIndex => { if (mine === runId) highlight(wordAt(tokens, charIndex)); } });
  highlight(-1);
  if (mine !== runId) return;
  await sleep(500);
  setStatus('你念 👉');
  await playMine();
  if (mine === runId) setStatus('哪裡聽起來不一樣？可以點那個字單獨再聽一次。');
}

/* ---------- 事件 ---------- */

function syncClear() { el.clear.hidden = !el.input.value; }

el.form.addEventListener('submit', event => { event.preventDefault(); submit(el.input.value); });
el.input.addEventListener('input', syncClear);
el.clear.addEventListener('click', () => { el.input.value = ''; syncClear(); el.input.focus(); });
el.words.addEventListener('click', event => {
  const button = event.target.closest('button[data-index]');
  if (button) sayWord(Number(button.dataset.index));
});
el.again.addEventListener('click', () => sayCurrent());
el.slow.addEventListener('click', () => sayCurrent({ rate: SPEEDS.slower.rate }));
el.spell.addEventListener('click', spell);
el.repeat.addEventListener('click', () => repeat(3));
el.stop.addEventListener('click', async () => { await stopAll(); setStatus(''); });
el.rec.addEventListener('click', toggleRecord);
el.mine.addEventListener('click', async () => { await stopAll(); playMine(); });
el.compare.addEventListener('click', compare);
for (const container of [el.history, el.starters]) {
  container.addEventListener('click', event => {
    const button = event.target.closest('button[data-say]');
    if (button) submit(button.dataset.say);
  });
}
for (const group of document.querySelectorAll('.seg')) {
  group.addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    state[group.dataset.setting] = button.dataset.value;
    if (group.dataset.setting !== 'speed') { state.voiceURI = ''; el.voiceSelect.value = ''; }
    save();
    syncSegments();
    describeVoice();
    if (currentText && group.dataset.setting !== 'speed') sayCurrent();
  });
}
el.voiceSelect.addEventListener('change', () => {
  state.voiceURI = el.voiceSelect.value;
  save();
  describeVoice();
  if (currentText) sayCurrent();
});
window.addEventListener('pagehide', () => { if (synth) synth.cancel(); });

/* ---------- 開始 ---------- */

renderChips(el.starters, STARTER_WORDS, '');
renderHistory();
syncSegments();
syncClear();
if (!canRecord()) {
  el.rec.disabled = true;
  el.recLabel.textContent = '這個瀏覽器不能錄音';
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
  // iPhone 的聲音清單有時晚一點才出來
  for (const delay of [300, 1000, 2500]) setTimeout(() => { if (!voices.length) loadVoices(); }, delay);
} else {
  describeVoice();
  setStatus('這個瀏覽器不能念英文，請改用 Safari 或 Chrome 打開。', true);
}
const preset = new URLSearchParams(location.search).get('w');
if (preset) {
  const text = normalizeText(preset);
  if (hasEnglish(text)) { el.input.value = text; syncClear(); show(text); }
}
