"""Grades every recorded take again with the current check (lib.check), without synthesising anything.
usage: regrade.py <f|m>"""
import os, sys, time
import soundfile as sf
from course import parse, clips, HERE, read_json, write_json
from lib import check
G = sys.argv[1]
LOG = os.path.join(HERE, 'out', G + '.json')
takes = read_json(LOG)
all_clips = clips(parse())
t0, n, changed = time.time(), 0, []
for s, voices in takes.items():
    if s not in all_clips: continue
    c = all_clips[s]
    for v, old in voices.items():
        x, sr = sf.read(os.path.join(HERE, 'out', G, v, s + '.wav'))
        res = check(c, x, sr)
        if res['grade'] != old['grade']: changed.append(f"{s} ({v}): {old['grade']} → {res['grade']} {res.get('rivals') or res.get('heard')}")
        keep = {k: old[k] for k in ('text', 'phonemes', 'speed', 'secs', 'pitch') if k in old}
        voices[v] = {**keep, 'others': c['others'], **res}
        n += 1
        if n % 50 == 0:
            write_json(LOG, takes)
            print(n, 'takes,', len(changed), 'changed,', round(time.time() - t0), 's', flush=True)
write_json(LOG, takes)
print('done:', n, 'takes,', len(changed), 'changed grade')
for line in changed: print(' -', line)
