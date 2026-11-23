"""Builds the sound packs the app loads: one file per lesson and voice in public/pron.
A pack is 4 bytes (little-endian length of the index), the index as JSON {clip name: [offset, length]}, then the mp3 clips.
usage: pack.py <public/pron directory>"""
import json, os, struct, subprocess, sys
from course import parse, slug, lesson_texts, HERE, CHOSEN, MP3

dest = sys.argv[1]
os.makedirs(dest, exist_ok=True)
voices = json.load(open(CHOSEN))['voices']
# the pieces of a long word ("beautiful~2") are in the voice syllables.py cut them from
cuts = {g: json.load(open(os.path.join(HERE, 'out', f'syllables-{g}.json'))) if os.path.exists(os.path.join(HERE, 'out', f'syllables-{g}.json')) else {} for g in 'fm'}
def mp3(wav):
    return subprocess.run(['ffmpeg', '-v', 'error', '-i', wav] + MP3, capture_output=True, check=True).stdout
total, wanted = 0, set()
for l in parse():
    for g in 'fm':
        index, data = {}, b''
        for t in lesson_texts(l):
            s = slug(t)
            voice = cuts[g][slug(t.split('~')[0])]['voice'] if '~' in t else voices[g][s]
            clip = mp3(os.path.join(HERE, 'out', g, voice, s + '.wav'))
            index[s] = [len(data), len(clip)]
            data += clip
        head = json.dumps(index, separators=(',', ':')).encode()
        name = f"{l['id']}-{g}.pack"
        wanted.add(name)
        open(os.path.join(dest, name), 'wb').write(struct.pack('<I', len(head)) + head + data)
        total += 4 + len(head) + len(data)
        print(name, len(index), 'clips', round((4 + len(head) + len(data)) / 1024), 'KB')
for f in os.listdir(dest):
    if f not in wanted: os.remove(os.path.join(dest, f)); print('removed', f)
print('total', round(total / 1024 / 1024, 2), 'MB')
