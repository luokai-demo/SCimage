from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"

if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from workspace_state_store import WorkspaceStateStore


class WorkspaceStateStoreTests(unittest.TestCase):
    def test_missing_file_returns_default_state(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = WorkspaceStateStore(Path(temp_dir) / "workspace-state.json")
            state = store.get_state()

            self.assertEqual(state["active_workflow"], "generate")
            self.assertEqual(state["forms"]["generate"]["quality"], "auto")
            self.assertEqual(state["forms"]["generate"]["size"], "auto")
            self.assertEqual(state["prompt_bank"]["generate"], [])
            self.assertEqual(state["ui"]["gallery"]["filter"], "all")

    def test_replace_state_normalizes_and_persists(self) -> None:
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "workspace-state.json"
            store = WorkspaceStateStore(path)

            state = store.replace_state(
                {
                    "active_workflow": "IMAGE-TO-IMAGE",
                    "forms": {
                        "generate": {
                            "prompt": "apple",
                            "quality": "AUTO",
                            "size": "AUTO",
                            "count": "2",
                        },
                        "image-to-image": {
                            "prompt": " poster ",
                            "quality": "HD",
                            "size": "1440X2560",
                            "count": "abc",
                        },
                    },
                    "prompt_bank": {
                        "generate": [
                            {
                                "id": "first",
                                "prompt": "apple",
                                "quality": "AUTO",
                                "size": "AUTO",
                                "count": 2,
                                "outputProfileId": "pixel_v1",
                            },
                            {
                                "id": "blank",
                                "prompt": "   ",
                            },
                        ]
                    },
                    "ui": {
                        "gallery": {
                            "filter": "PROMPTS",
                        }
                    }
                }
            )

            self.assertEqual(state["active_workflow"], "image-to-image")
            self.assertEqual(state["forms"]["generate"]["quality"], "auto")
            self.assertEqual(state["forms"]["generate"]["size"], "auto")
            self.assertEqual(state["forms"]["image-to-image"]["quality"], "hd")
            self.assertEqual(state["forms"]["image-to-image"]["size"], "1440x2560")
            self.assertEqual(state["forms"]["image-to-image"]["count"], "1")
            self.assertEqual(len(state["prompt_bank"]["generate"]), 1)
            self.assertEqual(state["prompt_bank"]["generate"][0]["id"], "first")
            self.assertEqual(state["ui"]["gallery"]["filter"], "prompts")
            self.assertTrue(path.exists())

            reloaded = WorkspaceStateStore(path).get_state()
            self.assertEqual(reloaded, state)

    def test_prompt_bank_does_not_truncate_entries(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = WorkspaceStateStore(Path(temp_dir) / "workspace-state.json")
            prompts = [
                {
                    "id": f"prompt-{index}",
                    "prompt": f"prompt {index}",
                    "quality": "auto",
                    "size": "auto",
                    "count": 1,
                }
                for index in range(150)
            ]

            state = store.replace_state({"prompt_bank": {"generate": prompts}})

            self.assertEqual(len(state["prompt_bank"]["generate"]), 150)
            self.assertEqual(state["prompt_bank"]["generate"][0]["id"], "prompt-0")
            self.assertEqual(state["prompt_bank"]["generate"][-1]["id"], "prompt-149")


if __name__ == "__main__":
    unittest.main()
