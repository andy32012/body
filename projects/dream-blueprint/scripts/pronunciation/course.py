"""Parses course.txt into the lesson list and the list of clips to record.
An `X` line is a long word cut into syllables: `X BEAU·ti·ful | beautiful | 漂亮的 | bjˈu|tə|fəl` — the spelling in pieces
(the stressed one in capitals), the word, its meaning, and the careful pronunciation in the synthesiser's symbols, cut at the
same places. Besides the word itself such an item has derived clips, cut from one slow recording (syllables.py):
`beautiful~slow`, each piece `beautiful~1` …, and the word growing piece by piece `beautiful~1-2` ….
A `P<n>` line is a pool of candidate minimal pairs for a lesson, in order of preference; the lesson keeps n of them: the first n
whose recordings came out clearly distinct in both voices (chosen.json, written by choose.py)."""
import json, re, sys, os
from shutil import copy2
from tempfile import mkdtemp
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
CHOSEN = os.path.join(HERE, 'chosen.json')

def read_json(path):
    with open(path, encoding='utf-8') as source:
        return json.load(source)

def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as output:
        json.dump(data, output, ensure_ascii=False, indent=1)


def publish_recording_files(files, staging):
    """Replace prepared files or remove obsolete ones (source=None), rolling back on an I/O failure."""
    previous = []
    for index, (source, target) in enumerate(files):
        saved = None
        if target.exists() or target.is_symlink():
            saved = staging / f'previous-{index}'
            copy2(target, saved, follow_symlinks=False)
        previous.append((source, target, saved))
    published = []
    try:
        for source, target, saved in previous:
            if source is None:
                target.unlink()
            else:
                source.replace(target)
            published.append((target, saved))
    except OSError as publish_error:
        failed_to_restore = []
        for target, saved in reversed(published):
            try:
                if saved is None:
                    target.unlink(missing_ok=True)
                else:
                    saved.replace(target)
            except OSError:
                failed_to_restore.append((target, saved))
        if failed_to_restore:
            recovery = Path(mkdtemp(prefix='pronunciation-recovery-'))
            details = []
            for target, saved in failed_to_restore:
                if saved is None:
                    details.append(f'{target} had no prior file')
                else:
                    recovered = recovery / saved.name
                    copy2(saved, recovered, follow_symlinks=False)
                    details.append(f'{target} has its previous version at {recovered}')
            raise RuntimeError('Publication failed and some files could not be restored:\n - ' + '\n - '.join(details)) from publish_error
        raise

# How a clip is stored in a pack: 24 kHz mono mp3 at 96 kbit/s, no tags (a clip starts with an audio frame).
# At 48 kbit/s the recogniser's lead for some close pairs (guess/gas, tree/three, ban/van) shrank to nothing; at 96 it holds.
MP3 = ['-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '96k', '-write_xing', '0', '-id3v2_version', '0', '-map_metadata', '-1', '-f', 'mp3', '-']

def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower().replace("'", '').replace('’', '')).strip('-')

# The synthesiser's symbols as the KK symbols the course teaches (lesson p00).
KK = [('əɹ', 'ɚ'), ('ɜɹ', 'ɝ'), ('A', 'e'), ('I', 'aɪ'), ('O', 'o'), ('W', 'aʊ'), ('Y', 'ɔɪ'), ('ʧ', 'tʃ'), ('ʤ', 'dʒ'), ('ɡ', 'g'), ('ɹ', 'r'), ('ᵊ', 'ə'), ('ɐ', 'ə'), ('ɾ', 't')]
def kk(piece):
    """One syllable in KK. An unstressed [i] is written [ɪ], as Taiwanese dictionaries do (emergency [ɪˋmɝdʒənsɪ])."""
    stressed = 'ˈ' in piece or 'ˌ' in piece
    out = piece.replace('ˈ', '').replace('ˌ', '')
    for a, b in KK: out = out.replace(a, b)
    return out if stressed else out.replace('i', 'ɪ')
def derived(item):
    """The extra clips of a syllable item: slow, every piece, and the growing word (two pieces … all but the last)."""
    n, t = len(item['kk']), item['text']
    return [t + '~slow'] + [f'{t}~{i}' for i in range(1, n + 1)] + [f'{t}~1-{j}' for j in range(2, n)]


WH_QUESTION = re.compile(r"^(?:who|whom|whose|what|where|when|why|how|which)\b", re.I)


def intonation_directions(lesson):
    """Use the same explicit intonation and follow-up reading rules for recording and for checking the packs."""
    if lesson['kind'] != 'listen' or not any(item['label'].endswith(('↗', '↘')) for item in lesson['items']):
        return {}

    directions = {}

    def set_direction(text, direction):
        if directions.setdefault(text, direction) != direction:
            raise ValueError(f"{lesson['id']}: conflicting directions for {text!r}")

    for item in lesson['items']:
        if item['label'].endswith(('↗', '↘')):
            set_direction(item['text'], 'rise' if item['label'].endswith('↗') else 'fall')
    for quiz in lesson['quiz']:
        answer = quiz['options'][quiz['answer']]
        if not answer.startswith(('上升', '下降')):
            raise ValueError(f"{lesson['id']}: missing intonation in the answer for {quiz['audio']!r}")
        set_direction(quiz['audio'], 'rise' if answer.startswith('上升') else 'fall')
    for text in [item['text'] for item in lesson['items']] + [sentence['en'] for sentence in lesson['sentences']]:
        directions.setdefault(text, 'rise' if text.endswith('?') and not WH_QUESTION.match(text) else 'fall')
    return directions

def parse(path=os.path.join(HERE, 'course.txt'), *, chosen_pairs=None):
    chosen = chosen_pairs
    if chosen is None:
        chosen = read_json(CHOSEN)['pairs'] if os.path.exists(CHOSEN) else {}
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
            cur = {'id': id_, 'kind': kind, 'title': title, 'tag': label, 'explain': [], 'tip': '', 'pools': [], 'pairs': [], 'items': [], 'quiz': [], 'sentences': [], 'syll': {}}
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
        elif tag == 'X':
            label, text, note, said = [p.strip() for p in rest.split(' | ')]
            pieces = said.split('|')
            assert len(pieces) == len(label.split('·')), text + ': the spelling and the sounds are cut into a different number of pieces'
            assert ''.join(label.split('·')).lower() == text.lower(), text + ': the pieces do not spell the word'
            assert sum('ˈ' in p for p in pieces) == 1 and 'ˈ' in pieces[[p == p.upper() for p in label.split('·')].index(True)], text + ': the stress mark is not in the capital piece'
            cur['items'].append({'label': label, 'text': text, 'note': note, 'kk': [kk(p) for p in pieces]})
            cur['syll'][text] = pieces
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
        l = {k: v for k, v in l.items() if k not in ('pools', 'syll') and v}
        out.append(l)
    return out

def lesson_texts(l):
    seen, out = set(), []
    for t in [w for p in l['pairs'] for w in p] + [i['text'] for i in l['items']] + [d for i in l['items'] if 'kk' in i for d in derived(i)] + [q['audio'] for q in l['quiz']] + [s['en'] for s in l['sentences']]:
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
        write_json(sys.argv[1], for_app(ls))
        print('wrote', sys.argv[1])
