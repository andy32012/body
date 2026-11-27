"""Grades every recorded take again with the current check (lib.check), without synthesising anything.
usage: regrade.py <f|m>"""
import argparse, time
from pathlib import Path
from tempfile import TemporaryDirectory
from course import parse, clips, HERE, read_json, write_json
from recorded_take import read_take

parser = argparse.ArgumentParser(description='Regrade all existing takes in one voice family.')
parser.add_argument('voice_family', choices=('f', 'm'))
g = parser.parse_args().voice_family
output = Path(HERE) / 'out'
log = output / (g + '.json')
takes = read_json(log)
all_clips = clips(parse())

pending = [
    (clip, voice, old, output / g / voice / (clip + '.wav'))
    for clip, voices in takes.items() if clip in all_clips
    for voice, old in voices.items()
]
unreadable = []
for _, _, old, path in pending:
    try:
        read_take(path, old.get('secs'))
    except (OSError, RuntimeError, ValueError) as error:
        unreadable.append(f'{path}: {error}')
if unreadable:
    raise SystemExit('Recording log left unchanged. Fix these WAV files before regrading:\n - ' + '\n - '.join(unreadable))
if not pending:
    raise SystemExit('The recording log has no takes for the current course.')

from lib import check

t0, n, changed = time.time(), 0, []
for s, v, old, path in pending:
    c = all_clips[s]
    try:
        x, sr = read_take(path, old.get('secs'))
    except (OSError, RuntimeError, ValueError) as error:
        raise SystemExit(f'Recording log left unchanged. Cannot read {path}: {error}') from error
    res = check(c, x, sr)
    if res['grade'] != old['grade']:
        changed.append(f"{s} ({v}): {old['grade']} → {res['grade']} {res.get('rivals') or res.get('heard')}")
    keep = {k: old[k] for k in ('text', 'phonemes', 'speed', 'secs', 'pitch') if k in old}
    takes[s][v] = {**keep, 'others': c['others'], **res}
    n += 1
    if n % 50 == 0:
        print(n, 'takes,', len(changed), 'changed,', round(time.time() - t0), 's', flush=True)
with TemporaryDirectory(prefix='.regrade-', dir=output) as temporary:
    next_log = Path(temporary) / log.name
    write_json(next_log, takes)
    next_log.replace(log)
print('done:', n, 'takes,', len(changed), 'changed grade')
for line in changed: print(' -', line)
