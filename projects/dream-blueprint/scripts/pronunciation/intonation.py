"""The intonation lesson says which sentences end rising and which end falling, so its clips must really do that.
The synthesiser lets its voice fall at the end of almost everything, yes/no questions included. So:
- a sentence that should fall keeps a natural take whose pitch does fall at the end;
- a sentence that should rise is made from a take of "clause, clause." cut at the comma (a clause that is not the end of the
  utterance keeps a normal, uncreaky voice), and the pitch of its last 0.4 s is then raised by overlap-add resynthesis.
Every result is measured again (pitch at the end, harmonics-to-noise ratio, and the words as the recogniser hears them).
Writes the takes into out/<f|m>.json and the choices into intonation.json.
usage: intonation.py <lesson id>"""
import argparse, sys
from math import isfinite
from pathlib import Path
from tempfile import TemporaryDirectory
from course import parse, clips, slug, HERE, read_json, write_json, publish_recording_files

parser = argparse.ArgumentParser(description='Record all rising and falling clips in an intonation lesson.')
parser.add_argument('lesson_id')
args = parser.parse_args()
course = parse()
lesson = next((l for l in course if l['id'] == args.lesson_id), None)
if not lesson or not any(it['label'].endswith(('↗', '↘')) for it in lesson['items']):
    parser.error(f'{args.lesson_id!r} is not an intonation lesson')

import soundfile as sf
from lib import SilentTake, phonemes, tts, shape, check
from pitchwork import final_move, first_clause, rising_end, harmonicity

VOICES = {'f': ['af_bella', 'af_heart', 'af_sarah', 'af_kore'], 'm': ['am_michael', 'am_adam', 'am_fenrir', 'am_puck']}
RISE, FALL = 3.0, -1.5      # semitones between the end of the sentence and the stretch before it

def expected(l):
    out = {}
    wh = ('what', 'where', 'when', 'why', 'how', 'who', 'which')
    for it in l['items']: out[it['text']] = 'rise' if it['label'].endswith('↗') else 'fall'
    for q in l['quiz']:
        want = 'rise' if q['options'][q['answer']].startswith('上升') else 'fall'
        assert out.get(q['audio'], want) == want, q['audio']
        out[q['audio']] = want
    for s in l['sentences']:
        t = s['en']
        out.setdefault(t, 'rise' if t.endswith('?') and not t.lower().startswith(wh) else 'fall')
    return out

def falling(c, ph, g):
    seen = []
    for voice in VOICES[g]:
        for speed in (0.9, 1.0, 0.82):
            x, sr = tts.create(ph, voice=voice, speed=speed, lang='en-us', is_phonemes=True)
            try:
                x = shape(x, sr)
            except SilentTake as error:
                seen.append(f'{voice} {speed}: {error}')
                continue
            move = final_move(x, sr, g)
            if move is None or not isfinite(move):
                seen.append(f'{voice} {speed}: no measurable final pitch movement')
                continue
            seen.append(f'{voice} {speed}: {move:+.1f}')
            if move > FALL: continue
            res = check(c, x, sr)
            if res['grade'] == 'strict': return voice, speed, x, sr, res, f'falls {move:+.1f} st (as synthesised)', seen
            seen[-1] += ' (words not clear)'
    return None, seen

def rising(c, ph, g):
    seen = []
    clause = ph.rstrip('?.! ')
    for voice in VOICES[g]:
        for speed in (0.9, 1.0):
            x, sr = tts.create(clause + ', ' + clause + '.', voice=voice, speed=speed, lang='en-us', is_phonemes=True)
            try:
                x = shape(x, sr)
            except SilentTake as error:
                seen.append(f'{voice} {speed}: {error}')
                continue
            part = first_clause(x, sr)
            if part is None: seen.append(f'{voice} {speed}: no pause to cut at'); continue
            y, start = rising_end(part, sr, g)
            if y is None: seen.append(f'{voice} {speed}: no voicing'); continue
            try:
                y = shape(y, sr)
            except SilentTake as error:
                seen.append(f'{voice} {speed}: resynthesis: {error}')
                continue
            move = final_move(y, sr, g)
            if move is None or not isfinite(move):
                seen.append(f'{voice} {speed}: no measurable final pitch movement')
                continue
            before_hnr = harmonicity(part, sr, start)
            after_hnr = harmonicity(y, sr, start)
            if not all(hnr is not None and isfinite(hnr) for hnr in (before_hnr, after_hnr)):
                seen.append(f'{voice} {speed}: no measurable harmonics-to-noise ratio')
                continue
            rough = after_hnr - before_hnr
            seen.append(f'{voice} {speed}: {move:+.1f} st, HNR {rough:+.1f} dB')
            if move < RISE or rough < -3: continue
            res = check(c, y, sr)
            if res['grade'] == 'strict':
                original = final_move(part, sr, g)
                original_pitch = f'{original:+.1f} st' if original is not None and isfinite(original) else 'not measured'
                pitch = f'rises {move:+.1f} st (end raised by resynthesis; original pitch movement {original_pitch})'
                return voice, speed, y, sr, res, pitch, seen
            seen[-1] += f" (words not clear: {res.get('heard')!r})"
    return None, seen

all_clips = clips(course)
output = Path(HERE) / 'out'
choice_path = Path(HERE) / 'intonation.json'
choice = read_json(choice_path) if choice_path.exists() else {}
logs = {g: read_json(output / (g + '.json')) for g in 'fm'}
produced = {}
missing = 0
directions = expected(lesson)
for g in 'fm':
    for text, want in directions.items():
        s = slug(text)
        c = all_clips[s]
        ph = phonemes(c)
        got = (rising if want == 'rise' else falling)(c, ph, g)
        if got[0] is None:
            print(f'{g} NO TAKE {want:4} {text!r}: {got[1]}', flush=True)
            missing += 1
            continue
        voice, speed, x, sr, res, pitch, seen = got
        produced[Path(g) / voice / (s + '.wav')] = (x, sr)
        logs[g].setdefault(s, {})[voice] = {'text': text, 'phonemes': ph, 'others': c['others'], 'speed': speed, 'secs': round(len(x) / sr, 2), **res, 'pitch': pitch}
        choice.setdefault(g, {})[s] = voice
        print(f'{g} ok {voice} {speed} | {text!r} | {pitch} | tried {len(seen)}', flush=True)

if missing:
    sys.exit(f'{missing} required takes had no qualified candidate. Previous recordings and choices kept.')

# Prepare the complete set before replacing any previous output.
with TemporaryDirectory(prefix='.intonation-', dir=output) as temporary:
    staged = Path(temporary)
    for name, (audio, rate) in produced.items():
        path = staged / name
        path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(path, audio, rate, subtype='PCM_16')
    for g, takes in logs.items():
        write_json(staged / (g + '.json'), takes)
    write_json(staged / choice_path.name, choice)
    files = []
    for name in produced:
        path = output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        files.append((staged / name, path))
    for g in logs:
        filename = g + '.json'
        files.append((staged / filename, output / filename))
    files.append((staged / choice_path.name, choice_path))
    publish_recording_files(files, staged)
print(f'Saved all {len(produced)} takes.')
