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

from genealogy import build_genealogy_graph  # noqa: E402
import job_store  # noqa: E402
from request_parsing import parse_create_job_request  # noqa: E402


class GenealogyGraphTests(unittest.TestCase):
    def build_store(self) -> job_store.JobStore:
        temp_dir = TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        with patch.object(job_store, "JOB_RECORDS_PATH", Path(temp_dir.name) / "missing-job-records.json"):
            store = job_store.JobStore(Path(temp_dir.name) / "jobs.db")
            self.addCleanup(store.close)
            return store

    def test_graph_connects_gallery_origin_to_image_to_image_outputs(self) -> None:
        store = self.build_store()
        root = store.create(
            prompt="根图",
            count=1,
            quality="auto",
            model="gpt-image-test",
            workflow="generate",
            job_id="root-job",
        )
        store.append_image(
            root.id,
            {"slot": 1, "name": "root.png", "url": "/generated/root-job/root.png"},
        )
        child = store.create(
            prompt="第一代",
            count=1,
            quality="auto",
            workflow="image-to-image",
            job_id="child-job",
            source_images=[
                {
                    "slot": 1,
                    "name": "source-1.png",
                    "path": "/tmp/source-1.png",
                    "url": "/generated/child-job/source-images/source-1.png",
                    "origin": {
                        "job_id": "root-job",
                        "slot": 1,
                        "url": "/generated/root-job/root.png",
                        "filename": "root.png",
                        "prompt": "根图",
                    },
                }
            ],
        )
        store.append_image(
            child.id,
            {"slot": 1, "name": "child.png", "url": "/generated/child-job/child.png"},
        )

        graph = build_genealogy_graph(store.list_all())

        self.assertEqual(
            graph["edges"],
            [{"from": "root-job:1", "to": "child-job:1", "job_id": "child-job"}],
        )
        root_node = next(item for item in graph["nodes"] if item["id"] == "root-job:1")
        self.assertEqual(root_node["model"], "gpt-image-test")
        family = next(item for item in graph["families"] if item["root_id"] == "root-job:1")
        self.assertEqual(family["generation_count"], 2)
        self.assertEqual(family["image_count"], 2)

    def test_graph_uses_external_source_as_independent_root(self) -> None:
        store = self.build_store()
        child = store.create(
            prompt="外部参考生成",
            count=1,
            quality="auto",
            workflow="image-to-image",
            job_id="external-child",
            source_images=[
                {
                    "slot": 1,
                    "name": "source-1.png",
                    "path": "/tmp/source-1.png",
                    "url": "/generated/external-child/source-images/source-1.png",
                }
            ],
        )
        store.append_image(
            child.id,
            {"slot": 1, "name": "child.png", "url": "/generated/external-child/child.png"},
        )

        graph = build_genealogy_graph(store.list_all())

        self.assertIn(
            {"from": "source:external-child:1", "to": "external-child:1", "job_id": "external-child"},
            graph["edges"],
        )
        family = next(item for item in graph["families"] if item["root_id"] == "source:external-child:1")
        self.assertEqual(family["root_type"], "source")

    def test_multipart_request_preserves_source_image_origin(self) -> None:
        boundary = "----scimage-test-boundary"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="workflow"\r\n\r\n'
            "image-to-image\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="prompt"\r\n\r\n'
            "继续生成\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="source_image"; filename="root.png"\r\n'
            "Content-Type: image/png\r\n\r\n"
            "image-bytes\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="source_image_origin"\r\n\r\n'
            '{"job_id":"root-job","slot":1,"url":"/generated/root-job/root.png","filename":"root.png","prompt":"根图"}\r\n'
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        request = parse_create_job_request(
            content_type=f"multipart/form-data; boundary={boundary}",
            raw_body=body,
        )

        self.assertEqual(request.workflow, "image-to-image")
        self.assertEqual(len(request.source_images), 1)
        self.assertEqual(
            request.source_images[0].origin,
            {
                "job_id": "root-job",
                "slot": 1,
                "url": "/generated/root-job/root.png",
                "filename": "root.png",
                "prompt": "根图",
            },
        )


if __name__ == "__main__":
    unittest.main()
