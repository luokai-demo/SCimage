from __future__ import annotations

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"

candidate_text = str(WEBAPP_DIR)
if candidate_text not in sys.path:
    sys.path.insert(0, candidate_text)

import job_store  # noqa: E402
import job_persistence  # noqa: E402
import job_record_images  # noqa: E402
import job_record_recovery  # noqa: E402
import api_pagination  # noqa: E402


class JobPaginationTests(unittest.TestCase):
    def build_store(self) -> job_store.JobStore:
        temp_dir = TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        with patch.object(job_store, "JOB_RECORDS_PATH", Path(temp_dir.name) / "missing-job-records.json"):
            store = job_store.JobStore(Path(temp_dir.name) / "job-records.db")
            self.addCleanup(store.close)
            for index in range(5):
                record = store.create(
                    prompt=f"prompt {index}",
                    count=1,
                    quality="auto",
                    job_id=f"job-{index}",
                )
                record.created_at = f"2026-04-29T12:00:0{index}"
                store.update_status(record.id, record.status, record.message)
            return store

    def test_list_page_returns_total_and_has_more(self) -> None:
        store = self.build_store()

        page = store.list_page(offset=0, limit=2)

        self.assertEqual(page["total"], 5)
        self.assertEqual(page["offset"], 0)
        self.assertEqual(page["limit"], 2)
        self.assertTrue(page["has_more"])
        self.assertEqual(len(page["jobs"]), 2)

    def test_list_page_respects_offset(self) -> None:
        store = self.build_store()

        page = store.list_page(offset=4, limit=2)

        self.assertEqual(page["total"], 5)
        self.assertFalse(page["has_more"])
        self.assertEqual(len(page["jobs"]), 1)

    def test_list_page_supports_cursor_pagination(self) -> None:
        store = self.build_store()
        first_page = store.list_page(offset=0, limit=2)

        second_page = store.list_page(limit=2, cursor=first_page["next_cursor"])

        self.assertEqual(len(first_page["jobs"]), 2)
        self.assertEqual(len(second_page["jobs"]), 2)
        self.assertTrue(first_page["next_cursor"])
        self.assertNotEqual(
            {job["id"] for job in first_page["jobs"]},
            {job["id"] for job in second_page["jobs"]},
        )

    def test_jobs_payload_clamps_large_limit(self) -> None:
        store = self.build_store()

        payload = api_pagination.build_jobs_page_payload(store, {"offset": ["0"], "limit": ["9999"]})

        self.assertEqual(payload["limit"], api_pagination.MAX_JOBS_PAGE_SIZE)
        self.assertEqual(payload["total"], 5)

    def test_store_migrates_legacy_json_into_sqlite(self) -> None:
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            json_path = temp_path / "job-records.json"
            database_path = temp_path / "job-records.db"
            json_path.write_text(
                json.dumps(
                    {
                        "jobs": {
                            "legacy-job": {
                                "id": "legacy-job",
                                "prompt": "apple",
                                "count": 1,
                                "quality": "auto",
                                "size": "auto",
                                "workflow": "generate",
                                "status": "completed",
                                "message": "done",
                                "created_at": "2026-04-29T12:00:00",
                                "run_started_at": "2026-04-29T12:00:00",
                                "updated_at": "2026-04-29T12:00:01",
                                "images": [],
                                "source_images": [],
                                "warnings": [],
                                "error": None,
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            with patch.object(job_store, "JOB_RECORDS_PATH", json_path):
                with patch.object(job_record_images, "GENERATED_DIR", temp_path / "generated"):
                    with patch.object(job_record_recovery, "GENERATED_DIR", temp_path / "generated"):
                        with job_store.JobStore(database_path) as store:
                            page = store.list_page(offset=0, limit=10)

        self.assertEqual(page["total"], 1)
        self.assertEqual(page["jobs"][0]["id"], "legacy-job")
        self.assertFalse(json_path.exists())

    def test_store_merges_legacy_json_when_sqlite_already_has_jobs(self) -> None:
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            json_path = temp_path / "job-records.json"
            database_path = temp_path / "job-records.db"

            with patch.object(job_store, "JOB_RECORDS_PATH", temp_path / "missing-job-records.json"):
                with job_store.JobStore(database_path) as existing_store:
                    existing_store.create(prompt="existing", count=1, quality="auto", job_id="existing-job")

            json_path.write_text(
                json.dumps(
                    {
                        "jobs": {
                            "legacy-job": {
                                "id": "legacy-job",
                                "prompt": "apple",
                                "count": 1,
                                "quality": "auto",
                                "size": "auto",
                                "workflow": "generate",
                                "status": "completed",
                                "message": "done",
                                "created_at": "2026-04-29T12:00:00",
                                "run_started_at": "2026-04-29T12:00:00",
                                "updated_at": "2026-04-29T12:00:01",
                                "images": [],
                                "source_images": [],
                                "warnings": [],
                                "error": None,
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            with patch.object(job_store, "JOB_RECORDS_PATH", json_path):
                with patch.object(job_record_images, "GENERATED_DIR", temp_path / "generated"):
                    with patch.object(job_record_recovery, "GENERATED_DIR", temp_path / "generated"):
                        with job_store.JobStore(database_path) as store:
                            page = store.list_page(offset=0, limit=10)
        job_ids = {job["id"] for job in page["jobs"]}

        self.assertEqual(page["total"], 2)
        self.assertEqual(job_ids, {"existing-job", "legacy-job"})
        self.assertFalse(json_path.exists())

    def test_store_maintains_image_index(self) -> None:
        store = self.build_store()
        store.append_image(
            "job-0",
            {
                "slot": 1,
                "name": "image-1.png",
                "url": "/generated/job-0/image-1.png",
                "preview_url": "/generated/job-0/previews/preview-1.webp",
                "width": 1024,
                "height": 768,
                "placeholder_color": "#ffffff",
                "placeholder_accent_color": "#eeeeee",
            },
        )

        rows = store._connection.execute(
            "SELECT job_id, slot, name, width, height FROM job_images WHERE job_id = ?",
            ("job-0",),
        ).fetchall()

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["slot"], 1)
        self.assertEqual(rows[0]["name"], "image-1.png")
        self.assertEqual(rows[0]["width"], 1024)
        self.assertEqual(rows[0]["height"], 768)

    def test_store_lists_gallery_images_from_index(self) -> None:
        store = self.build_store()
        store.append_image(
            "job-0",
            {
                "slot": 1,
                "name": "image-1.png",
                "url": "/generated/job-0/image-1.png",
            },
        )
        store.append_image(
            "job-0",
            {
                "slot": 2,
                "name": "image-2.png",
                "url": "/generated/job-0/image-2.png",
            },
        )

        page = store.list_gallery_images(limit=10)

        self.assertEqual(page["total"], 2)
        self.assertEqual(page["items"][0]["job"]["id"], "job-0")
        self.assertEqual(page["items"][0]["job"]["image_count"], 2)
        self.assertEqual(len(page["items"][0]["job"]["images"]), 1)
        self.assertIn(page["items"][0]["image"]["name"], {"image-1.png", "image-2.png"})

    def test_store_lists_gallery_groups_from_index(self) -> None:
        store = self.build_store()
        store.append_image("job-0", {"slot": 1, "name": "image-1.png", "url": "/generated/job-0/image-1.png"})
        store.append_image("job-1", {"slot": 1, "name": "image-1.png", "url": "/generated/job-1/image-1.png"})

        prompt_groups = store.list_gallery_groups(group_by="prompt", limit=10)
        task_groups = store.list_gallery_groups(group_by="task", limit=10)

        self.assertEqual(prompt_groups["group_by"], "prompt")
        self.assertEqual(task_groups["group_by"], "task")
        self.assertEqual(sum(group["image_count"] for group in prompt_groups["groups"]), 2)
        self.assertEqual(len(task_groups["groups"]), 2)

    def test_store_removes_deleted_image_from_index(self) -> None:
        store = self.build_store()
        store.append_image(
            "job-0",
            {
                "slot": 1,
                "name": "image-1.png",
                "url": "/generated/job-0/image-1.png",
            },
        )

        store.remove_image("job-0", 1)
        rows = store._connection.execute("SELECT * FROM job_images WHERE job_id = ?", ("job-0",)).fetchall()

        self.assertEqual(rows, [])

    def test_store_keeps_legacy_json_when_json_is_invalid(self) -> None:
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            json_path = temp_path / "job-records.json"
            json_path.write_text("{invalid", encoding="utf-8")

            with patch.object(job_store, "JOB_RECORDS_PATH", json_path):
                with job_store.JobStore(temp_path / "job-records.db"):
                    pass

            self.assertTrue(json_path.exists())

    def test_legacy_json_migration_does_not_scan_generated_dir(self) -> None:
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            json_path = temp_path / "job-records.json"
            generated_dir = temp_path / "generated"
            (generated_dir / "orphan-job").mkdir(parents=True)
            (generated_dir / "orphan-job" / "image-1.png").write_bytes(b"image")
            json_path.write_text(json.dumps({"jobs": {}}), encoding="utf-8")

            with patch.object(job_store, "JOB_RECORDS_PATH", json_path):
                with patch.object(job_record_recovery, "GENERATED_DIR", generated_dir):
                    with patch.object(job_record_recovery, "build_images_from_generated_dir") as mocked_builder:
                        with job_store.JobStore(temp_path / "job-records.db") as store:
                            total = store.list_page(offset=0, limit=10)["total"]

        self.assertEqual(total, 0)
        mocked_builder.assert_not_called()
        self.assertFalse(json_path.exists())


class JobPersistenceStartupPerformanceTests(unittest.TestCase):
    def test_normalize_job_record_reuses_cached_preview_metadata(self) -> None:
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as temp_dir:
            generated_dir = Path(temp_dir)
            job_dir = generated_dir / "job-1"
            preview_dir = job_dir / "previews"
            preview_dir.mkdir(parents=True)
            image_path = job_dir / "image-1.png"
            preview_path = preview_dir / "preview-1.webp"
            image_path.write_bytes(b"image")
            preview_path.write_bytes(b"preview")

            raw_job = {
                "prompt": "apple",
                "count": 1,
                "quality": "auto",
                "size": "auto",
                "created_at": "2026-04-29T12:00:00",
                "images": [
                    {
                        "slot": 1,
                        "name": "image-1.png",
                        "path": str(image_path),
                        "width": 1024,
                        "height": 1024,
                        "placeholder": {"color": "#111111", "accent_color": "#222222"},
                        "preview": {
                            "name": "preview-1.webp",
                            "width": 96,
                            "height": 96,
                        },
                    }
                ],
            }

            with patch.object(job_record_images, "GENERATED_DIR", generated_dir):
                with patch.object(job_record_images, "build_generated_image_record") as mocked_builder:
                    normalized = job_persistence.normalize_job_record("job-1", raw_job)

        self.assertIsNotNone(normalized)
        self.assertEqual(normalized["images"][0]["width"], 1024)
        mocked_builder.assert_not_called()

    def test_recover_jobs_skips_existing_indexed_directories(self) -> None:
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as temp_dir:
            generated_dir = Path(temp_dir)
            (generated_dir / "job-1").mkdir()

            with patch.object(job_record_recovery, "GENERATED_DIR", generated_dir):
                with patch.object(job_record_recovery, "build_images_from_generated_dir") as mocked_builder:
                    recovered = job_persistence.recover_jobs_from_generated_dir({"job-1": {"id": "job-1"}})

        self.assertEqual(recovered, {})
        mocked_builder.assert_not_called()


if __name__ == "__main__":
    unittest.main()
