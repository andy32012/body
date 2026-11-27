"""Turns scripts/word-parts.txt into src/data/word-parts.json and checks it.
usage: python3 scripts/word-parts.py"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC, OUT = os.path.join(HERE, 'word-parts.txt'), os.path.join(HERE, '..', 'src', 'data', 'word-parts.json')
levels = {w['en'].lower(): w['level'] for w in json.load(open(os.path.join(HERE, '..', 'src', 'data', 'levels.json'), encoding='utf-8'))}

def pieces(part):
    """The spellings a part can take: "-tion／-sion" → tion, sion; "in-／im-（不）" → in, im; "cap／cept／ceive" → cap, cept, ceive."""
    part = re.sub(r'（.*?）', '', part)
    return [p.strip('- ') for p in part.split('／') if p.strip('- ')]

# IDs never change: saved progress (「學過了」) points at them. Each line starts with its ID; a new line may leave it out
# and gets the next free number. The ID a part had before is never given to another part.
before = {p['part']: p['id'] for p in json.load(open(OUT, encoding='utf-8'))} if os.path.exists(OUT) else {}
taken = set(before.values())
out, problems, seen, ids = [], [], set(), set()
for n, raw in enumerate(open(SRC, encoding='utf-8'), 1):
    line = raw.strip()
    if not line or line.startswith('#'): continue
    cols = [c.strip() for c in line.split(' | ')]
    pid = cols.pop(0) if cols and re.fullmatch(r'wp\d{3,}', cols[0]) else None
    if len(cols) != 5: problems.append(f'line {n}: {len(cols)} columns'); continue
    kind, part, meaning, examples, guess = cols
    if pid is None:
        pid = before.get(part)
        if pid is None:
            pid = 'wp' + str(max([int(i[2:]) for i in taken | ids] + [0]) + 1).zfill(3)
    elif part in before and before[part] != pid: problems.append(f'line {n}: {part} was {before[part]}, not {pid}')
    elif pid in taken and before.get(part) != pid: problems.append(f'line {n}: {pid} belongs to another part')
    if pid in ids: problems.append(f'line {n}: {pid} twice')
    ids.add(pid)
    if kind not in ('字首', '字根', '字尾'): problems.append(f'line {n}: type {kind}')
    if part in seen: problems.append(f'line {n}: {part} twice')
    seen.add(part)
    exs = []
    for e in examples.split(' ; '):
        f = [x.strip() for x in e.split('=')]
        if len(f) not in (2, 3) or not f[0] or not f[1]: problems.append(f'line {n}: example {e!r}'); continue
        exs.append({'en': f[0], 'zh': f[1], **({'how': f[2]} if len(f) == 3 else {})})
    g = [x.strip() for x in guess.split('=')]
    if len(g) != 2: problems.append(f'line {n}: guess {guess!r}'); continue
    if len(exs) < 3: problems.append(f'line {n}: {part} has {len(exs)} examples')
    # every example and the guess word must really contain the part
    for w in [e['en'] for e in exs] + [g[0]]:
        low = w.lower()
        ok = any((low.startswith(p) if kind == '字首' else low.endswith(p) or low.rstrip('s').endswith(p) if kind == '字尾' else p in low) for p in pieces(part))
        if not ok: problems.append(f'line {n}: {w} does not show {part}')
    if g[0].lower() in [e['en'].lower() for e in exs]: problems.append(f'line {n}: guess word {g[0]} is also an example')
    out.append({'id': pid, 'type': kind, 'part': part, 'meaning': meaning, 'examples': exs, 'guess': {'en': g[0], 'zh': g[1]}})

zh = [p['guess']['zh'] for p in out]
for z in set(zh):
    if zh.count(z) > 1: problems.append(f'guess meaning {z} is used twice (the quiz would have two right answers)')
words = [e['en'] for p in out for e in p['examples']]
inlist = [w for w in words if w.lower() in levels]
print(len(out), 'parts:', {k: sum(p['type'] == k for p in out) for k in ('字首', '字根', '字尾')})
print(len(words), 'example words,', len(inlist), 'in the 6-level word list;', sum(levels[w.lower()] <= 2 for w in inlist), 'of them level 1-2')
if problems:
    print('\n'.join(problems)); sys.exit(1)
with open(OUT, 'w', encoding='utf-8', newline='\n') as target:
    json.dump(out, target, ensure_ascii=False, indent=1)
print('wrote', os.path.relpath(OUT))
