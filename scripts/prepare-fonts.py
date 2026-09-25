"""Optional font maintenance: Python 3.10+, fonttools[woff], brotli.

Run from any directory. Normal extension builds use the committed WOFF2 files.
Only fixed UI/question glyphs are bundled for Chinese; free-form input uses the
system CJK fonts. Original licenses are copied unchanged.
"""
from pathlib import Path
from urllib.request import urlopen
from io import BytesIO
import hashlib
import json
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'assets' / 'fonts'
OUT.mkdir(parents=True, exist_ok=True)
fixed = '\n'.join((ROOT / p).read_text(encoding='utf-8') for p in [
    'src/shared/questions.json', 'src/shared/strings.ts', 'popup.html', 'overlay.html'])
sources = [
    ('source-han-ui', 'Destroy Han',
     'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/Variable/TTF/Subset/SourceHanSansCN-VF.ttf',
     'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/LICENSE.txt',
     {ord(c) for c in fixed if ord(c) > 127}),
    ('manrope-latin', 'Destroy Manrope',
     'https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf',
     'https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt',
     set(range(32, 0x250)) | set(range(0x2000, 0x2070))),
]
records = []
for stem, family, url, license_url, chars in sources:
    data = urlopen(url, timeout=90).read()
    font = TTFont(BytesIO(data))
    options = subset.Options()
    options.flavor = 'woff2'
    options.name_IDs = ['*']
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=chars)
    worker.subset(font)
    font = instantiateVariableFont(font, {'wght': (400, 600)}, inplace=True)
    # Rename derived subsets; preserve copyright, license and author records.
    names = {1: family, 2: 'Regular', 3: family + ' UI subset 1.0',
             4: family, 6: family.replace(' ', ''), 16: family, 17: 'Regular'}
    for name in font['name'].names:
        if name.nameID in names:
            name.string = names[name.nameID].encode(name.getEncoding())
    font.flavor = 'woff2'
    target = OUT / (stem + '.woff2')
    font.save(target)
    (OUT / (stem + '-LICENSE.txt')).write_bytes(urlopen(license_url, timeout=45).read())
    records.append({'file': target.name, 'family': family, 'source': url,
                    'license': license_url, 'sourceSha256': hashlib.sha256(data).hexdigest(),
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                    'bytes': target.stat().st_size})
(OUT / 'sources.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
print(json.dumps(records, indent=2))
