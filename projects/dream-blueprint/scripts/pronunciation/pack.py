"""Builds the sound packs the app loads: one file per lesson and voice in public/pron.
A pack is 4 bytes (little-endian length of the index), the index as JSON {clip name: [offset, length]}, then the mp3 clips.
usage: pack.py <public/pron directory>"""
import argparse, json, re, struct
from pathlib import Path
from tempfile import TemporaryDirectory
from course import parse, slug, lesson_texts, HERE, CHOSEN, MP3, read_json, publish_recording_files
from audio_codec import convert_audio

PACK_NAME = re.compile(r'p[0-9]{2,}-[fm]\.pack')

def mp3(wav):
    return convert_audio(['-i', wav, *MP3], operation=f'Encode {wav}')


def read_pack(path):
    raw = path.read_bytes()
    if len(raw) < 4:
        raise ValueError('missing pack header')
    size, = struct.unpack_from('<I', raw)
    if not 0 < size < len(raw) - 4:
        raise ValueError('invalid pack index length')
    index = json.loads(raw[4:4 + size].decode('utf-8'))
    payload = raw[4 + size:]
    if not isinstance(index, dict) or not index:
        raise ValueError('missing pack clip index')
    offset = 0
    for name, clip in index.items():
        if not isinstance(clip, list) or len(clip) != 2:
            raise ValueError(f'invalid pack entry for {name!r}')
        start, length = clip
        if type(start) is not int or type(length) is not int or start != offset or length < 2 or start + length > len(payload):
            raise ValueError(f'invalid audio range for {name!r}')
        if payload[start] != 0xff or payload[start + 1] & 0xe0 != 0xe0:
            raise ValueError(f'missing MP3 frame for {name!r}')
        offset += length
    if offset != len(payload):
        raise ValueError('pack index does not cover the full audio payload')
    return index, payload

def is_managed_pack(path):
    """Recognise only regular files in the pronunciation pack format."""
    if not PACK_NAME.fullmatch(path.name) or path.is_symlink() or not path.is_file():
        return False
    try:
        read_pack(path)
    except (OSError, ValueError):
        return False
    return True

def build_packs(dest):
    voices = read_json(CHOSEN)['voices']
    recordings = Path(HERE) / 'out'
    # The pieces of a long word are in the voice syllables.py cut them from.
    cut_files = {g: recordings / f'syllables-{g}.json' for g in 'fm'}
    cuts = {g: read_json(path) if path.exists() else {} for g, path in cut_files.items()}
    total = 0
    wanted = set()
    with TemporaryDirectory(prefix='.pron-pack-', dir=dest.parent) as temporary:
        staging = Path(temporary)
        for lesson in parse():
            for gender in 'fm':
                name = f"{lesson['id']}-{gender}.pack"
                if not PACK_NAME.fullmatch(name) or name in wanted:
                    raise ValueError(f'Unexpected or duplicate pack name: {name}')
                index = {}
                data = bytearray()
                for line in lesson_texts(lesson):
                    key = slug(line)
                    if '~' in line:
                        word = line.split('~', 1)[0]
                        cut = cuts[gender].get(slug(word))
                        if not cut or cut.get('ok') is not True or cut.get('pieces') != lesson['syll'][word]:
                            raise ValueError(f"{name}: no approved syllable recording for {word!r}; run syllables.py for {gender}")
                        voice = cut['voice']
                    else:
                        voice = voices[gender][key]
                    clip = mp3(recordings / gender / voice / (key + '.wav'))
                    index[key] = [len(data), len(clip)]
                    data.extend(clip)
                head = json.dumps(index, separators=(',', ':')).encode('utf-8')
                staged_pack = staging / name
                with staged_pack.open('wb') as output:
                    output.write(struct.pack('<I', len(head)))
                    output.write(head)
                    output.write(data)
                read_pack(staged_pack)
                wanted.add(name)
                size = 4 + len(head) + len(data)
                total += size
                print(name, len(index), 'clips', round(size / 1024), 'KB')
        if not wanted:
            raise ValueError('The course did not produce any pronunciation packs.')
        dest.mkdir(parents=True, exist_ok=True)
        for name in wanted:
            existing = dest / name
            if existing.is_symlink() or (existing.exists() and not is_managed_pack(existing)):
                raise ValueError(f'Refusing to replace an unrecognised file: {existing}')
        obsolete = sorted(path for path in dest.iterdir() if path.name not in wanted and is_managed_pack(path))
        replacements = [(staging / name, dest / name) for name in sorted(wanted)]
        publish_recording_files(replacements + [(None, path) for path in obsolete], staging)
        for path in obsolete:
            print('removed', path.name)
    return total

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build the pronunciation packs in one directory.')
    parser.add_argument('directory')
    destination = Path(parser.parse_args().directory).absolute()
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = build_packs(destination)
    print('total', round(total / 1024 / 1024, 2), 'MB')
