from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

import job_store  # noqa: E402


class BatchGalleryActionTests(unittest.TestCase):
    def test_remove_images_deletes_multiple_selected_images(self) -> None:
        with TemporaryDirectory() as temp_dir:
            with patch.object(job_store, "JOB_RECORDS_PATH", Path(temp_dir) / "missing.json"):
                with job_store.JobStore(Path(temp_dir) / "jobs.db") as store:
                    store.create(prompt="apple", count=2, quality="auto", job_id="job-1")
                    store.complete("job-1", [
                        {"slot": 1, "name": "image-1.png", "url": "/generated/job-1/image-1.png"},
                        {"slot": 2, "name": "image-2.png", "url": "/generated/job-1/image-2.png"},
                    ])

                    result = store.remove_images([
                        {"job_id": "job-1", "slot": 1},
                        {"job_id": "job-1", "slot": 2},
                    ])
                    removed_job = store.get("job-1")

        self.assertEqual(len(result["removed"]), 2)
        self.assertEqual(result["deleted_jobs"], ["job-1"])
        self.assertIsNone(removed_job)


if __name__ == "__main__":
    unittest.main()
