"""The intonation lesson says which sentences end rising and which end falling, so its clips must really do that.
The synthesiser lets its voice fall at the end of almost everything, yes/no questions included. So:
- a sentence that should fall keeps a natural take whose pitch does fall at the end;
- a sentence that should rise is made from a take of "clause, clause." cut at the comma (a clause that is not the end of the
  utterance keeps a normal, uncreaky voice), and the pitch of its last 0.4 s is then raised by overlap-add resynthesis.
Every result is measured again (pitch at the end, harmonics-to-noise ratio, and the words as the recogniser hears them).
Writes the takes into out/<f|m>.json and the choices into intonation.json.
usage: intonation.py <lesson id>"""
import os, sys
from math import isfinite
import numpy as np, soundfile as sf
from course import parse, clips, slug, HERE, read_json, write_json
from lib import phonemes, tts, shape, check
from pitchwork import final_move, first_clause, rising_end, harmonicity

LESSON = sys.argv[1]
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
            x = shape(x, sr)
            move = final_move(x, sr, g)
            seen.append(f'{voice} {speed}: {move:+.1f}' if move is not None else f'{voice} {speed}: ?')
            if move is None or move > FALL: continue
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
            part = first_clause(shape(x, sr), sr)
            if part is None: seen.append(f'{voice} {speed}: no pause to cut at'); continue
            y, start = rising_end(part, sr, g)
            if y is None: seen.append(f'{voice} {speed}: no voicing'); continue
            y = shape(y, sr)
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

lesson = next(l for l in parse() if l['id'] == LESSON)
all_clips = clips(parse())
choice_path = os.path.join(HERE, 'intonation.json')
choice = read_json(choice_path) if os.path.exists(choice_path) else {}
for g in 'fm':
    log_path = os.path.join(HERE, 'out', g + '.json')
    takes = read_json(log_path)
    for text, want in expected(lesson).items():
        s = slug(text)
        c = all_clips[s]
        ph = phonemes(c)
        got = (rising if want == 'rise' else falling)(c, ph, g)
        if got[0] is None:
            print(f'{g} NO TAKE {want:4} {text!r}: {got[1]}', flush=True)
            continue
        voice, speed, x, sr, res, pitch, seen = got
        folder = os.path.join(HERE, 'out', g, voice)
        os.makedirs(folder, exist_ok=True)
        sf.write(os.path.join(folder, s + '.wav'), x, sr, subtype='PCM_16')
        takes.setdefault(s, {})[voice] = {'text': text, 'phonemes': ph, 'others': c['others'], 'speed': speed, 'secs': round(len(x) / sr, 2), **res, 'pitch': pitch}
        choice.setdefault(g, {})[s] = voice
        write_json(log_path, takes)
        write_json(choice_path, choice)
        print(f'{g} ok {voice} {speed} | {text!r} | {pitch} | tried {len(seen)}', flush=True)
