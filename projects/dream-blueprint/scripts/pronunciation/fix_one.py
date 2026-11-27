"""Re-records one clip in the voice it already uses, trying several speeds, and keeps the clearest take.
usage: fix_one.py <f|m> <clip>"""
import argparse, os
from course import parse, clips, HERE, CHOSEN, read_json

parser = argparse.ArgumentParser(description='Re-record a pronunciation clip without changing its voice.')
parser.add_argument('voice_family', choices=('f', 'm'))
parser.add_argument('clip')
args = parser.parse_args()
g, s = args.voice_family, args.clip
c = clips(parse()).get(s)
voice = read_json(CHOSEN)['voices'][g].get(s)
if not c or not voice:
    parser.error(f'no selected pronunciation recording for {s!r} ({g})')

from lib import ORDER, SilentTake, phonemes, speak, check
from recorded_take import save_take

log_path = os.path.join(HERE, 'out', g + '.json')
takes = read_json(log_path)
best = None
ph = phonemes(c)
for speed in (0.85, 0.8, 0.9, 0.75, 0.97, 1.0):
    try:
        x, sr = speak(ph, voice, speed)
        r = check(c, x, sr)
    except SilentTake as error:
        print(voice, speed, error, flush=True)
        continue
    print(voice, speed, r['grade'], r.get('ahead'), r.get('partner'), r.get('rivals'), flush=True)
    if best is None or (ORDER[r['grade']], r['value']) > (ORDER[best[1]['grade']], best[1]['value']):
        best = (x, r, speed, sr)
if best is None:
    raise SystemExit(f'No usable waveform for {s} in {voice}.')
x, r, speed, sr = best
takes.setdefault(s, {})[voice] = {'text': c['text'], 'phonemes': ph, 'others': c['others'], 'speed': speed, 'secs': round(len(x) / sr, 2), **r}
save_take(os.path.join(HERE, 'out', g, voice, s + '.wav'), x, sr, log_path, takes)
print('kept', voice, speed, r['grade'], 'value', r['value'])
