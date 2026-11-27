"""Records the clips of the course in one voice family and grades every take (see lib.check).
For each clip and voice it keeps the clearest of three speeds. A minimal pair is recorded with the same voice for both words:
the voices are tried in order until both words come out clearly. Everything is written to out/<f|m>/<voice>/<clip>.wav and
out/<f|m>.json; choose.py then decides which pairs and which takes go into the course.
A pool of candidate pairs is recorded until it has three clear pairs more than the lesson keeps (the other voice may reject
some); --all records every candidate.
usage: record.py <f|m> [--all] [lesson id ...]"""
import argparse, os, sys, time
from course import parse, clips, slug, HERE, read_json, write_json

parser = argparse.ArgumentParser(description='Record pronunciation lessons in one voice family.')
parser.add_argument('voice_family', choices=('f', 'm'))
parser.add_argument('--all', action='store_true', help='record every candidate pair')
parser.add_argument('lesson_ids', nargs='*', metavar='lesson_id', help='record only these lessons (default: all)')
args = parser.parse_intermixed_args()
lessons = parse()
requested = set(args.lesson_ids)
unknown = requested - {lesson['id'] for lesson in lessons}
if unknown:
    parser.error('unknown lesson ID(s): ' + ', '.join(sorted(unknown)))
selected = [lesson for lesson in lessons if not requested or lesson['id'] in requested]
if not selected:
    parser.error('the course has no lessons to record')

# Selection errors should be reported before loading the models or touching the recording directory.
import soundfile as sf
from lib import SilentTake, phonemes, speak, check
from recorded_take import read_take

G = args.voice_family
VOICES = {'f': ['af_bella', 'af_heart', 'af_sarah', 'af_kore'], 'm': ['am_adam', 'am_fenrir', 'am_michael', 'am_puck']}[G]
LOG = os.path.join(HERE, 'out', G + '.json')
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
takes = read_json(LOG) if os.path.exists(LOG) else {}
all_clips = clips(lessons)
t0 = time.time()
made = 0

def take(s, voice):
    """The clearest of three speeds for one clip in one voice. Reuse a logged take if its audio still matches."""
    global made
    c = all_clips[s]
    ph = phonemes(c)
    folder = os.path.join(HERE, 'out', G, voice)
    wav_path = os.path.join(folder, s + '.wav')
    old = takes.get(s, {}).get(voice)
    if old and old['phonemes'] == ph and old['others'] == c['others']:
        try:
            read_take(wav_path, old.get('secs'))
            return old
        except (OSError, RuntimeError, ValueError):
            pass
    base = 0.85 if c['kind'] == 'word' else 0.9
    best = None
    for speed in (base, base + 0.12, base - 0.1):
        try:
            x, sr = speak(ph, voice, speed)
        except SilentTake as error:
            print(f' {s} | {voice} {speed:g}: {error}', flush=True)
            continue
        res = check(c, x, sr)
        if best is None or res['value'] > best[1]['value']: best = (x, res, speed)
        if res['grade'] == 'strict': break
    if best is None:
        return None
    x, res, speed = best
    os.makedirs(folder, exist_ok=True)
    sf.write(wav_path, x, sr, subtype='PCM_16')
    rec = {'text': c['text'], 'phonemes': ph, 'others': c['others'], 'speed': round(speed, 2), 'secs': round(len(x) / sr, 2), **res}
    takes.setdefault(s, {})[voice] = rec
    write_json(LOG, takes)
    made += 1
    return rec

def show(s, voice, r):
    extra = f"ahead {r.get('ahead')} partner {r.get('partner')} {r.get('rivals')}" if 'ahead' in r else f"heard {r.get('heard')!r} partner {r.get('partner')}"
    print(f"  {r['grade']:6} {s} | {voice} {r['speed']} | {extra}", flush=True)

failures = []
for l in selected:
    print(f"== {l['id']} {l['title']} ({round(time.time() - t0)} s, {made} takes)", flush=True)
    paired = set()
    for pool in l['pools']:
        clear = playable = 0
        for a, b in pool['pairs']:
            if clear >= pool['keep'] + 3 and not args.all: break
            sa, sb = slug(a), slug(b)
            paired |= {sa, sb}
            attempts = {}
            for voice in VOICES[:3]:
                ra, rb = take(sa, voice), take(sb, voice)
                attempts[voice] = (ra, rb)
                if ra and rb and ra['grade'] == rb['grade'] == 'strict': break
            grade_a, grade_b = (r['grade'] if r else 'no audio' for r in (ra, rb))
            print(f' {a} / {b}: {voice} {grade_a}/{grade_b}', flush=True)
            playable += any(ra and rb for ra, rb in attempts.values())
            if grade_a == grade_b == 'strict':
                clear += 1
            else:
                for v, (ra, rb) in attempts.items():
                    if ra: show(sa, v, ra)
                    if rb: show(sb, v, rb)
        if playable < pool['keep']:
            failures.append(f"{l['id']}: only {playable} of {pool['keep']} required pairs have audio for both words")
    for it in [i['text'] for i in l['items']] + [q['audio'] for q in l['quiz']] + [s['en'] for s in l['sentences']]:
        s = slug(it)
        if s in paired: continue
        attempts = {}
        for voice in VOICES:
            r = take(s, voice)
            if not r: continue
            attempts[voice] = r
            if r['grade'] == 'strict': break
        if not attempts:
            failures.append(f"{l['id']}: no usable waveform for {it!r}")
        elif not r or r['grade'] != 'strict':
            print(f" {it}: no clear take", flush=True)
            for v, r in attempts.items(): show(s, v, r)
if failures:
    for failure in failures:
        print(failure, file=sys.stderr)
    sys.exit(1)
print('done in', round(time.time() - t0), 's;', made, 'new takes')
