"""POSIX script failure-path tests; run in Linux or the Python Docker image."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipIf(os.name == "nt", "Run inside a Linux container to exercise POSIX shell")
class BackupScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.backups = self.root / "backups"
        self.backups.mkdir()
        self.env = dict(os.environ, PATH=f"{self.bin}:{os.environ['PATH']}",
                        BACKUP_DIR=str(self.backups), BACKUP_ONCE="true",
                        BACKUP_STAGING=str(self.root), REMOTE="fake:archives",
                        CALL_LOG=str(self.root / "calls"))

    def helper(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/sh\nset -eu\n" + body + "\n")
        path.chmod(0o755)

    def run_script(self, name):
        return subprocess.run(["sh", str(ROOT / "scripts" / name)], env=self.env,
                              capture_output=True, text=True, timeout=10)

    def test_failed_dump_has_no_completed_or_partial_archive(self):
        self.helper("pg_dump", "exit 13")
        result = self.run_script("db-backup.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_archive_validation_failure_removes_partial(self):
        self.helper("pg_dump", 'while [ "$1" != "-f" ]; do shift; done; shift; echo invalid > "$1"')
        self.helper("pg_restore", "exit 4")
        self.assertNotEqual(self.run_script("db-backup.sh").returncode, 0)
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_valid_archive_published_atomically(self):
        self.helper("pg_dump", 'while [ "$1" != "-f" ]; do shift; done; shift; echo archive > "$1"')
        self.helper("pg_restore", "exit 0")
        result = self.run_script("db-backup.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(list(self.backups.glob("*.dump"))), 1)
        self.assertEqual(list(self.backups.glob("*.partial")), [])

    def test_invalid_retention_fails_before_dump(self):
        self.env["BACKUP_RETENTION_DAYS"] = "-1"
        self.assertNotEqual(self.run_script("db-backup.sh").returncode, 0)

    def test_missing_volume_never_copies_remote(self):
        self.helper("docker", "exit 1")
        self.helper("rclone", 'echo "$*" > "$CALL_LOG"')
        self.assertNotEqual(self.run_script("offsite-sync.sh").returncode, 0)
        self.assertFalse((self.root / "calls").exists())

    def test_failed_export_never_copies_and_cleans_only_own_staging(self):
        self.helper("docker", '[ "$1" = volume ] && exit 0; exit 2')
        self.helper("rclone", 'echo "$*" > "$CALL_LOG"')
        sentinel = self.root / "keep-me"
        sentinel.write_text("existing user file")
        self.assertNotEqual(self.run_script("offsite-sync.sh").returncode, 0)
        self.assertFalse((self.root / "calls").exists())
        self.assertTrue(sentinel.exists())
        self.assertEqual(list(self.root.glob("portal-backup.*")), [])

    def test_offsite_uses_copy_never_sync(self):
        self.helper("docker", "exit 0")
        self.helper("rclone", 'echo "$*" > "$CALL_LOG"')
        result = self.run_script("offsite-sync.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.root / "calls").read_text().startswith("copy "))
        self.assertEqual(list(self.root.glob("portal-backup.*")), [])


if __name__ == "__main__":
    unittest.main()
