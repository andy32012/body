"""The syllable lessons (`X` lines of course.txt): one slow, careful recording of each long word, cut into its syllables.

The synthesiser cannot say a single syllable on its own (asked for "bʌ" it says "bye"; two recognisers agree), so the pieces
are not recorded separately. Instead:
  1. the word is synthesised from its careful phonemes (a real t where everyday speech has the quick one) at a moderate speed,
     with a copy of the model that also reports how long each sound lasts (kokoro-timed.onnx, see README);
  2. that recording is made 1.5 times longer with Praat's overlap-add, which keeps the pitch and the sounds: asking the model
     itself for half speed slurs words ("hospital" came back as "I have asked better all");
  3. it is cut where the model says one syllable ends and the next begins (corrected for the model's constant lag, see LAG),
     each cut moved to the quietest spot within 30 ms;
  4. the clips are the slow word, every syllable, and the word growing syllable by syllable (1-2, 1-2-3 …).
Checks: the slow word must come back as the same word when the recogniser writes freely (four hearings: as shipped in mp3,
shifted 12 and 25 ms, and the original shifted 25 ms). For each syllable a phoneme recogniser writes down what it hears; whether it heard the syllable's vowel is logged.
That last number is a rough guide only — a quarter-second fragment is hard for any recogniser — and nobody has listened.
usage: syllables.py <f|m> [word ...]"""
import json, os, sys, time
import numpy as np, soundfile as sf, parselmouth
from parselmouth.praat import call
from kokoro_onnx import Kokoro
from course import parse, slug, derived, HERE, CHOSEN
from lib import MODELS, as_shipped, padded, transcribe, norm, to16k
import phon

G = sys.argv[1]
ONLY = sys.argv[2:]
ORDER = {'f': ['af_bella', 'af_heart', 'af_sarah', 'af_kore'], 'm': ['am_adam', 'am_fenrir', 'am_michael', 'am_puck']}[G]
STRETCH = 1.5
SPEEDS = (0.8, 0.72, 0.88)
# The durations the model reports run late against its sound: a hissing s, easy to find by its zero crossings, really starts
# 0.065 s / speed before its reported start (measured on four voices at four speeds: 0.067 s at speed 1, 0.080 at 0.8,
# 0.090 at 0.72; spread about ±0.02). Every boundary is moved back by that much before the quietest spot nearby is looked for.
LAG = 0.065
LOG = os.path.join(HERE, 'out', f'syllables-{G}.json')
chosen = json.load(open(CHOSEN))['voices'][G]
timed = Kokoro(os.path.join(MODELS, 'kokoro-timed.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
assert timed.has_timings
log = json.load(open(LOG)) if os.path.exists(LOG) else {}

# What the phoneme recogniser may write for each vowel of the synthesiser (its own symbols; near neighbours count).
VOWELS = {'i': 'i ɪ', 'ɪ': 'ɪ i ə ɛ', 'ɛ': 'ɛ æ ɪ', 'æ': 'æ ɛ', 'ɑ': 'ɑ ɔ ʌ', 'ɔ': 'ɔ ɑ ow', 'ʌ': 'ʌ ə ɑ', 'ə': 'ə ʌ ɪ ɛ ʊ', 'u': 'u ʊ', 'ʊ': 'ʊ u',
          'A': 'ej', 'I': 'aj', 'O': 'ow', 'W': 'aw', 'Y': 'oj', 'ᵊ': 'ə ʌ ow'}
def vowel_heard(piece, heard):
    p = piece.replace('ˈ', '').replace('ˌ', '')
    if 'əɹ' in p or 'ɜɹ' in p: return any(h in ('ɹ̩', 'ɹ') for h in heard)
    want = [v for v in p if v in VOWELS]
    return bool(want) and any(h in VOWELS[want[0]].split() for h in heard)

def stretch(x, sr):
    return call(parselmouth.Sound(x.astype(np.float64), sampling_frequency=sr), 'Lengthen (overlap-add)', 75, 500, STRETCH).values[0].astype(np.float32)
def envelope(x, sr):
    win = int(sr * 0.01)
    return np.sqrt(np.convolve(x * x, np.ones(win) / win, mode='same'))
def faded(x, sr, ms_in=12, ms_out=18):
    x = x.copy()
    a, b = min(int(sr * ms_in / 1000), len(x) // 3), min(int(sr * ms_out / 1000), len(x) // 3)
    x[:a] *= np.linspace(0, 1, a); x[-b:] *= np.linspace(1, 0, b)
    return x
def clip(x, sr, gain):
    """A piece as it is saved: soft edges, a little silence around it (so the mp3 coder does not eat the first sound), 16 bit."""
    x = faded(x, sr) * gain
    peak = np.abs(x).max()
    if peak > 0.94: x *= 0.94 / peak
    still = lambda ms: np.zeros(int(sr * ms / 1000), dtype=np.float32)
    return (np.round(np.concatenate([still(40), x, still(80)]) * 32767) / 32767).astype(np.float32)

def cut(word, pieces, voice, speed):
    said = ''.join(pieces) + '.'
    x, sr, tm = timed.create_timed(said, voice, speed, 'en-us', True, trim=False)
    assert ''.join(t.phoneme for t in tm)[:len(said)] == said, (said, ''.join(t.phoneme for t in tm))
    y = stretch(x, sr)
    k = len(y) / len(x)
    env = envelope(y, sr)
    loud = np.where(env > 0.006 * env.max())[0]
    start, end = max(0, loud[0] - int(sr * 0.03)), min(len(y), loud[-1] + int(sr * 0.12))
    voiced = env[start:end] > 0.1 * env.max()
    gain = 0.1 / max(float(np.sqrt(np.mean(y[start:end][voiced] ** 2))), 1e-6)
    # where each syllable begins, by the model's own durations, moved to the quietest point nearby
    edges, i = [start], 0
    for p in pieces[:-1]:
        i += len(p)
        at = int((tm[i].start - LAG / speed) * k * sr)
        near = int(sr * 0.03)
        lo, hi = max(edges[-1] + int(sr * 0.05), at - near), min(end - int(sr * 0.05), at + near)
        edges.append(lo + int(np.argmin(env[lo:hi])) if hi > lo else at)
    edges.append(end)
    whole = clip(y[start:end], sr, gain)
    parts = []
    for a, b in zip(edges, edges[1:]):
        seg = y[a:b]
        own = 0.1 / max(float(np.sqrt(np.mean(seg ** 2))), 1e-6) * 0.8        # a weak syllable is brought up, but not past 2.5 times
        parts.append(clip(seg, sr, min(own, gain * 2.5) if own > gain else gain))
    grown = [clip(y[start:edges[j]], sr, gain) for j in range(2, len(pieces))]
    return sr, whole, parts, grown, [round((b - a) / sr, 2) for a, b in zip(edges, edges[1:])]

def comes_back(word, x, sr):
    """The slow word written down freely by the recogniser, four times: as the app will play it (mp3), that shifted 12 and
    25 ms, and the original shifted 25 ms. One hearing is not enough: the male "restaurant" came back as "Restorante" once in two."""
    shipped = as_shipped(x, sr)
    lead = lambda ms: np.zeros(int(sr * ms / 1000), dtype=np.float32)
    heard = [transcribe(padded(a, sr)) for a in (shipped, np.concatenate([lead(12), shipped]), np.concatenate([lead(25), shipped]), np.concatenate([lead(25), x]))]
    return all(norm(h) == norm(word) for h in heard), heard

t0 = time.time()
for l in parse():
    for item in l['items']:
        word = item['text']
        if word not in l['syll'] or (ONLY and word not in ONLY): continue
        pieces = l['syll'][word]
        key = slug(word)
        if log.get(key, {}).get('pieces') == pieces and log[key]['ok'] and not ONLY: continue
        first = chosen.get(key)
        best = None
        # the voice the whole word was recorded in comes first, so the word and its pieces sound like one speaker
        for voice in ([first] if first else []) + [v for v in ORDER if v != first]:
            for speed in SPEEDS:
                sr, whole, parts, grown, secs = cut(word, pieces, voice, speed)
                ok, heard = comes_back(word, whole, sr)
                if not ok and best is not None: continue
                sounds = [phon.heard(to16k(p, sr)) for p in parts]
                hits = [vowel_heard(p, h) for p, h in zip(pieces, sounds)]
                cand = (ok, sum(hits), -abs(speed - SPEEDS[0]))
                if best is None or cand > best[0]:
                    best = (cand, dict(voice=voice, speed=speed, whole=whole, parts=parts, grown=grown, secs=secs, heard=heard, sounds=sounds, hits=hits, sr=sr,
                                       slow_sounds=phon.heard(to16k(whole, sr))))
                if ok and all(hits): break
            if best[0][0] and all(best[1]['hits']): break
            if best[0][0] and voice == first: break          # same voice as the whole word and the slow word is right: good enough
        b = best[1]
        folder = os.path.join(HERE, 'out', G, b['voice'])
        os.makedirs(folder, exist_ok=True)
        names = derived(item)
        clips = [b['whole']] + b['parts'] + b['grown']
        assert len(names) == len(clips)
        for name, x in zip(names, clips): sf.write(os.path.join(folder, slug(name) + '.wav'), x, b['sr'], subtype='PCM_16')
        log[key] = {'text': word, 'pieces': pieces, 'voice': b['voice'], 'same_voice': b['voice'] == first, 'speed': b['speed'], 'stretch': STRETCH, 'ok': bool(best[0][0]), 'heard': b['heard'],
                    'slow_secs': round(len(b['whole']) / b['sr'], 2), 'piece_secs': b['secs'], 'slow_sounds': ' '.join(b['slow_sounds']),
                    'piece_sounds': [' '.join(s) for s in b['sounds']], 'vowel_heard': [bool(h) for h in b['hits']]}
        json.dump(log, open(LOG, 'w'), ensure_ascii=False, indent=1)
        r = log[key]
        print(f"{'ok ' if r['ok'] else 'BAD'} {word} | {r['voice']}{'' if r['same_voice'] else ' (other voice)'} {r['speed']} | heard {r['heard'][0]!r} | "
              + ' ; '.join(f"{p}({s}s){'✓' if h else '?'}→{snd}" for p, s, h, snd in zip(pieces, r['piece_secs'], r['vowel_heard'], r['piece_sounds'])) + f" | {round(time.time() - t0)} s", flush=True)
words = [v for v in log.values()]
print(len(words), 'words;', sum(not w['ok'] for w in words), 'slow words not right;', sum(sum(w['vowel_heard']) for w in words), 'of', sum(len(w['vowel_heard']) for w in words), 'syllables: the vowel was heard')
