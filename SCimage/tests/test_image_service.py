from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"

candidate_text = str(WEBAPP_DIR)
if candidate_text not in sys.path:
    sys.path.insert(0, candidate_text)

import image_service  # noqa: E402
from image_generation_runtime import ImageGenerationResponse  # noqa: E402
from provider_profiles import ProviderProfile  # noqa: E402


class ImageServiceCountStrategyTests(unittest.TestCase):
    def test_supported_count_parameter_passes_requested_count_once(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            captured_counts: list[int] = []

            def fake_execute(request, **_kwargs):
                captured_counts.append(request.count)
                return ImageGenerationResponse(saved_paths=request.output_paths)

            provider_profile = ProviderProfile(
                id="profile-1",
                name="gwen",
                base_url="https://example.com/v1",
                api_key="secret",
                model="gpt-image-2",
                supports_count_parameter=True,
            )

            with patch.object(image_service, "recreate_job_output_dir", return_value=output_dir):
                with patch.object(
                    image_service,
                    "_build_image_payload",
                    side_effect=lambda job_id, file_path, slot: {"slot": slot, "path": str(file_path), "job_id": job_id},
                ):
                    with patch.object(image_service, "execute_image_generation", side_effect=fake_execute):
                        result = image_service.generate_images(
                            job_id="job-1",
                            workflow="generate",
                            prompt="apple",
                            count=3,
                            quality="auto",
                            size="auto",
                            source_images=[],
                            provider_profile=provider_profile,
                        )

        self.assertEqual(captured_counts, [3])
        self.assertEqual(len(result.images), 3)
        self.assertEqual(result.errors, [])

    def test_unsupported_count_parameter_fans_out_to_parallel_single_requests(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            captured_counts: list[int] = []

            def fake_execute(request, **_kwargs):
                captured_counts.append(request.count)
                return ImageGenerationResponse(saved_paths=request.output_paths)

            provider_profile = ProviderProfile(
                id="profile-2",
                name="newcoding",
                base_url="https://example.com/v1",
                api_key="secret",
                model="gpt-image-2",
                supports_count_parameter=False,
            )

            with patch.object(image_service, "recreate_job_output_dir", return_value=output_dir):
                with patch.object(
                    image_service,
                    "_build_image_payload",
                    side_effect=lambda job_id, file_path, slot: {"slot": slot, "path": str(file_path), "job_id": job_id},
                ):
                    with patch.object(image_service, "execute_image_generation", side_effect=fake_execute):
                        result = image_service.generate_images(
                            job_id="job-2",
                            workflow="generate",
                            prompt="apple",
                            count=3,
                            quality="auto",
                            size="auto",
                            source_images=[],
                            provider_profile=provider_profile,
                        )

        self.assertCountEqual(captured_counts, [1, 1, 1])
        self.assertEqual([image["slot"] for image in result.images], [1, 2, 3])
        self.assertEqual(result.errors, [])

    def test_unsupported_count_parameter_keeps_partial_successes(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)

            def fake_execute(request, **_kwargs):
                target_path = request.output_paths[0]
                if target_path.name == "image-2.png":
                    raise RuntimeError("upstream timeout")
                return ImageGenerationResponse(saved_paths=request.output_paths)

            provider_profile = ProviderProfile(
                id="profile-3",
                name="fallback-node",
                base_url="https://example.com/v1",
                api_key="secret",
                model="gpt-image-2",
                supports_count_parameter=False,
            )

            with patch.object(image_service, "recreate_job_output_dir", return_value=output_dir):
                with patch.object(
                    image_service,
                    "_build_image_payload",
                    side_effect=lambda job_id, file_path, slot: {"slot": slot, "path": str(file_path), "job_id": job_id},
                ):
                    with patch.object(image_service, "execute_image_generation", side_effect=fake_execute):
                        result = image_service.generate_images(
                            job_id="job-3",
                            workflow="generate",
                            prompt="apple",
                            count=3,
                            quality="auto",
                            size="auto",
                            source_images=[],
                            provider_profile=provider_profile,
                        )

        self.assertEqual([image["slot"] for image in result.images], [1, 3])
        self.assertEqual(len(result.errors), 1)
        self.assertIn("第 2 张图片生成失败", result.errors[0])


if __name__ == "__main__":
    unittest.main()
