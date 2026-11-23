"""Records the clips of the course in one voice family and grades every take (see lib.check).
For each clip and voice it keeps the clearest of three speeds. A minimal pair is recorded with the same voice for both words:
the voices are tried in order until both words come out clearly. Everything is written to out/<f|m>/<voice>/<clip>.wav and
out/<f|m>.json; choose.py then decides which pairs and which takes go into the course.
A pool of candidate pairs is recorded until it has three clear pairs more than the lesson keeps (the other voice may reject
some); --all records every candidate.
usage: record.py <f|m> [--all] [lesson id ...]"""
import json, os, sys, time
import soundfile as sf
from course import parse, clips, slug, HERE
from lib import phonemes, speak, check

G = sys.argv[1]
ONLY = [a for a in sys.argv[2:] if not a.startswith('--')]
EVERY = '--all' in sys.argv
VOICES = {'f': ['af_bella', 'af_heart', 'af_sarah', 'af_kore'], 'm': ['am_adam', 'am_fenrir', 'am_michael', 'am_puck']}[G]
LOG = os.path.join(HERE, 'out', G + '.json')
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
takes = json.load(open(LOG)) if os.path.exists(LOG) else {}
lessons = parse()
all_clips = clips(lessons)
t0 = time.time()
made = 0

def take(s, voice):
    """The clearest of three speeds for one clip in one voice (remembered between runs while its phonemes stay the same)."""
    global made
    c = all_clips[s]
    ph = phonemes(c)
    old = takes.get(s, {}).get(voice)
    if old and old['phonemes'] == ph and old['others'] == c['others']: return old
    base = 0.85 if c['kind'] == 'word' else 0.9
    best = None
    for speed in (base, base + 0.12, base - 0.1):
        x, sr = speak(ph, voice, speed)
        res = check(c, x, sr)
        if best is None or res['value'] > best[1]['value']: best = (x, res, speed)
        if res['grade'] == 'strict': break
    x, res, speed = best
    folder = os.path.join(HERE, 'out', G, voice)
    os.makedirs(folder, exist_ok=True)
    sf.write(os.path.join(folder, s + '.wav'), x, sr, subtype='PCM_16')
    rec = {'text': c['text'], 'phonemes': ph, 'others': c['others'], 'speed': round(speed, 2), 'secs': round(len(x) / sr, 2), **res}
    takes.setdefault(s, {})[voice] = rec
    json.dump(takes, open(LOG, 'w'), ensure_ascii=False, indent=1)
    made += 1
    return rec

def show(s, voice, r):
    extra = f"ahead {r.get('ahead')} partner {r.get('partner')} {r.get('rivals')}" if 'ahead' in r else f"heard {r.get('heard')!r} partner {r.get('partner')}"
    print(f"  {r['grade']:6} {s} | {voice} {r['speed']} | {extra}", flush=True)

for l in lessons:
    if ONLY and l['id'] not in ONLY: continue
    print(f"== {l['id']} {l['title']} ({round(time.time() - t0)} s, {made} takes)", flush=True)
    paired = set()
    for pool in l['pools']:
        clear = 0
        for a, b in pool['pairs']:
            if clear >= pool['keep'] + 3 and not EVERY: break
            sa, sb = slug(a), slug(b)
            paired |= {sa, sb}
            for voice in VOICES[:3]:
                ra, rb = take(sa, voice), take(sb, voice)
                if ra['grade'] == rb['grade'] == 'strict': break
            print(f" {a} / {b}: {voice} {ra['grade']}/{rb['grade']}", flush=True)
            clear += ra['grade'] == rb['grade'] == 'strict'
            if not ra['grade'] == rb['grade'] == 'strict':
                for v in VOICES[:3]: show(sa, v, takes[sa][v]); show(sb, v, takes[sb][v])
    for it in [i['text'] for i in l['items']] + [q['audio'] for q in l['quiz']] + [s['en'] for s in l['sentences']]:
        s = slug(it)
        if s in paired: continue
        for voice in VOICES:
            r = take(s, voice)
            if r['grade'] == 'strict': break
        if r['grade'] != 'strict':
            print(f" {it}: no clear take", flush=True)
            for v in VOICES: show(s, v, takes[s][v])
print('done in', round(time.time() - t0), 's;', made, 'new takes')
