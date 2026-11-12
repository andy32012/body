let onStatus = () => {};
let currentUtterance = null;

export function setSpeechStatusHandler(handler) {
  onStatus = handler;
}

export function speechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function stopSpeech() {
  if (speechAvailable()) window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function speak(text, locale, slow = false) {
  if (!speechAvailable()) {
    onStatus('這個瀏覽器不支援裝置朗讀。你仍可以看讀音、例句與解析練習。', 'error');
    return false;
  }
  const synthesis = window.speechSynthesis;
  const voices = synthesis.getVoices();
  const language = locale.split('-')[0].toLowerCase();
  const matching = voices.filter(voice => voice.lang.toLowerCase().replace('_', '-').startsWith(language));
  if (voices.length && !matching.length) {
    onStatus(`這台裝置尚未提供${language === 'ja' ? '日語' : '韓語'}朗讀聲音；請在系統語音設定安裝對應語言。`, 'error');
    return false;
  }
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(String(text));
  currentUtterance = utterance;
  utterance.lang = locale;
  utterance.rate = slow ? 0.65 : 0.88;
  if (matching.length) utterance.voice = matching.find(voice => voice.lang.toLowerCase() === locale.toLowerCase()) || matching[0];
  utterance.onerror = event => {
    if (!['interrupted', 'canceled'].includes(event.error)) onStatus('裝置朗讀暫時無法播放，請確認語音設定後再試一次。', 'error');
    currentUtterance = null;
  };
  utterance.onend = () => { currentUtterance = null; };
  synthesis.speak(utterance);
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stopSpeech);
}
