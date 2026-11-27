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
import argparse, os, time
from pathlib import Path
from tempfile import TemporaryDirectory
from course import parse, slug, derived, HERE, CHOSEN, read_json, write_json, publish_recording_files

parser = argparse.ArgumentParser(description='Record and cut the course’s multisyllable words.')
parser.add_argument('voice_family', choices=('f', 'm'))
parser.add_argument('words', nargs='*')
args = parser.parse_args()
G = args.voice_family
requested = {word.lower() for word in args.words}
words = {}
for lesson in parse():
    for item in lesson['items']:
        word = item['text']
        if word not in lesson['syll']:
            continue
        pieces = lesson['syll'][word]
        if words.setdefault(word, (item, pieces))[1] != pieces:
            parser.error('conflicting syllable splits for ' + word)
unknown = requested - {word.lower() for word in words}
if unknown:
    parser.error('unknown syllable word(s): ' + ', '.join(sorted(unknown)))

import numpy as np, parselmouth
from parselmouth.praat import call
from kokoro_onnx import Kokoro
from lib import MODELS, SilentTake, pcm16, as_shipped, padded, transcribe, norm, to16k
from recorded_take import read_take, write_take
import phon

ORDER = {'f': ['af_bella', 'af_heart', 'af_sarah', 'af_kore'], 'm': ['am_adam', 'am_fenrir', 'am_michael', 'am_puck']}[G]
STRETCH = 1.5
SPEEDS = (0.8, 0.72, 0.88)
# The durations the model reports run late against its sound: a hissing s, easy to find by its zero crossings, really starts
# 0.065 s / speed before its reported start (measured on four voices at four speeds: 0.067 s at speed 1, 0.080 at 0.8,
# 0.090 at 0.72; spread about ±0.02). Every boundary is moved back by that much before the quietest spot nearby is looked for.
LAG = 0.065
OUTPUT = Path(HERE) / 'out'
LOG = OUTPUT / f'syllables-{G}.json'
chosen = read_json(CHOSEN)['voices'][G]
timed = Kokoro(os.path.join(MODELS, 'kokoro-timed.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
if not timed.has_timings:
    parser.error('the Kokoro model does not report timing; see timed_model.py')
log = read_json(LOG) if LOG.exists() else {}

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
    win = min(x.size, max(1, int(sr * 0.01)))
    return np.sqrt(np.convolve(x * x, np.ones(win) / win, mode='same'))
def faded(x, sr, ms_in=12, ms_out=18):
    x = x.copy()
    a, b = min(int(sr * ms_in / 1000), len(x) // 3), min(int(sr * ms_out / 1000), len(x) // 3)
    if a: x[:a] *= np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)
    return x
def clip(x, sr, gain):
    """A piece as it is saved: soft edges, a little silence around it (so the mp3 coder does not eat the first sound), 16 bit."""
    x = faded(x, sr) * gain
    peak = np.abs(x).max()
    if peak > 0.94: x *= 0.94 / peak
    still = lambda ms: np.zeros(int(sr * ms / 1000), dtype=np.float32)
    return pcm16(np.concatenate([still(40), x, still(80)]))

def cut(pieces, voice, speed):
    said = ''.join(pieces) + '.'
    x, sr, tm = timed.create_timed(said, voice, speed, 'en-us', True, trim=False)
    if not ''.join(t.phoneme for t in tm).startswith(said):
        raise SilentTake('synthesis did not report timings for the expected phonemes')
    if x.ndim != 1 or sr <= 0 or len(x) < sr * 0.1 or not np.isfinite(x).all() or not np.any(x):
        raise SilentTake('empty, short or invalid timed waveform')
    y = stretch(x, sr)
    if not y.size or not np.isfinite(y).all():
        raise SilentTake('stretching returned no usable waveform')
    k = len(y) / len(x)
    env = envelope(y, sr)
    loud = np.where(env > 0.006 * env.max())[0]
    if not loud.size:
        raise SilentTake('silent waveform after stretching')
    start, end = max(0, loud[0] - int(sr * 0.03)), min(len(y), loud[-1] + max(1, int(sr * 0.12)))
    voiced = env[start:end] > 0.1 * env.max()
    gain = 0.1 / max(float(np.sqrt(np.mean(y[start:end][voiced] ** 2))), 1e-6)
    # where each syllable begins, by the model's own durations, moved to the quietest point nearby
    edges, i = [start], 0
    starts = [timing.start for timing in tm for _ in timing.phoneme]
    gap, near = max(1, int(sr * 0.05)), int(sr * 0.03)
    if end - start < gap * len(pieces):
        raise SilentTake('waveform too short to cut all syllables')
    for part, p in enumerate(pieces[:-1], 1):
        i += len(p)
        if not np.isfinite(starts[i]):
            raise SilentTake('the model returned a non-finite syllable start')
        at = int((starts[i] - LAG / speed) * k * sr)
        lower, upper = edges[-1] + gap, end - gap * (len(pieces) - part)
        at = min(upper, max(lower, at))
        lo, hi = max(lower, at - near), min(upper, at + near)
        edges.append(lo + int(np.argmin(env[lo:hi + 1])))
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

def existing_syllables(previous, pieces, filenames):
    if previous.get('pieces') != pieces or not previous.get('ok') or previous.get('voice') not in ORDER:
        return False
    folder = OUTPUT / G / previous['voice']
    durations = previous.get('clip_secs')
    if not isinstance(durations, list) or len(durations) != len(filenames):
        durations = [previous.get('slow_secs'), *([None] * (len(filenames) - 1))]
    try:
        for name, duration in zip(filenames, durations, strict=True):
            read_take(folder / name, duration)
    except (OSError, RuntimeError, ValueError):
        return False
    return True


def record_syllables(word, pieces, first):
    best = None
    # Prefer the voice of the ordinary word, but keep trying when the slow word is unclear.
    for voice in ([first] if first else []) + [v for v in ORDER if v != first]:
        for speed in SPEEDS:
            try:
                sr, whole, parts, grown, secs = cut(pieces, voice, speed)
                ok, heard = comes_back(word, whole, sr)
            except SilentTake as error:
                print(f'{word} | {voice} {speed}: {error}', flush=True)
                continue
            if not ok:
                print(f'{word} | {voice} {speed}: heard {heard}', flush=True)
                continue
            sounds = [phon.heard(to16k(part, sr)) for part in parts]
            hits = [vowel_heard(piece, heard_sounds) for piece, heard_sounds in zip(pieces, sounds)]
            rank = (sum(hits), -abs(speed - SPEEDS[0]))
            if best is None or rank > best[0]:
                best = (rank, dict(voice=voice, speed=speed, whole=whole, parts=parts, grown=grown, secs=secs,
                                   heard=heard, sounds=sounds, hits=hits, sr=sr, slow_sounds=phon.heard(to16k(whole, sr))))
            if all(hits):
                break
        if best and (all(best[1]['hits']) or voice == first):
            break
    return best[1] if best else None


t0 = time.time()
failed = []
for word, (item, pieces) in words.items():
    if requested and word.lower() not in requested:
        continue
    key = slug(word)
    filenames = [slug(name) + '.wav' for name in derived(item)]
    if not requested and existing_syllables(log.get(key, {}), pieces, filenames):
        continue
    first = chosen.get(key)
    b = record_syllables(word, pieces, first)
    if b is None:
        failed.append(word)
        continue
    folder = OUTPUT / G / b['voice']
    folder.mkdir(parents=True, exist_ok=True)
    audio = [b['whole']] + b['parts'] + b['grown']
    log[key] = {'text': word, 'pieces': pieces, 'voice': b['voice'], 'same_voice': b['voice'] == first,
                'speed': b['speed'], 'stretch': STRETCH, 'ok': True, 'heard': b['heard'],
                'slow_secs': round(len(b['whole']) / b['sr'], 2), 'piece_secs': b['secs'],
                'clip_secs': [round(len(samples) / b['sr'], 2) for samples in audio],
                'slow_sounds': ' '.join(b['slow_sounds']), 'piece_sounds': [' '.join(s) for s in b['sounds']],
                'vowel_heard': [bool(h) for h in b['hits']]}
    with TemporaryDirectory(prefix='.syllables-', dir=OUTPUT) as temporary:
        staging = Path(temporary)
        replacements = []
        for name, x in zip(filenames, audio, strict=True):
            path = staging / name
            write_take(path, x, b['sr'])
            replacements.append((path, folder / name))
        write_json(staging / LOG.name, log)
        publish_recording_files(replacements + [(staging / LOG.name, LOG)], staging)
    r = log[key]
    print(f"ok {word} | {r['voice']}{'' if r['same_voice'] else ' (other voice)'} {r['speed']} | heard {r['heard'][0]!r} | "
          + ' ; '.join(f"{p}({s}s){'✓' if h else '?'}→{snd}" for p, s, h, snd in zip(pieces, r['piece_secs'], r['vowel_heard'], r['piece_sounds'])) + f" | {round(time.time() - t0)} s", flush=True)
if failed:
    raise SystemExit('No clear slow recording for: ' + ', '.join(failed) + '. Kept the previous files for those words.')
