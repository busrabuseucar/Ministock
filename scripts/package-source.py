"""Create a shareable source ZIP, with no data, credentials or Site identity."""
from pathlib import Path
import json
import zipfile
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public'/'ministock-source.zip'
EXCLUDE={'.git','node_modules','.openai','.wrangler','.sites-runtime','dist','.next','outputs','work','__pycache__'}
with zipfile.ZipFile(DEST,'w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(ROOT.rglob('*')):
        relative=path.relative_to(ROOT)
        if not path.is_file() or path.is_symlink() or any(part in EXCLUDE for part in relative.parts):
            continue
        if path==DEST or path.name.startswith('.env') or path.suffix in {'.log','.zip','.tsbuildinfo','.pem'}:
            continue
        archive.write(path,relative.as_posix())
    archive.writestr('.openai/hosting.json',json.dumps({'d1':'DB','r2':None},indent=2)+'\n')
print(f'Source bundle: {DEST.name} ({DEST.stat().st_size:,} bytes)')
