"""Re-records one clip in the voice it already uses, trying several speeds, and keeps the clearest take.
usage: fix_one.py <f|m> <clip>"""
import json, os, sys
import soundfile as sf
from course import parse, clips, HERE, CHOSEN
from lib import phonemes, speak, check
g, s = sys.argv[1], sys.argv[2]
c = clips(parse())[s]
voice = json.load(open(CHOSEN))['voices'][g][s]
log_path = os.path.join(HERE, 'out', g + '.json')
takes = json.load(open(log_path))
best = None
for speed in (0.85, 0.8, 0.9, 0.75, 0.97, 1.0):
    x, sr = speak(phonemes(c), voice, speed)
    r = check(c, x, sr)
    print(voice, speed, r['grade'], r.get('ahead'), r.get('partner'), r.get('rivals'), flush=True)
    if best is None or r['value'] > best[1]['value']: best = (x, r, speed)
x, r, speed = best
sf.write(os.path.join(HERE, 'out', g, voice, s + '.wav'), x, sr, subtype='PCM_16')
takes[s][voice] = {'text': c['text'], 'phonemes': phonemes(c), 'others': c['others'], 'speed': speed, 'secs': round(len(x) / sr, 2), **r}
json.dump(takes, open(log_path, 'w'), ensure_ascii=False, indent=1)
print('kept', voice, speed, r['grade'], 'value', r['value'])
