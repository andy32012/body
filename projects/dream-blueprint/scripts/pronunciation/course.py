"""Parses course.txt into the lesson list and the list of clips to record.
A `P<n>` line is a pool of candidate minimal pairs for a lesson, in order of preference; the lesson keeps n of them: the first n
whose recordings came out clearly distinct in both voices (chosen.json, written by choose.py)."""
import json, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
CHOSEN = os.path.join(HERE, 'chosen.json')

# How a clip is stored in a pack: 24 kHz mono mp3 at 96 kbit/s, no tags (a clip starts with an audio frame).
# At 48 kbit/s the recogniser's lead for some close pairs (guess/gas, tree/three, ban/van) shrank to nothing; at 96 it holds.
MP3 = ['-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '96k', '-write_xing', '0', '-id3v2_version', '0', '-map_metadata', '-1', '-f', 'mp3', '-']

def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower().replace("'", '').replace('’', '')).strip('-')

def parse(path=os.path.join(HERE, 'course.txt')):
    chosen = json.load(open(CHOSEN))['pairs'] if os.path.exists(CHOSEN) else {}
    lessons = []
    cur = None
    for raw in open(path, encoding='utf-8'):
        line = raw.rstrip('\n')
        if not line.strip():
            continue
        tag, _, rest = line.partition(' ')
        rest = rest.strip()
        if tag == '#L':
            id_, kind, title, label = [p.strip() for p in rest.split('|')]
            cur = {'id': id_, 'kind': kind, 'title': title, 'tag': label, 'explain': [], 'tip': '', 'pools': [], 'pairs': [], 'items': [], 'quiz': [], 'sentences': []}
            lessons.append(cur)
        elif tag == 'H':
            cur['explain'].append(rest)
        elif tag == 'T':
            assert not cur['tip'], cur['id'] + ' has two tips'
            cur['tip'] = rest
        elif re.fullmatch(r'P\d+', tag):
            cur['pools'].append({'keep': int(tag[1:]), 'pairs': [[p.strip() for p in pair.split(' / ')] for pair in rest.split(';')]})
        elif tag == 'W':
            label, text, note = [p.strip() for p in rest.split('|')]
            cur['items'].append({'label': label, 'text': text, 'note': note})
        elif tag == 'Q':
            audio, q, options, answer, why = [p.strip() for p in rest.split('|')]
            cur['quiz'].append({'audio': audio, 'q': q, 'options': [o.strip() for o in options.split(';')], 'answer': int(answer), 'why': why})
        elif tag == 'S':
            en, zh = [p.strip() for p in rest.split(' = ')]
            cur['sentences'].append({'en': en, 'zh': zh})
        else:
            raise SystemExit('unknown line: ' + line)
    for l in lessons:
        l['pairs'] = chosen.get(l['id']) or [p for pool in l['pools'] for p in pool['pairs'][:pool['keep']]]
    return lessons

def for_app(lessons):
    """The lesson list as the app reads it: no pools, no empty fields."""
    out = []
    for l in lessons:
        l = {k: v for k, v in l.items() if k != 'pools' and v}
        out.append(l)
    return out

def lesson_texts(l):
    seen, out = set(), []
    for t in [w for p in l['pairs'] for w in p] + [i['text'] for i in l['items']] + [q['audio'] for q in l['quiz']] + [s['en'] for s in l['sentences']]:
        if slug(t) not in seen: seen.add(slug(t)); out.append(t)
    return out

def clips(lessons, pool=True):
    """slug -> {text, lessons, others (what it must not be confused with), kind}. With pool=True every candidate pair is included."""
    out = {}
    def add(text, lesson, other=None, kind='word'):
        s = slug(text)
        c = out.setdefault(s, {'text': text, 'lessons': [], 'others': [], 'kind': kind})
        if c['text'] != text:
            # the same words with different capitals or punctuation would share a file: keep them identical in the source
            raise SystemExit('two spellings for one clip: %r / %r' % (c['text'], text))
        if lesson not in c['lessons']: c['lessons'].append(lesson)
        if other and other not in c['others']: c['others'].append(other)
    for l in lessons:
        pairs = [p for pool_ in l['pools'] for p in pool_['pairs']] if pool else l['pairs']
        for a, b in pairs:
            add(a, l['id'], b); add(b, l['id'], a)
        for it in l['items']: add(it['text'], l['id'])
        for q in l['quiz']: add(q['audio'], l['id'])
        for s in l['sentences']: add(s['en'], l['id'], kind='sentence')
    for c in out.values():
        if ' ' in c['text'] and c['kind'] == 'word': c['kind'] = 'phrase'
    return out

if __name__ == '__main__':
    ls = parse()
    print(len(ls), 'lessons;', len(clips(ls, pool=False)), 'clips in the course;', len(clips(ls)), 'with every candidate pair')
    for l in ls:
        print(' ', l['id'], l['kind'], l['title'], '|', len(lesson_texts(l)), 'clips |', ' '.join('/'.join(p) for p in l['pairs']))
    if len(sys.argv) > 1:
        json.dump(for_app(ls), open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('wrote', sys.argv[1])
