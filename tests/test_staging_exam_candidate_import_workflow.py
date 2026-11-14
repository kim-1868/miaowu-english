"""Fail-closed static checks for the manual STAGING import workflow."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WORKFLOW=ROOT / ".github/workflows/global-dictionary-staging-exam-candidate-import-manual.yml"


class ProtectedStagingImportWorkflowTests(unittest.TestCase):
    def test_manual_only_and_environment_protected(self):
        y=WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:",y)
        header=y.split("permissions:",1)[0]
        self.assertNotIn("  push:",header)
        self.assertIn("github.repository == 'kim-1868/miaowu-english'",y)
        self.assertIn("github.actor == 'kim-1868'",y)
        self.assertIn("github.ref == 'refs/heads/feature/v11-smart-vocab-preflight-20261109'",y)
        self.assertIn("name: staging-d1-schema-approval",y)
        self.assertIn("STAGING_EXAM_CANDIDATES_ADD_ONLY",y)

    def test_target_and_source_artifact_are_hard_pinned(self):
        y=WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("88a817cb-23bb-4ae4-bcb8-92286c4165d4",y)
        self.assertIn("miaowu-english-test",y)
        self.assertIn("actions/artifacts/13778216547/zip",y)
        self.assertIn("CANDIDATE_ONLY_NOT_TEACHING_APPROVED",y)
        self.assertIn("11422",y)
        self.assertIn("16442",y)
        self.assertIn("400183",y)
        self.assertIn("56898",y)
        self.assertIn("STAGING_BASELINE_CHANGED_",y)

    def test_prewrite_encrypted_artifact_and_replay_are_mandatory(self):
        y=WORKFLOW.read_text(encoding="utf-8")
        start=y.index("- name: Export and encrypt complete pre-import test D1 backup")
        persist=y.index("- name: Persist ONLY encrypted preimport backup before any remote writes")
        mutation=y.index("- name: Apply ONLY pinned disabled exam candidate indexes to test D1")
        verification=y.index("- name: Verify exact imported candidate counts")
        self.assertTrue(0<start<persist<mutation<verification)
        self.assertIn("STAGING_D1_BACKUP_PASSPHRASE",y)
        self.assertIn("PRAGMA foreign_key_check",y)
        self.assertIn("gpg --batch --yes",y)
        self.assertIn("actions/upload-artifact@v4",y)
        self.assertIn("retention-days: 30",y)
        self.assertNotIn("d1 time-travel restore",y)
        self.assertNotIn("wrangler deploy",y)
        self.assertNotIn("deploy/production.wrangler",y)

    def test_import_has_no_review_or_entitlement_writes(self):
        y=WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("NO_TEACHING_CARDS_APPROVED_NO_PRODUCTION_ACCESS",y)
        self.assertIn("STAGING_ORIGINAL_BOOKS_WORDS_STUDY_ROWS_UNCHANGED",y)
        self.assertIn("source_enabled",y)
        self.assertNotIn("UPDATE user_words",y)
        self.assertNotIn("DELETE FROM",y)
        self.assertNotIn("UPDATE entitlements",y)


if __name__=="__main__":
    unittest.main()
