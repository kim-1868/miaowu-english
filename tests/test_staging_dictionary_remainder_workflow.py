"""Safety invariants of the explicitly owner-approved staging remainder workflow."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
WORKFLOW=ROOT/".github/workflows/global-dictionary-staging-remainder-cohort-manual.yml"


class RemainderWorkflowSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.yml=WORKFLOW.read_text(encoding="utf-8")

    def test_only_manual_dispatch_and_exact_owner_feature_branch(self):
        s=self.yml
        header=s.split("permissions:",1)[0]
        self.assertIn("workflow_dispatch:",header)
        self.assertNotIn("  push:",header)
        self.assertNotIn("  schedule:",header)
        self.assertIn("github.actor == 'kim-1868'",s)
        self.assertIn("github.repository == 'kim-1868/miaowu-english'",s)
        self.assertIn("github.ref == 'refs/heads/feature/v11-smart-vocab-preflight-20261109'",s)
        self.assertIn("staging-d1-schema-approval",s)
        self.assertIn("STAGING_UNREVIEWED_COHORT_ADD_ONLY",s)

    def test_exact_test_database_and_pinned_artifact_and_source(self):
        s=self.yml
        self.assertIn("88a817cb-23bb-4ae4-bcb8-92286c4165d4",s)
        self.assertIn("miaowu-english-test",s)
        self.assertIn("/actions/artifacts/13778823874/zip",s)
        self.assertIn("verify-staging-dictionary-remainder-cohort.py",s)
        self.assertIn("STAGING_PARTIAL_OR_WRONG_COHORT_STATE_",s)
        self.assertIn("STAGING_COHORT_POSTCONDITION_FAILED_",s)
        self.assertIn("source_sha256='d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc'",s)

    def test_backup_upload_precedes_first_remote_write(self):
        s=self.yml
        pre=s.index("- name: Verify staging D1 has exactly the previous cohort's rows")
        backup=s.index("- name: Export complete D1 staging and verify encrypted recovery BEFORE mutation")
        upload=s.index("- name: Persist encrypted backup artifact before any remote writes")
        write=s.index("- name: Apply ONLY validated single cohort to test D1")
        verify=s.index("- name: Verify precise post-cohort count")
        self.assertTrue(0<pre<backup<upload<write<verify)
        self.assertIn("STAGING_D1_BACKUP_PASSPHRASE",s)
        self.assertIn("PRAGMA integrity_check",s)
        self.assertIn("PRAGMA foreign_key_check",s)
        self.assertIn("actions/upload-artifact@v4",s)
        self.assertIn("retention-days: 30",s)
        self.assertIn("concurrency:",s)

    def test_no_production_deploy_or_implicit_review_approval(self):
        s=self.yml
        for forbidden in ("wrangler deploy","d1 time-travel restore",
                          "UPDATE user_words","UPDATE review_events",
                          "UPDATE entitlements","DELETE FROM books","--local"):
            self.assertNotIn(forbidden,s)
        self.assertIn("STAGING_COHORT_NO_TEACHING_APPROVAL_NO_HISTORICAL_STUDY_WRITES",s)
        self.assertIn("unsafe_entries:0",s)
        self.assertIn("unsafe_forms:0",s)


if __name__=="__main__":
    unittest.main()
