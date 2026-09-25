"""Optional asset rebuild: Python 3.10+, FFmpeg/ffprobe with libopus on PATH.

Run from any directory. Only compressed Opus assets ship; originals stay in artifacts.
"""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import subprocess
import urllib.request
import argparse

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'artifacts/audio-sources'
OUT = ROOT / 'public/assets/audio'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = {
    'swing': ('hernandack', 'https://opengameart.org/content/short-loops-background-music-pack', 'https://opengameart.org/sites/default/files/Swinging%20Sweet_0.ogg', 'swing.ogg'),
    'winter': ('hernandack', 'https://opengameart.org/content/short-loops-background-music-pack', 'https://opengameart.org/sites/default/files/Winter%20Dust_0.ogg', 'winter.ogg'),
    'wisdom': ('hernandack', 'https://opengameart.org/content/short-loops-background-music-pack', 'https://opengameart.org/sites/default/files/A%20Brand%20New%20Wisdom.ogg', 'wisdom.ogg'),
    'creature': ('rubberduck', 'https://opengameart.org/content/80-cc0-creature-sfx', 'https://opengameart.org/sites/default/files/80-CC0-creature-SFX_0.zip', 'creature.zip'),
    'impact': ('Kenney', 'https://kenney.nl/assets/impact-sounds', 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip', 'impact.zip'),
    'rpg': ('Kenney', 'https://kenney.nl/assets/rpg-audio', 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip', 'rpg.zip'),
    'scifi': ('Kenney', 'https://kenney.nl/assets/sci-fi-sounds', 'https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip', 'scifi.zip'),
    'interface': ('Kenney', 'https://kenney.nl/assets/interface-sounds', 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip', 'interface.zip'),
}
# ID, source pack, member, kind, optional trim length, runtime gain.
ASSETS = [
    ('entrance', 'swing', '', 'phrase', 1.8, .45),
    ('destruction', 'swing', '', 'loop', None, .45),
    ('ruins', 'winter', '', 'loop', None, .22),
    ('restoration', 'wisdom', '', 'loop', None, .42),
    ('sleep', 'wisdom', '', 'phrase', 3.3, .3),
    ('roar', 'creature', 'roar_02.ogg', 'effect', None, .48),
    ('breathing', 'creature', 'breath.ogg', 'effect', None, .18),
    ('snore', 'creature', 'snore.ogg', 'effect', None, .25),
    ('charge', 'scifi', 'Audio/forceField_000.ogg', 'effect', None, .3),
    ('breath', 'scifi', 'Audio/thrusterFire_000.ogg', 'effect', 2.8, .4),
    ('release', 'scifi', 'Audio/explosionCrunch_000.ogg', 'effect', None, .32),
    ('question', 'interface', 'Audio/question_001.ogg', 'effect', None, .28),
    ('confirm', 'interface', 'Audio/confirmation_001.ogg', 'effect', None, .35),
    ('assemble', 'interface', 'Audio/maximize_001.ogg', 'effect', None, .22),
    ('assemble1', 'interface', 'Audio/maximize_002.ogg', 'effect', None, .22),
    ('accent', 'interface', 'Audio/pluck_001.ogg', 'effect', None, .35),
]
for i in range(2):
    ASSETS += [
        (f'claw{i}', 'impact', f'Audio/impactPunch_heavy_{i:03}.ogg', 'effect', None, .65),
        (f'tail{i}', 'impact', f'Audio/impactWood_heavy_{i:03}.ogg', 'effect', None, .6),
        (f'debris{i}', 'impact', f'Audio/impactPlank_medium_{i:03}.ogg', 'effect', None, .28),
        (f'paper{i}', 'rpg', f'Audio/bookFlip{i+1}.ogg', 'effect', None, .25),
        (f'whoosh{i}', 'rpg', 'Audio/knifeSlice' + ('2' if i else '') + '.ogg', 'effect', None, .45),
    ]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--only', nargs='+', help='Rebuild selected asset IDs, preserving other files and evidence.')
selected = parser.parse_args().only
known = {asset[0] for asset in ASSETS}
if selected and set(selected) - known:
    parser.error('Unknown asset IDs: ' + ', '.join(sorted(set(selected) - known)))
assets = [asset for asset in ASSETS if not selected or asset[0] in selected]
catalog_path = OUT / 'catalog.json'
evidence_path = ROOT / 'docs/audio-sources.json'
catalog = json.loads(catalog_path.read_text(encoding='utf8')) if selected else {}
previous = json.loads(evidence_path.read_text(encoding='utf8')) if selected else []
evidence = {item['id']: item for item in previous}
needed_packs = {asset[1] for asset in assets}
for key, (author, page, url, filename) in SOURCES.items():
    if key not in needed_packs:
        continue
    path = CACHE / filename
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            path.write_bytes(response.read())
    if path.suffix == '.zip':
        with ZipFile(path) as archive:
            if 'License.txt' in archive.namelist():
                (OUT / f'License-{key}.txt').write_bytes(archive.read('License.txt'))

for id, pack, member, kind, trim, gain in assets:
    author, page, url, filename = SOURCES[pack]
    source = CACHE / filename
    if member:
        with ZipFile(source) as archive:
            data = archive.read(member)
        source = CACHE / (pack + '-' + Path(member).name)
        source.write_bytes(data)
    destination = OUT / (id + '.opus')
    args = ['ffmpeg', '-v', 'error', '-y', '-i', str(source)]
    if trim:
        args += ['-t', str(trim)]
    filters = ['loudnorm=I=-22:TP=-3:LRA=7']
    if kind == 'phrase':
        filters += ['afade=t=in:d=0.04', f'afade=t=out:st={trim-.45}:d=0.45']
    elif kind == 'effect':
        filters += ['afade=t=in:d=0.003']
        if trim:
            filters += [f'afade=t=out:st={trim-.2}:d=0.2']
    args += ['-af', ','.join(filters), '-ar', '48000', '-ac', '1' if kind == 'effect' else '2', '-c:a', 'libopus', '-b:a', '48k' if kind == 'effect' else '96k', str(destination)]
    subprocess.run(args, check=True)
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(destination)], text=True))
    catalog[id] = {'file': destination.name, 'kind': kind, 'gain': gain, 'duration': duration, 'crossfade': .12 if kind == 'loop' else 0}
    evidence[id] = {'id': id, 'author': author, 'page': page, 'download': url, 'member': member or filename, 'license': 'CC0-1.0', 'verified': '2026-09-22', 'sourceSha256': sha(source), 'file': destination.name, 'sha256': sha(destination), 'bytes': destination.stat().st_size, 'processing': {'trimSeconds': trim, 'filters': filters, 'codec': 'Opus', 'channels': 1 if kind == 'effect' else 2}}
ordered_ids = [asset[0] for asset in ASSETS if asset[0] in catalog]
catalog_path.write_text(json.dumps({id: catalog[id] for id in ordered_ids}, indent=2) + '\n', encoding='utf8')
evidence_path.write_text(json.dumps([evidence[id] for id in ordered_ids], ensure_ascii=False, indent=2) + '\n', encoding='utf8')
total = sum(p.stat().st_size for p in OUT.iterdir() if p.suffix in ['.ogg', '.opus', '.m4a', '.aac'])
assert total <= 3_000_000, total
print(f'{len(catalog)} compressed assets; all shipped audio {total:,} bytes')
