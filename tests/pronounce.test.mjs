import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  pickVoice, voiceGender, englishVoices, splitWords, wordAt, spellingParts,
  normalizeText, hasEnglish, addToHistory, readSaved, writeSaved, STORAGE_KEY, HISTORY_LIMIT,
} from '../pronounce/core.js';

const voices = [
  { name: 'Samantha', lang: 'en-US', voiceURI: 'sam', default: true },
  { name: 'Fred', lang: 'en-US', voiceURI: 'fred' },
  { name: 'Daniel', lang: 'en-GB', voiceURI: 'dan' },
  { name: 'Google UK English Female', lang: 'en_GB', voiceURI: 'gukf' },
  { name: 'Microsoft Zira - English (United States)', lang: 'en-US', voiceURI: 'zira' },
  { name: 'Mei-Jia', lang: 'zh-TW', voiceURI: 'mei' },
];

test('voice gender is read from common system voice names, Female before male', () => {
  assert.equal(voiceGender({ name: 'Google UK English Female' }), 'female');
  assert.equal(voiceGender({ name: 'Google UK English Male' }), 'male');
  assert.equal(voiceGender({ name: 'Microsoft David - English (United States)' }), 'male');
  assert.equal(voiceGender({ name: 'Microsoft Zira - English (United States)' }), 'female');
  assert.equal(voiceGender({ name: 'Samantha' }), 'female');
  assert.equal(voiceGender({ name: 'English United States' }), null);
});

test('pickVoice matches accent and gender, and reports when it has to fall back', () => {
  assert.equal(englishVoices(voices).length, 5);
  assert.equal(pickVoice(voices, { accent: 'us', gender: 'male' }).voice.name, 'Fred');
  assert.equal(pickVoice(voices, { accent: 'uk', gender: 'female' }).voice.name, 'Google UK English Female');
  const noUkMale = pickVoice(voices.filter(v => v.name !== 'Daniel'), { accent: 'uk', gender: 'male' });
  assert.equal(noUkMale.accentMatched && noUkMale.genderMatched, false);
  assert.equal(pickVoice([{ name: 'Mei-Jia', lang: 'zh-TW' }], {}).voice, null);
});

test('sentences split into tappable words with positions for highlighting', () => {
  const text = "How's it going? It's well-known.";
  const tokens = splitWords(text);
  assert.deepEqual(tokens.filter(t => t.word).map(t => t.text), ["How's", 'it', 'going', "It's", 'well-known']);
  assert.equal(tokens.map(t => t.text).join(''), text);
  assert.equal(tokens[wordAt(tokens, text.indexOf('going'))].text, 'going');
  assert.equal(wordAt(tokens, text.indexOf('?')), -1);
});

test('input is tidied, English is required, and spelling keeps only letters', () => {
  assert.equal(normalizeText('  beau’tiful   day '), "beau'tiful day");
  assert.equal(normalizeText('a'.repeat(300)).length, 200);
  assert.equal(hasEnglish('你好'), false);
  assert.equal(hasEnglish('你好 hi'), true);
  assert.deepEqual(spellingParts("it's"), ['I', 'T', 'S']);
});

test('history keeps the newest first, without duplicates, up to the limit', () => {
  let list = [];
  for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) list = addToHistory(list, `word${i}`);
  assert.equal(list.length, HISTORY_LIMIT);
  list = addToHistory(list, 'WORD24');
  assert.equal(list[0], 'WORD24');
  assert.equal(list.filter(item => item.toLowerCase() === 'word24').length, 1);
});

test('saved settings survive a round trip and broken data falls back safely', () => {
  const entries = new Map();
  const storage = { getItem: k => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v) };
  assert.equal(readSaved(storage).gender, 'female');
  writeSaved(storage, { history: ['nurse'], gender: 'male', accent: 'uk', speed: 'slow', voiceURI: 'dan' });
  assert.deepEqual(readSaved(storage), { history: ['nurse'], gender: 'male', accent: 'uk', speed: 'slow', voiceURI: 'dan' });
  entries.set(STORAGE_KEY, '{oops');
  assert.deepEqual(readSaved(storage).history, []);
  assert.equal(readSaved({ getItem() { throw new Error('blocked'); } }).accent, 'us');
});

test('the home page links to the pronunciation page, outside 夢想藍圖', async () => {
  const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(home, /<a id="pronounce" class="tile say" href="pronounce\/">/);
  const page = await readFile(new URL('../pronounce/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /https?:\/\//, 'no outside scripts or fonts');
});
