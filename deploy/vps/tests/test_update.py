"""Failure-path checks with fake Docker; no production credentials or containers."""
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
REVISION = 'a' * 40
IMAGE = 'ghcr.io/longtu1106/paperclip-server@sha256:' + 'b' * 64


class UpdateSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.deploy = self.root / 'deploy'
        self.deploy.mkdir()
        for file in SOURCE.glob('*.sh'):
            shutil.copyfile(file, self.deploy / file.name)
        for name in ['compose.yaml', 'compose.public.yaml', 'Caddyfile']:
            shutil.copyfile(SOURCE / name, self.deploy / name)
        self.original = b'# retained\nPAPERCLIP_IMAGE=old@sha256:123\nBETTER_AUTH_SECRET=fake-test-only\n'
        (self.deploy / '.env').write_bytes(self.original)
        (self.deploy / 'public.env').write_text('PUBLIC_FQDN=agents.culi4life.party\n')
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.log = self.root / 'docker.jsonl'
        self.env = dict(os.environ, PATH=str(self.bin) + ':' + os.environ['PATH'],
                        HOME=str(self.root), TEST_LOG=str(self.log), TEST_REVISION=REVISION)
        sudo = self.bin / 'sudo'
        sudo.write_text('#!/bin/sh\nexec "$@"\n')
        sudo.chmod(0o755)
        sleep = self.bin / 'sleep'
        sleep.write_text('#!/bin/sh\nexit 0\n')
        sleep.chmod(0o755)
        docker = self.bin / 'docker'
        docker.write_text('''#!/usr/bin/env python3
import io, json, os, sys, tarfile
a = sys.argv[1:]
with open(os.environ['TEST_LOG'], 'a') as output: output.write(json.dumps(a) + '\\n')
if a[0] == 'compose':
    a = a[9:]
    if a[0] == 'ps': print('original-container')
    elif a[0] == 'exec' and 'pg_dump' in a:
        if os.environ.get('TEST_FAIL') == 'dump': sys.exit(1)
        sys.stdout.buffer.write(b'fake-custom-format-dump')
    elif a[0] == 'exec' and 'pg_restore' in a:
        sys.stdin.buffer.read()
        if os.environ.get('TEST_FAIL') == 'restore-list': sys.exit(1)
    elif a[0] == 'up' and os.environ.get('TEST_FAIL') == 'up': sys.exit(1)
elif a[0] == 'inspect':
    print('true' if 'Running' in a[2] else 'sha256:old-image')
elif a[:2] == ['image', 'inspect']:
    f = a[3]
    if 'Architecture' in f: print('linux/amd64')
    elif 'revision' in f:
        print('wrong' if os.environ.get('TEST_FAIL') == 'revision' else os.environ['TEST_REVISION'])
    elif 'source' in f: print('https://github.com/longtu1106/paperclip')
elif a[0] == 'run':
    if os.environ.get('TEST_FAIL') == 'archive': sys.exit(1)
    with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as archive:
        info = tarfile.TarInfo('config.json'); payload = b'{}'; info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))
''')
        docker.chmod(0o755)
        # Mock only the external HTTPS response, leaving the real env-file rewrite intact.
        stub = self.root / 'python-stub'
        stub.mkdir()
        (stub / 'sitecustomize.py').write_text('''import io, json, os, urllib.request
def health(*args, **kwargs):
    revision = os.environ['TEST_REVISION']
    if os.environ.get('TEST_FAIL') == 'health': revision = 'wrong'
    return io.BytesIO(json.dumps(dict(status='ok', deploymentMode='authenticated',
        deploymentExposure='public', commit=revision)).encode())
urllib.request.urlopen = health
''')
        self.env['PYTHONPATH'] = str(stub)

    def run_script(self, *args, fail=''):
        self.env['TEST_FAIL'] = fail
        return subprocess.run(['bash', str(self.deploy / 'update-image.sh'), *args],
                              env=self.env, capture_output=True, text=True)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def assert_no_replace(self):
        self.assertEqual((self.deploy / '.env').read_bytes(), self.original)
        self.assertFalse(any('up' in call for call in self.calls()))

    def test_mutable_tag_rejected_without_docker_or_env_changes(self):
        result = self.run_script('ghcr.io/longtu1106/paperclip-server:latest', REVISION)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.calls(), [])
        self.assert_no_replace()

    def test_wrong_revision_rejected_before_stopping_current_app(self):
        result = self.run_script(IMAGE, REVISION, fail='revision')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[0] == 'stop' for call in self.calls()))
        self.assert_no_replace()

    def test_failed_database_dump_restarts_original_and_does_not_update(self):
        result = self.run_script(IMAGE, REVISION, fail='dump')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(['start', 'original-container'], self.calls())
        self.assert_no_replace()

    def test_failed_volume_archive_restarts_original_and_does_not_update(self):
        result = self.run_script(IMAGE, REVISION, fail='archive')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(['start', 'original-container'], self.calls())
        self.assert_no_replace()

    def test_failed_dump_validation_does_not_update(self):
        result = self.run_script(IMAGE, REVISION, fail='restore-list')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(['start', 'original-container'], self.calls())
        self.assert_no_replace()

    def test_success_preserves_secrets_and_only_recreates_application(self):
        result = self.run_script(IMAGE, REVISION)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.deploy / '.env').read_bytes(),
                         self.original.replace(b'old@sha256:123', IMAGE.encode()))
        backups = list((self.root / 'backups').glob('paperclip-before-update-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / '.env').read_bytes(), self.original)
        self.assertTrue((backups[0] / 'BACKUP_COMPLETE.txt').exists())
        ups = [call for call in self.calls() if 'up' in call]
        self.assertEqual(len(ups), 1)
        self.assertEqual(ups[0][-5:], ['up', '-d', '--no-deps', '--force-recreate', 'paperclip'])
        self.assertFalse(any('down' in call for call in self.calls()))

    def test_failed_recreate_reports_backup_without_automatic_downgrade(self):
        result = self.run_script(IMAGE, REVISION, fail='up')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('No automatic rollback', result.stderr)
        self.assertTrue(list((self.root / 'backups').glob('*/BACKUP_COMPLETE.txt')))
        self.assertEqual((self.deploy / '.env').read_bytes(),
                         self.original.replace(b'old@sha256:123', IMAGE.encode()))
        self.assertEqual(len([call for call in self.calls() if 'up' in call]), 1)

    def test_ambiguous_env_key_is_not_rewritten(self):
        self.original += b'PAPERCLIP_IMAGE=duplicate\n'
        (self.deploy / '.env').write_bytes(self.original)
        result = self.run_script(IMAGE, REVISION)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('exactly one PAPERCLIP_IMAGE', result.stderr)
        self.assert_no_replace()

    def test_failed_public_verification_keeps_backup_and_does_not_rollback_database(self):
        result = self.run_script(IMAGE, REVISION, fail='health')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('No automatic rollback', result.stderr)
        self.assertTrue(list((self.root / 'backups').glob('*/BACKUP_COMPLETE.txt')))
        self.assertFalse(any(call[0] == 'start' and call[-1] != 'original-container' for call in self.calls()))
        self.assertFalse(any('down' in call for call in self.calls()))


if __name__ == '__main__':
    unittest.main()
