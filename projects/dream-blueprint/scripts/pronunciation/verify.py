"""Checks the packs the app will actually load: every clip is taken out of its pack, decoded from mp3 and measured again,
as it is and shifted by 12 ms (two of the three measurements made when recording; for the intonation lesson also the direction
of the pitch at the end).
usage: verify.py <public/pron directory> [lesson id ...]"""
import json, os, struct, subprocess, sys
import numpy as np
from course import parse, clips, slug, lesson_texts
from lib import check_once, ORDER, padded, transcribe, norm
from pitchwork import final_move

src = sys.argv[1]
only = sys.argv[2:]          # lesson ids; none = every lesson
lessons = [l for l in parse() if not only or l['id'] in only]
all_clips = clips(parse())
def decode(mp3):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'mp3', '-i', '-', '-f', 'f32le', '-ac', '1', '-ar', '24000', '-'], input=mp3, capture_output=True, check=True).stdout
    return np.frombuffer(p, dtype=np.float32), 24000
bad, total, secs, pieces = [], 0, 0.0, 0
for l in lessons:
    want = {}
    if l['kind'] == 'listen' and any(i['label'] in ('↗', '↘') for i in l['items']):
        for it in l['items']: want[it['text']] = 'rise' if it['label'] == '↗' else 'fall'
        for q in l['quiz']: want[q['audio']] = 'rise' if q['options'][q['answer']].startswith('上升') else 'fall'
    for g in 'fm':
        with open(os.path.join(src, f"{l['id']}-{g}.pack"), 'rb') as pack:
            raw = pack.read()
        size = struct.unpack('<I', raw[:4])[0]
        index = json.loads(raw[4:4 + size])
        texts = lesson_texts(l)
        assert sorted(index) == sorted(slug(t) for t in texts), l['id']
        for t in texts:
            off, length = index[slug(t)]
            x, sr = decode(raw[4 + size + off:4 + size + off + length])
            total += 1; secs += len(x) / sr
            if '~' in t:
                # a long word's slow version must come back as the word; its syllables are too short to grade (see syllables.py)
                if t.endswith('~slow'):
                    heard = [transcribe(padded(a, sr)) for a in (x, np.concatenate([np.zeros(288, dtype=np.float32), x]))]
                    if not all(norm(h) == norm(t.split('~')[0]) for h in heard): bad.append(f"{l['id']}-{g} {t!r}: heard {heard}")
                else: pieces += 1
                continue
            r = min((check_once(all_clips[slug(t)], a, sr) for a in (x, np.concatenate([np.zeros(288, dtype=np.float32), x]))), key=lambda r: ORDER[r['grade']])
            note = ''
            if t in want:
                move = final_move(x, sr, g)
                right = move is not None and (move >= 2.5 if want[t] == 'rise' else move <= -1.2)
                pitch = 'not measured' if move is None else f'{move:+.1f} st'
                note = f" pitch {pitch}, should {want[t]}"
                if not right: r['grade'] = 'bad'
            if r['grade'] != 'strict': bad.append(f"{l['id']}-{g} {t!r}: {r['grade']} {r.get('rivals') or r.get('heard')}{note}")
    print(l['id'], 'checked;', total, 'clips so far,', len(bad), 'not clear', flush=True)
print(f'{total} clips, {secs / 60:.1f} minutes of sound, {len(bad)} not clear ({pieces} of the clips are syllables of long words: present, not graded)')
for b in bad: print(' -', b)
sys.exit(1 if bad else 0)
