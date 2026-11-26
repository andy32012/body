"""Builds the sound packs the app loads: one file per lesson and voice in public/pron.
A pack is 4 bytes (little-endian length of the index), the index as JSON {clip name: [offset, length]}, then the mp3 clips.
usage: pack.py <public/pron directory>"""
import json, re, struct, subprocess, sys
from pathlib import Path
from tempfile import TemporaryDirectory
from course import parse, slug, lesson_texts, HERE, CHOSEN, MP3, read_json

PACK_NAME = re.compile(r'p[0-9]{2,}-[fm]\.pack')

def mp3(wav):
    return subprocess.run(['ffmpeg', '-v', 'error', '-i', wav] + MP3, capture_output=True, check=True).stdout

def is_managed_pack(path):
    """Recognise only regular files in the pronunciation pack format."""
    if not PACK_NAME.fullmatch(path.name) or path.is_symlink() or not path.is_file():
        return False
    try:
        with path.open('rb') as source:
            size, = struct.unpack('<I', source.read(4))
            end = source.seek(0, 2)
            if not 0 < size < end - 4:
                return False
            source.seek(4)
            index = json.loads(source.read(size).decode('utf-8'))
            if not isinstance(index, dict) or not index:
                return False
            offset = 0
            for clip in index.values():
                if not isinstance(clip, list) or len(clip) != 2:
                    return False
                start, length = clip
                if type(start) is not int or type(length) is not int or start != offset or length < 2:
                    return False
                source.seek(4 + size + start)
                marker = source.read(2)
                if len(marker) < 2 or marker[0] != 0xff or marker[1] & 0xe0 != 0xe0:
                    return False
                offset += length
            return 4 + size + offset == end
    except (OSError, struct.error, ValueError):
        return False

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
                    voice = cuts[gender][slug(line.split('~')[0])]['voice'] if '~' in line else voices[gender][key]
                    clip = mp3(recordings / gender / voice / (key + '.wav'))
                    index[key] = [len(data), len(clip)]
                    data.extend(clip)
                head = json.dumps(index, separators=(',', ':')).encode('utf-8')
                staged_pack = staging / name
                with staged_pack.open('wb') as output:
                    output.write(struct.pack('<I', len(head)))
                    output.write(head)
                    output.write(data)
                if not is_managed_pack(staged_pack):
                    raise ValueError(f'Could not validate the staged pack: {name}')
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
        for name in sorted(wanted):
            (staging / name).replace(dest / name)
        for existing in dest.iterdir():
            if existing.name not in wanted and is_managed_pack(existing):
                existing.unlink()
                print('removed', existing.name)
    return total

if __name__ == '__main__':
    destination = Path(sys.argv[1]).absolute()
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = build_packs(destination)
    print('total', round(total / 1024 / 1024, 2), 'MB')
