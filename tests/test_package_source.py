import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('packager', Path(__file__).resolve().parents[1]/'scripts/package-source.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SourceArchiveTests(unittest.TestCase):
    def test_only_source_and_sanitized_manifest_are_packaged(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in ['README.md','package.json','lib/core.ts','private.json','customer.sqlite','docs/data.db','tests/test-results/state.json','lib/.env.local','public/key.pem','.openai/hosting.json']:
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('fixture')
            (root/'lib/link.ts').symlink_to(root/'private.json')
            archive=module.build_archive(root)
            with zipfile.ZipFile(archive) as z:
                self.assertEqual(set(z.namelist()),{'README.md','package.json','lib/core.ts','.openai/hosting.json'})
                self.assertNotIn('fixture',z.read('.openai/hosting.json').decode())

if __name__ == '__main__': unittest.main()
