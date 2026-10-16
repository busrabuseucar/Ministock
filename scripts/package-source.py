"""Package source from an explicit allowlist; never sweep the whole workspace."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {
    'README.md', 'LICENSE', 'package.json', 'package-lock.json', 'tsconfig.json',
    'next.config.ts', 'vite.config.ts', 'drizzle.config.ts', 'components.json',
    'eslint.config.mjs', 'postcss.config.mjs', 'playwright.config.ts', '.gitignore',
}
SOURCE_DIRS = {'app', 'components', 'hooks', 'lib', 'db', 'drizzle', 'worker',
               'build', 'scripts', 'tests', 'docs', 'vendor', 'public', '.github'}
SOURCE_SUFFIXES = {'.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.sql', '.css',
                   '.md', '.py', '.sh', '.yml', '.yaml', '.svg', '.png', '.jpg', '.webp'}
EXCLUDE = {'node_modules', '__pycache__', 'test-results', 'playwright-report',
           'coverage', '.git', '.wrangler', '.sites-runtime', 'dist', '.next'}

def build_archive(root: Path) -> Path:
    destination = root / 'public' / 'ministock-source.zip'
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob('*')):
            relative = path.relative_to(root)
            if not path.is_file() or any(part in EXCLUDE for part in relative.parts):
                continue
            if any(parent.is_symlink() for parent in [path, *path.parents] if parent != root.parent):
                continue
            if path.name.startswith('.env'):
                continue
            allowed = relative.as_posix() in ROOT_FILES or (
                len(relative.parts) > 1 and relative.parts[0] in SOURCE_DIRS
                and path.suffix in SOURCE_SUFFIXES
            )
            if allowed:
                archive.write(path, relative.as_posix())
        archive.writestr('.openai/hosting.json', json.dumps({'d1':'DB','r2':None},indent=2)+'\n')
    return destination

if __name__ == '__main__':
    destination = build_archive(ROOT)
    print(f'Source bundle: {destination.name} ({destination.stat().st_size:,} bytes)')
