"""Decides which candidate pairs each lesson keeps and which take (voice) every clip uses, from the grades in out/f.json and out/m.json.
A pair is kept only when both words are clear in one and the same voice, for the woman's voice and for the man's.
Writes chosen.json (read by course.py and pack.py) and recordings.json (the check record of every clip in the course)."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from course import parse, slug, lesson_texts, HERE, CHOSEN, read_json, write_json, publish_recording_files

ORDER = {'f': ['af_bella', 'af_heart', 'af_sarah', 'af_kore'], 'm': ['am_adam', 'am_fenrir', 'am_michael', 'am_puck']}
takes = {g: read_json(os.path.join(HERE, 'out', g + '.json')) for g in 'fm'}
fixed_path = os.path.join(HERE, 'intonation.json')
fixed = read_json(fixed_path) if os.path.exists(fixed_path) else {}
voices = {'f': {}, 'm': {}}
ok = {'strict': ('strict',), 'weak': ('strict', 'weak')}
problems = []
missing = []

def pair_voice(g, a, b, level):
    """The voice in which both words of a pair are clear (the one with the widest margin; an earlier voice wins a near tie)."""
    best = None
    for v in ORDER[g]:
        if voices[g].get(a, v) != v or voices[g].get(b, v) != v: continue     # a word already in the course keeps its voice
        ta, tb = takes[g].get(a, {}).get(v), takes[g].get(b, {}).get(v)
        if ta and tb and ta['grade'] in ok[level] and tb['grade'] in ok[level]:
            margin = min(ta['value'], tb['value'])
            if best is None or margin > best[0] + 0.5: best = (margin, v)
    return best

COMFORTABLE = 2.0      # a margin this far past the pass mark, in both voices, in all three measurements
pairs = {}
lessons = parse(chosen_pairs={})
for l in lessons:
    picked = []
    for n, pool in enumerate(l['pools']):
        got = []
        def take_pair(a, b, level, least):
            if len(got) >= pool['keep'] or [a, b] in got: return
            plan = {g: pair_voice(g, slug(a), slug(b), level) for g in 'fm'}
            if not all(plan.values()) or min(m for m, _ in plan.values()) < least: return
            got.append([a, b])
            for g in 'fm': voices[g][slug(a)] = voices[g][slug(b)] = plan[g][1]
            if level == 'weak': problems.append(f"{l['id']}: {a} / {b} kept although only fairly clear")
        # the pair the lesson is named after comes first; then the comfortably clear pairs in the order of the source;
        # then, if there are not enough, the remaining clear ones, widest margin first
        if n == 0: take_pair(*pool['pairs'][0], 'strict', -99)
        for a, b in pool['pairs']: take_pair(a, b, 'strict', COMFORTABLE)
        def margin(pair):
            plan = [pair_voice(g, slug(pair[0]), slug(pair[1]), 'strict') for g in 'fm']
            return min(p[0] for p in plan) if all(plan) else -99
        for a, b in sorted(pool['pairs'], key=margin, reverse=True): take_pair(a, b, 'strict', -99)
        for a, b in pool['pairs']: take_pair(a, b, 'weak', -99)
        got.sort(key=pool['pairs'].index)
        if len(got) < pool['keep']: problems.append(f"{l['id']}: only {len(got)} of {pool['keep']} pairs are clear in both voices")
        picked += got
    if l['pools']:
        pairs[l['id']] = picked
        l['pairs'] = picked
        if not picked:
            missing.append(f"{l['id']}: no selectable pairs")

# every other clip: the first voice with a clear take, otherwise the clearest one there is
record = {}
for l in lessons:
    for t in lesson_texts(l):
        if '~' in t: continue          # the pieces of a long word are cut by syllables.py and follow the word (below)
        s = slug(t)
        for g in 'fm':
            have = takes[g].get(s, {})
            if not have:
                missing.append(f"{l['id']}: no recording of {t!r} ({g})")
                continue
            if s not in voices[g]:
                forced = fixed.get(g, {}).get(s)
                clear = [v for v in ORDER[g] if have.get(v, {}).get('grade') == 'strict']
                voices[g][s] = forced or (clear[0] if clear else max(have, key=lambda v: have[v]['value']))
            r = have.get(voices[g][s])
            if r is None:
                missing.append(f"{l['id']}: no recording of {t!r} in the selected voice {voices[g][s]}")
                continue
            if r['grade'] != 'strict': problems.append(f"{l['id']}: {t!r} ({g}, {voices[g][s]}) is {r['grade']}: {r.get('rivals') or r.get('heard')}")
            record.setdefault(l['id'], {}).setdefault(t, {})[g] = {'voice': voices[g][s], **{k: r[k] for k in ('phonemes', 'speed', 'secs', 'grade', 'ahead', 'partner', 'rivals', 'heard', 'pitch') if k in r}}
# the long words cut into syllables: what syllables.py made of each (it needs the chosen voices, so on a first run
# this part is empty; run syllables.py and then choose.py again)
cuts = {g: read_json(p) if os.path.exists(p := os.path.join(HERE, 'out', f'syllables-{g}.json')) else {} for g in 'fm'}
for l in lessons:
    for word, pieces in l['syll'].items():
        for g in 'fm':
            c = cuts[g].get(slug(word))
            if not c or c['pieces'] != pieces: problems.append(f"{l['id']}: {word!r} is not cut into syllables yet ({g})"); continue
            if not c['ok']: problems.append(f"{l['id']}: the slow {word!r} ({g}) came back as {c['heard']}")
            # not a fault, but worth knowing: the slow word did not come back right in the word's own voice
            if c['voice'] != voices[g].get(slug(word)): print(f"note: {word!r} ({g}): the pieces are in {c['voice']}, the whole word in {voices[g].get(slug(word))}")
            record.setdefault(l['id'], {}).setdefault(word, {}).setdefault(g, {})['syllables'] = {k: c[k] for k in ('voice', 'speed', 'stretch', 'heard', 'slow_secs', 'piece_secs', 'slow_sounds', 'piece_sounds', 'vowel_heard')}
if missing:
    raise SystemExit('Previous selections kept. Missing recording data:\n - ' + '\n - '.join(missing))

chosen_path = Path(CHOSEN)
recordings_path = Path(HERE) / 'recordings.json'
with TemporaryDirectory(prefix='.choose-', dir=HERE) as temporary:
    staged = Path(temporary)
    next_chosen = staged / chosen_path.name
    next_recordings = staged / recordings_path.name
    write_json(next_chosen, {'pairs': pairs, 'voices': voices})
    write_json(next_recordings, record)
    publish_recording_files([(next_recordings, recordings_path), (next_chosen, chosen_path)], staged)
for l in lessons:
    if l['pools']: print(l['id'], ' '.join('/'.join(p) for p in l['pairs']))
for g in 'fm':
    used = list(voices[g].values())
    print(g, {v: used.count(v) for v in ORDER[g] if v in used})
print(len(problems), 'things to look at:')
for p in problems: print(' -', p)
