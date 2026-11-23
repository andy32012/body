"""Shared pieces of the recording tools: the synthesiser, the recogniser used as a checker, loudness and trimming."""
import json, os, re, subprocess
import numpy as np, cmudict
from kokoro_onnx import Kokoro
from faster_whisper import WhisperModel
from faster_whisper.tokenizer import Tokenizer
import espeakng_loader
from phonemizer.backend.espeak.wrapper import EspeakWrapper
EspeakWrapper.set_library(espeakng_loader.get_library_path())
EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
from misaki import en as misaki_en, espeak as misaki_espeak
from course import HERE, MP3
from phonemes import OVERRIDE

MODELS = os.environ.get('PRON_MODELS', HERE)
LEVELS = os.environ.get('PRON_LEVELS', os.path.join(HERE, '..', '..', 'src', 'data', 'levels.json'))
asr = WhisperModel('small.en', device='cpu', compute_type='int8', cpu_threads=int(os.environ.get('PRON_THREADS', '1')))
tok = Tokenizer(asr.hf_tokenizer, asr.model.is_multilingual, task='transcribe', language='en')
tts = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
# Text to phonemes: the synthesiser's own English front end (a pronouncing lexicon; espeak only for unknown words).
# Clips are synthesised from these phonemes, not from the spelling, so the stress and the vowels are the ones written in the log.
g2p = misaki_en.G2P(trf=False, british=False, fallback=misaki_espeak.EspeakFallback(british=False))

def said_form(c):
    t = c['text']
    return t if re.search(r'[.?!]$', t) else t[0].upper() + t[1:] + '.'
def phonemes(c):
    ph = OVERRIDE.get(c['text']) or g2p(said_form(c))[0]
    # A word on its own carries full stress, also a small word like "it" or "they" that is weak inside a sentence.
    if c['kind'] == 'word' and 'ˈ' not in ph: ph = ph.replace('ˌ', 'ˈ', 1)
    return ph
def speak(ph, voice, speed):
    x, sr = tts.create(ph, voice=voice, speed=speed, lang='en-us', is_phonemes=True)
    # 16-bit steps, as the take will be saved: what is graded is exactly what is packed
    return (np.round(shape(x, sr) * 32767) / 32767).astype(np.float32), sr

# ── words that differ by one sound
CMU = cmudict.dict()
def prons(w): return {tuple(p.rstrip('012') for p in pr) for pr in CMU.get(w.lower(), [])}
def one_apart(a, b):
    if a == b or abs(len(a) - len(b)) > 1: return False
    if len(a) == len(b): return sum(x != y for x, y in zip(a, b)) == 1
    if len(a) > len(b): a, b = b, a
    return any(a == b[:i] + b[i + 1:] for i in range(len(b)))
common = {}
for e in json.load(open(LEVELS)):
    for w in re.split(r'[/ ]', re.sub(r'\(.*?\)', '', e['en'])):
        w = w.strip().lower()
        if w.isalpha() and w in CMU: common.setdefault(w, e['level'])
_near = {}
def neighbours(word, limit=10):
    if word in _near: return _near[word]
    mine, out = prons(word), []
    for c, level in common.items() if mine else []:
        theirs = prons(c)
        if c == word or theirs & mine: continue          # the same word or a homophone
        if any(one_apart(a, b) for a in mine for b in theirs): out.append((level, c))
    _near[word] = [c for _, c in sorted(out)[:limit]]
    return _near[word]

NUMBERS = {'thirteen': '13', 'thirty': '30', 'fourteen': '14', 'forty': '40', 'fifteen': '15', 'fifty': '50', 'sixteen': '16', 'sixty': '60'}
def written(w):
    forms = [w[0].upper() + w[1:] + '.']
    if w.lower() in NUMBERS: forms.append(NUMBERS[w.lower()] + '.')
    return forms

def to16k(x, sr):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-f', 's16le', '-ac', '1', '-ar', '16000', '-'],
                       input=x.astype(np.float32).tobytes(), capture_output=True).stdout
    return np.frombuffer(p, dtype=np.int16).astype(np.float32) / 32768.0
def padded(x, sr):
    pad = np.zeros(int(sr * 0.3), dtype=np.float32)
    return to16k(np.concatenate([pad, x.astype(np.float32), pad]), sr)
WINDOW = 1000    # frames of 10 ms. The recogniser normally looks at 30 s; for clips of a second or two, 10 s gives the same
                 # leads (within about one nat on the clips compared) in a tenth of the time.
def encode(audio):
    feats = asr.feature_extractor(audio)
    n = min(feats.shape[-1], WINDOW)
    feats = feats[:, :WINDOW] if feats.shape[-1] >= WINDOW else np.pad(feats, ((0, 0), (0, WINDOW - feats.shape[-1])))
    return asr.encode(feats), n
def score(enc, n, text):
    r = asr.model.align(enc, tok.sot_sequence, [tok.encode(' ' + text)], n)[0]
    return float(np.sum(np.log(np.maximum(r.text_token_probs, 1e-12))))
def score_word(enc, n, w): return max(score(enc, n, f) for f in written(w))

SAME = {'ok': 'okay', '13': 'thirteen', '30': 'thirty', '14': 'fourteen', '40': 'forty', '15': 'fifteen', '50': 'fifty', '16': 'sixteen', '60': 'sixty'}
def norm(s):
    s = re.sub(r"[^a-z0-9' ]", ' ', s.lower().replace('’', "'"))
    return ' '.join(SAME.get(w, w) for w in s.split())
def transcribe(audio):
    segs, _ = asr.transcribe(audio, language='en', beam_size=5, condition_on_previous_text=False)
    return ' '.join(s.text.strip() for s in segs).strip()

def shape(x, sr):
    """Trim silence, leave a short lead and tail, bring every clip to the same loudness."""
    x = x.astype(np.float32)
    win = int(sr * 0.01)
    env = np.sqrt(np.convolve(x * x, np.ones(win) / win, mode='same'))
    loud = np.where(env > 0.006 * env.max())[0]      # low enough to keep a quiet f or th at the start and a released t at the end
    a, b = max(0, loud[0] - int(sr * 0.06)), min(len(x), loud[-1] + int(sr * 0.2))
    x = x[a:b].copy()
    voiced = env[a:b] > 0.1 * env.max()
    rms = np.sqrt(np.mean(x[voiced] ** 2)) if voiced.any() else np.sqrt(np.mean(x ** 2))
    x *= 0.1 / max(rms, 1e-6)
    peak = np.abs(x).max()
    if peak > 0.94: x *= 0.94 / peak
    fade = int(sr * 0.012)
    x[:fade] *= np.linspace(0, 1, fade); x[-fade:] *= np.linspace(1, 0, fade)
    return x

# ── grading a take
# The recogniser has favourites: on its own "Right." is far more expected than "Light.", "Then." than "Den.". What matters for a
# listening lesson is what the sound says, so each score is measured against what the recogniser expects from quiet noise alone.
_quiet = []
def _quiet_audio():
    if not _quiet:
        rng = np.random.default_rng(1)
        still = np.zeros(4800, dtype=np.float32)
        for level in (0.0005, 0.003, 0.01):
            _quiet.append(encode(np.concatenate([still, (rng.standard_normal(16000) * level).astype(np.float32), still])))
    return _quiet
_prior = {}
def prior(text, word=True):
    if text not in _prior:
        _prior[text] = float(np.mean([score_word(e, n, text) if word else score(e, n, text) for e, n in _quiet_audio()]))
    return _prior[text]

CAP = 3.0                               # the correction is an estimate (and wild for rare words), so it is limited
def lead(mine, other, own_word, other_word, word=True):
    """How far the intended words are ahead of a rival: as the recogniser scored them, and with its word bias taken out."""
    raw = mine - other
    return raw, raw - float(np.clip(prior(own_word, word) - prior(other_word, word), -CAP, CAP))
STRICT, WEAK = (1.0, 2.5), (0.0, 1.2)   # how far ahead (in nats, bias taken out) of: words one sound away, the pair partner
def as_shipped(x, sr):
    """The clip after the same mp3 encoding the packs use, decoded again: what the learner's device will play."""
    enc = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-'] + MP3, input=x.astype(np.float32).tobytes(), capture_output=True, check=True).stdout
    dec = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'mp3', '-i', '-', '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-'], input=enc, capture_output=True, check=True).stdout
    return np.frombuffer(dec, dtype=np.float32)
ORDER = {'bad': 0, 'weak': 1, 'strict': 2}
def check(c, x, sr):
    """Grades one take. One measurement moves by a nat or two when the clip is merely shifted by 10 ms or goes through mp3,
    so a take is measured three times (as shipped; as shipped and shifted 12 ms; the original shifted 25 ms) and gets the
    worst of the three: 'strict' means clearly the intended words every time."""
    shipped = as_shipped(x, sr)
    lead_in = lambda ms: np.zeros(int(sr * ms / 1000), dtype=np.float32)
    worst = None
    for audio in (shipped, np.concatenate([lead_in(12), shipped]), np.concatenate([lead_in(25), x.astype(np.float32)])):
        r = check_once(c, audio, sr)
        if worst is None: worst = r
        else:
            for k in ('ahead', 'partner', 'value'):
                if k in r and k in worst: worst[k] = min(worst[k], r[k])
            if ORDER[r['grade']] < ORDER[worst['grade']]: worst.update(grade=r['grade'], **{k: r[k] for k in ('rivals', 'heard') if k in r})
        if worst['grade'] == 'bad': break
    return worst
def check_once(c, x, sr):
    """One measurement of one take: 'strict' (clearly the intended words), 'weak' (ahead, but not by much) or 'bad'.
    Against its pair partner a word must also be ahead before any correction: the recogniser itself has to hear the right one."""
    audio = padded(x, sr)
    if c['kind'] == 'word':
        enc, n = encode(audio)
        word = c['text']
        mine = score_word(enc, n, word)
        partners = [o for o in c['others'] if ' ' not in o]
        near = [w for w in neighbours(word.lower()) if w not in [p.lower() for p in partners]]
        if not near and not partners:
            # a long word has no word one sound away to lose to: it has to come back right when the recogniser writes freely
            heard = transcribe(audio)
            same = norm(heard) == norm(word)
            return {'grade': 'strict' if same else 'bad', 'heard': heard, 'value': 1.0 if same else 0.0}
        rivals = {w: lead(mine, score_word(enc, n, w), word, w) for w in near}
        versus = {w: lead(mine, score_word(enc, n, w), word, w) for w in partners}
        ahead = min((fair for _, fair in rivals.values()), default=9.0)
        ahead_partner = min((fair for _, fair in versus.values()), default=9.0)
        raw_partner = min((raw for raw, _ in versus.values()), default=9.0)
        grade = ('strict' if ahead >= STRICT[0] and ahead_partner >= STRICT[1] and raw_partner >= 0
                 else 'weak' if ahead >= WEAK[0] and ahead_partner >= WEAK[1] and raw_partner >= -1 else 'bad')
        closest = sorted({**rivals, **versus}.items(), key=lambda kv: kv[1][1])[:3]
        return {'grade': grade, 'ahead': round(ahead, 2), 'partner': round(ahead_partner, 2), 'rivals': [[w, round(fair, 2)] for w, (_, fair) in closest],
                'value': round(min(ahead, ahead_partner - 1.5, raw_partner + 1.0), 2)}
    heard = transcribe(audio)
    same = norm(heard) == norm(c['text'])
    out = {'grade': 'strict' if same else 'bad', 'heard': heard, 'value': 1.0 if same else 0.0}
    if same and c['others']:
        # a sentence with a partner ("I can swim." / "I can't swim."): the partner must also lose the forced choice
        enc, n = encode(audio)
        mine = score(enc, n, c['text'])
        leads = [lead(mine, score(enc, n, o), c['text'], o, False) for o in c['others']]
        raw, fair = min(r for r, _ in leads), min(f for _, f in leads)
        out.update(partner=round(fair, 2), grade='strict' if fair >= STRICT[1] and raw >= 0 else 'weak' if fair >= WEAK[1] and raw >= -1 else 'bad',
                   value=round(min(fair - 1.5, raw + 1.0), 2))
    return out
