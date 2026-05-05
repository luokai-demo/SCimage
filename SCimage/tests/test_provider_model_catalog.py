from __future__ import annotations

import io
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

for candidate in (WEBAPP_DIR, SCRIPTS_DIR):
    candidate_text = str(candidate)
    if candidate_text not in sys.path:
        sys.path.insert(0, candidate_text)

import api_provider_profiles  # noqa: E402
from provider_model_catalog import (  # noqa: E402
    MODEL_CATEGORY_IMAGE,
    MODEL_CATEGORY_OTHER,
    MODEL_VALIDATION_ERROR_MESSAGE,
    ProviderModelOption,
    categorize_provider_model,
    discover_provider_models,
    normalize_openai_compatible_base_url,
    validate_provider_model_selection,
)
from provider_profiles import ProviderProfileStore  # noqa: E402


class ProviderModelCatalogTests(unittest.TestCase):
    def test_normalize_openai_compatible_base_url_appends_v1(self) -> None:
        self.assertEqual(
            normalize_openai_compatible_base_url("https://example.com"),
            "https://example.com/v1",
        )
        self.assertEqual(
            normalize_openai_compatible_base_url("https://example.com/v1"),
            "https://example.com/v1",
        )

    def test_categorize_provider_model_marks_image_models(self) -> None:
        self.assertEqual(categorize_provider_model("gpt-image-2"), MODEL_CATEGORY_IMAGE)
        self.assertEqual(categorize_provider_model("chatgpt-image-latest"), MODEL_CATEGORY_IMAGE)
        self.assertEqual(categorize_provider_model("dall-e-3"), MODEL_CATEGORY_IMAGE)
        self.assertEqual(categorize_provider_model("gpt-5.4"), MODEL_CATEGORY_OTHER)

    @patch("provider_model_catalog.urlopen")
    def test_discover_provider_models_groups_images_first(self, mock_urlopen) -> None:
        mock_urlopen.return_value = FakeResponse(
            b'{"data":[{"id":"gpt-5.4"},{"id":"gpt-image-2"},{"id":"dall-e-3"},{"id":"gpt-5.5"}]}'
        )

        normalized_base_url, models = discover_provider_models(
            base_url="https://example.com",
            api_key="secret-key",
        )

        self.assertEqual(normalized_base_url, "https://example.com/v1")
        self.assertEqual(
            [(model.id, model.category) for model in models],
            [
                ("gpt-image-2", MODEL_CATEGORY_IMAGE),
                ("dall-e-3", MODEL_CATEGORY_IMAGE),
                ("gpt-5.4", MODEL_CATEGORY_OTHER),
                ("gpt-5.5", MODEL_CATEGORY_OTHER),
            ],
        )
        request = mock_urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://example.com/v1/models")
        self.assertEqual(request.get_header("Authorization"), "Bearer secret-key")

    @patch("provider_model_catalog.urlopen", side_effect=FileNotFoundError("missing-runtime-file"))
    def test_discover_provider_models_reports_missing_runtime_file(self, mock_urlopen) -> None:
        with self.assertRaisesRegex(RuntimeError, "运行时缺少文件"):
            discover_provider_models(
                base_url="https://example.com",
                api_key="secret-key",
            )

    @patch(
        "provider_model_catalog.urlopen",
        side_effect=HTTPError(
            "https://example.com/v1/models",
            401,
            "Unauthorized",
            None,
            io.BytesIO(b'{"error":{"message":"bad key"}}'),
        ),
    )
    def test_discover_provider_models_reports_http_error(self, mock_urlopen) -> None:
        with self.assertRaisesRegex(RuntimeError, "HTTP 401"):
            discover_provider_models(
                base_url="https://example.com",
                api_key="secret-key",
            )

    @patch("provider_model_catalog.discover_provider_models")
    def test_validate_provider_model_selection_rejects_unsupported_model(self, mock_discover_provider_models) -> None:
        mock_discover_provider_models.return_value = (
            "https://example.com/v1",
            [
                ProviderModelOption(id="gpt-image-2", category=MODEL_CATEGORY_IMAGE),
                ProviderModelOption(id="gpt-5.4", category=MODEL_CATEGORY_OTHER),
            ],
        )

        with self.assertRaisesRegex(ValueError, MODEL_VALIDATION_ERROR_MESSAGE):
            validate_provider_model_selection(
                base_url="https://example.com",
                api_key="secret-key",
                model="gpt-image-1",
            )


class ProviderModelRequestHelpersTests(unittest.TestCase):
    def test_resolve_provider_api_key_inherits_from_source_profile(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = ProviderProfileStore(Path(temp_dir) / "provider-profiles.json")
            state = store.create_profile(
                name="gwen",
                base_url="https://example.com/v1",
                model="gpt-image-2",
                api_key="secret-key",
            )

            resolved_api_key = api_provider_profiles.resolve_provider_api_key(
                store,
                api_key="",
                source_profile_id=state["active_profile_id"],
            )

        self.assertEqual(resolved_api_key, "secret-key")

    def test_discover_models_from_payload_uses_inherited_api_key(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = ProviderProfileStore(Path(temp_dir) / "provider-profiles.json")
            state = store.create_profile(
                name="gwen",
                base_url="https://example.com/v1",
                model="gpt-image-2",
                api_key="secret-key",
            )

            with patch.object(
                api_provider_profiles,
                "discover_provider_models",
                return_value=(
                    "https://example.com/v1",
                    [ProviderModelOption(id="gpt-image-2", category=MODEL_CATEGORY_IMAGE)],
                ),
            ) as mocked_discover:
                normalized_base_url, models = api_provider_profiles.discover_models_from_payload(
                    store,
                    {
                        "base_url": "https://example.com",
                        "api_key": "",
                        "source_profile_id": state["active_profile_id"],
                    },
                )

        self.assertEqual(normalized_base_url, "https://example.com/v1")
        self.assertEqual(models, [{"id": "gpt-image-2", "category": MODEL_CATEGORY_IMAGE}])
        mocked_discover.assert_called_once_with(
            base_url="https://example.com",
            api_key="secret-key",
        )


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def read(self) -> bytes:
        return self.body

    def close(self) -> None:
        pass


if __name__ == "__main__":
    unittest.main()
