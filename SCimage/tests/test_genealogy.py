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

        graph = build_genealogy_graph(store.list_all(), store.list_genealogy_positions())

        self.assertEqual(
            graph["edges"],
            [{"from": "root-job:1", "to": "child-job:1", "job_id": "child-job"}],
        )
        root_node = next(item for item in graph["nodes"] if item["id"] == "root-job:1")
        self.assertEqual(root_node["model"], "gpt-image-test")
        self.assertNotIn("position", root_node)
        family = next(item for item in graph["families"] if item["root_id"] == "root-job:1")
        self.assertEqual(family["generation_count"], 2)
        self.assertEqual(family["image_count"], 2)

    def test_graph_returns_persisted_node_positions_by_node(self) -> None:
        store = self.build_store()
        root = store.create(
            prompt="根图",
            count=1,
            quality="auto",
            workflow="generate",
            job_id="root-job",
        )
        store.append_image(
            root.id,
            {"slot": 1, "name": "root.png", "url": "/generated/root-job/root.png"},
        )
        child = store.create(
            prompt="可拖拽节点",
            count=1,
            quality="auto",
            workflow="image-to-image",
            job_id="drag-job",
            source_images=[
                {
                    "slot": 1,
                    "name": "source-1.png",
                    "url": "/generated/drag-job/source-images/source-1.png",
                    "origin": {
                        "job_id": "root-job",
                        "slot": 1,
                        "url": "/generated/root-job/root.png",
                    },
                }
            ],
        )
        store.append_image(
            child.id,
            {"slot": 1, "name": "drag.png", "url": "/generated/drag-job/drag.png"},
        )

        position = store.update_genealogy_node_position("drag-job:1", {"x": 345.4, "y": 267.6})
        graph = build_genealogy_graph(store.list_all(), store.list_genealogy_positions())

        self.assertEqual(position, {"x": 345, "y": 268})
        node = next(item for item in graph["nodes"] if item["id"] == "drag-job:1")
        self.assertNotIn("position", node)
        self.assertEqual(graph["positions"]["drag-job:1"], {"x": 345, "y": 268})

    def test_rejects_invalid_node_position(self) -> None:
        store = self.build_store()
        job = store.create(
            prompt="非法坐标",
            count=1,
            quality="auto",
            workflow="image-to-image",
            job_id="bad-position-job",
        )
        store.append_image(
            job.id,
            {"slot": 1, "name": "bad.png", "url": "/generated/bad-position-job/bad.png"},
        )

        with self.assertRaises(ValueError):
            store.update_genealogy_node_position("bad-position-job:1", {"x": -1, "y": 20})

    def test_rejects_missing_genealogy_node_position(self) -> None:
        store = self.build_store()

        position = store.update_genealogy_node_position("missing-node:1", {"x": 12, "y": 20})

        self.assertEqual(position, {})

    def test_persists_position_for_existing_independent_node(self) -> None:
        store = self.build_store()
        job = store.create(
            prompt="孤立节点",
            count=1,
            quality="auto",
            workflow="image-to-image",
            job_id="orphan-job",
        )
        store.append_image(
            job.id,
            {"slot": 1, "name": "orphan.png", "url": "/generated/orphan-job/orphan.png"},
        )

        position = store.update_genealogy_node_position("orphan-job:1", {"x": 12, "y": 20})

        self.assertEqual(position, {"x": 12, "y": 20})

    def test_migrates_root_scoped_positions_to_comfyui_node_positions(self) -> None:
        store = self.build_store()
        store._connection.execute("DROP TABLE genealogy_node_positions")
        store._connection.execute(
            """
            CREATE TABLE genealogy_node_positions (
                root_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                x INTEGER NOT NULL,
                y INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (root_id, node_id)
            )
            """
        )
        store._connection.execute(
            """
            INSERT INTO genealogy_node_positions (root_id, node_id, x, y, updated_at)
            VALUES
                ('root-a:1', 'drag-job:1', 12, 20, '2026-01-01T00:00:00'),
                ('root-b:1', 'drag-job:1', 34, 56, '2026-01-02T00:00:00')
            """
        )
        store._connection.commit()
        store._initialize_schema_unlocked()

        self.assertEqual(store.list_genealogy_positions(), {"drag-job:1": {"x": 34, "y": 56}})

    def test_position_save_uses_job_payload_when_image_index_is_missing(self) -> None:
        store = self.build_store()
        root = store.create(
            prompt="根图",
            count=1,
            quality="auto",
            workflow="generate",
            job_id="payload-root",
        )
        store.append_image(
            root.id,
            {"slot": 1, "name": "root.png", "url": "/generated/payload-root/root.png"},
        )
        child = store.create(
            prompt="子图",
            count=1,
            quality="auto",
            workflow="image-to-image",
            job_id="payload-child",
            source_images=[
                {
                    "slot": 1,
                    "name": "source-1.png",
                    "url": "/generated/payload-child/source-images/source-1.png",
                    "origin": {
                        "job_id": "payload-root",
                        "slot": 1,
                        "url": "/generated/payload-root/root.png",
                    },
                }
            ],
        )
        store.append_image(
            child.id,
            {"slot": 1, "name": "child.png", "url": "/generated/payload-child/child.png"},
        )
        store._connection.execute("DELETE FROM job_images WHERE job_id = ?", ("payload-child",))
        store._connection.commit()

        position = store.update_genealogy_node_position("payload-child:1", {"x": 88, "y": 144})

        self.assertEqual(position, {"x": 88, "y": 144})
        self.assertEqual(store.list_genealogy_positions()["payload-child:1"], {"x": 88, "y": 144})

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

        graph = build_genealogy_graph(store.list_all(), store.list_genealogy_positions())

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
