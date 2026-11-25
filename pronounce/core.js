// 發音模擬器：不碰畫面的純邏輯（挑聲音、切字、紀錄），方便測試。

export const MAX_LENGTH = 200;
export const HISTORY_LIMIT = 20;
export const STORAGE_KEY = 'body-pronounce-v1';

export const SPEEDS = {
  normal: { label: '正常', rate: 0.9 },
  slow: { label: '慢慢念', rate: 0.6 },
  slower: { label: '超慢', rate: 0.4 },
};

export const STARTER_WORDS = [
  'beautiful', 'nurse', 'hospital', 'patient', 'medicine', 'temperature',
  'comfortable', 'vegetable', 'schedule', 'water', 'thank you', 'How are you feeling today?',
];

// 常見系統聲音的性別（iPhone / iPad / Mac、Windows、Edge、Chrome）。
const FEMALE = /\b(female|woman|samantha|victoria|karen|moira|tessa|veena|fiona|serena|kate|stephanie|martha|catherine|nicky|allison|ava|susan|zoe|joelle|noelle|kathy|shelley|sandy|flo|grandma|zira|hazel|heera|aria|jenny|ana|michelle|emma|libby|sonia|maisie|natasha|clara|sara|nancy|jane|amber|ashley|cora|elizabeth|monica|aurora|siri female)\b/i;
const MALE = /\b(male|man|alex|daniel|fred|rishi|aaron|arthur|gordon|evan|tom|nathan|oliver|lee|eddy|reed|rocko|ralph|junior|grandpa|albert|bruce|david|mark|george|james|guy|davis|andrew|brian|christopher|eric|roger|steffan|ryan|thomas|tony|jason|william|liam|brandon|siri male)\b/i;

export function voiceGender(voice) {
  const name = String(voice?.name || '');
  // 「Female」要先檢查，因為它裡面也有「male」
  if (/female/i.test(name)) return 'female';
  if (/\bmale\b/i.test(name)) return 'male';
  if (/google us english/i.test(name)) return 'female';
  if (FEMALE.test(name)) return 'female';
  if (MALE.test(name)) return 'male';
  return null;
}

const langOf = voice => String(voice?.lang || '').replace('_', '-').toLowerCase();

export function englishVoices(voices) {
  return (voices || []).filter(voice => langOf(voice).startsWith('en'));
}

export function voiceAccent(voice) {
  const lang = langOf(voice);
  if (lang === 'en-us') return 'us';
  if (lang === 'en-gb') return 'uk';
  return 'other';
}

// 依口音和性別挑一個最合適的英文聲音；找不到完全符合的就退而求其次，並說明退了哪一項。
export function pickVoice(voices, { accent = 'us', gender = 'female' } = {}) {
  const english = englishVoices(voices);
  if (!english.length) return { voice: null, accentMatched: false, genderMatched: false };
  const quality = voice => (/(premium|enhanced|natural|neural|online)/i.test(voice.name) ? 2 : 0)
    + (/(google|microsoft)/i.test(voice.name) ? 1 : 0);
  const score = voice => (voiceAccent(voice) === accent ? 100 : voiceAccent(voice) === 'other' ? 10 : 30)
    + (voiceGender(voice) === gender ? 50 : voiceGender(voice) === null ? 5 : 0)
    + quality(voice)
    + (voice.default ? 1 : 0);
  const best = [...english].sort((a, b) => score(b) - score(a))[0];
  return {
    voice: best,
    accentMatched: voiceAccent(best) === accent,
    genderMatched: voiceGender(best) === gender,
  };
}

export function normalizeText(raw) {
  return String(raw ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH);
}

export function hasEnglish(text) {
  return /[A-Za-z]/.test(String(text || ''));
}

// 把一句話切成「字」和「中間的空白、標點」，每個字記住它在句子裡的位置（念到哪個字就亮哪個字）。
export function splitWords(text) {
  const tokens = [];
  const pattern = /[A-Za-z0-9]+(?:['\-][A-Za-z0-9]+)*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) tokens.push({ text: text.slice(last, match.index), word: false, start: last, end: match.index });
    tokens.push({ text: match[0], word: true, start: match.index, end: match.index + match[0].length });
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), word: false, start: last, end: text.length });
  return tokens;
}

export function wordAt(tokens, charIndex) {
  return tokens.findIndex(token => token.word && charIndex >= token.start && charIndex < token.end);
}

export function spellingParts(text) {
  return [...String(text || '')].filter(char => /[A-Za-z]/.test(char)).map(char => char.toUpperCase());
}

export function addToHistory(list, text, limit = HISTORY_LIMIT) {
  const clean = normalizeText(text);
  if (!clean) return [...(list || [])];
  const rest = (list || []).filter(item => item.toLowerCase() !== clean.toLowerCase());
  return [clean, ...rest].slice(0, limit);
}

export function readSaved(storage) {
  const fallback = { history: [], gender: 'female', accent: 'us', speed: 'normal', voiceURI: '' };
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      history: Array.isArray(parsed.history) ? parsed.history.filter(item => typeof item === 'string').slice(0, HISTORY_LIMIT) : [],
      gender: parsed.gender === 'male' ? 'male' : 'female',
      accent: parsed.accent === 'uk' ? 'uk' : 'us',
      speed: Object.hasOwn(SPEEDS, parsed.speed) ? parsed.speed : 'normal',
      voiceURI: typeof parsed.voiceURI === 'string' ? parsed.voiceURI : '',
    };
  } catch {
    return fallback;
  }
}

export function writeSaved(storage, state) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
