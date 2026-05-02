from __future__ import annotations

import base64
from pathlib import Path
from threading import Event
import subprocess
import sys
import threading
import time
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

for candidate in (WEBAPP_DIR, SCRIPTS_DIR):
    candidate_text = str(candidate)
    if candidate_text not in sys.path:
        sys.path.insert(0, candidate_text)

from gateway_client import GatewayConfig, GatewayFatalError, _is_retryable_message, save_image_item
from job_control import JobRunner
from openai_sdk_gateway import OpenAISDKConfig, normalize_openai_sdk_base_url, request_openai_sdk_generation
from openai_image_sdk import SDK_WORKER_ARG, _sdk_worker_command
from output_options import (
    OUTPUT_PROFILE_ASPECT_V1,
    OUTPUT_PROFILE_PIXEL_V1,
    normalize_quality,
    normalize_size_value,
    resolve_api_size_value,
    resolve_openai_sdk_quality,
    resolve_openai_sdk_size_value,
)
from provider_compat import OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID
from provider_compat import (
    IMAGE_TO_IMAGE_TRANSPORT_OPENAI_SDK,
    OPENAI_LEGACY_COMPAT_PROFILE_ID,
    TEXT_TO_IMAGE_TRANSPORT_OPENAI_SDK,
    get_compat_profile,
)
from provider_profiles import ProviderProfileStore


class OutputOptionsTests(unittest.TestCase):
    def test_pixel_profile_maps_legacy_quality_and_aspect(self) -> None:
        self.assertEqual(
            normalize_quality("medium", output_profile_id=OUTPUT_PROFILE_PIXEL_V1),
            "hd",
        )
        self.assertEqual(
            normalize_size_value("9:16", quality="hd", output_profile_id=OUTPUT_PROFILE_PIXEL_V1),
            "1440x2560",
        )

    def test_aspect_profile_accepts_pixel_size_and_resolves_api_dimensions(self) -> None:
        self.assertEqual(
            normalize_size_value("1440x2560", output_profile_id=OUTPUT_PROFILE_ASPECT_V1),
            "9:16",
        )
        self.assertEqual(
            resolve_api_size_value("9:16", "medium", output_profile_id=OUTPUT_PROFILE_ASPECT_V1),
            "1152x2048",
        )

    def test_openai_sdk_resolvers_map_portrait_and_pixel_tiers(self) -> None:
        self.assertEqual(
            resolve_openai_sdk_quality("medium", output_profile_id=OUTPUT_PROFILE_ASPECT_V1),
            "medium",
        )
        self.assertEqual(
            resolve_openai_sdk_size_value("9:16", "medium", output_profile_id=OUTPUT_PROFILE_ASPECT_V1),
            "1024x1536",
        )
        self.assertEqual(
            resolve_openai_sdk_quality("4k", output_profile_id=OUTPUT_PROFILE_PIXEL_V1),
            "high",
        )
        self.assertEqual(
            resolve_openai_sdk_size_value("2560x1440", "hd", output_profile_id=OUTPUT_PROFILE_PIXEL_V1),
            "1536x1024",
        )


class ProviderProfileStoreTests(unittest.TestCase):
    def test_store_persists_compat_profile_and_returns_registry(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = ProviderProfileStore(Path(temp_dir) / "provider-profiles.json")
            state = store.create_profile(
                name="newcoding",
                base_url="https://example.com/v1",
                model="gpt-image-1",
                api_key="secret-key",
                compat_profile_id=OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID,
                supports_count_parameter=False,
            )

            self.assertEqual(
                state["active_profile"]["compat_profile_id"],
                OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID,
            )
            self.assertFalse(state["active_profile"]["supports_count_parameter"])
            self.assertTrue(
                any(profile["id"] == OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID for profile in state["compat_profiles"])
            )

            reloaded_store = ProviderProfileStore(Path(temp_dir) / "provider-profiles.json")
            reloaded_profile = reloaded_store.get_active_profile()
            self.assertIsNotNone(reloaded_profile)
            self.assertFalse(reloaded_profile.supports_count_parameter)

    def test_delete_active_profile_switches_to_remaining_profile(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = ProviderProfileStore(Path(temp_dir) / "provider-profiles.json")
            alpha_state = store.create_profile(
                name="alpha",
                base_url="https://example.com/v1",
                model="gpt-image-1",
                api_key="alpha-key",
            )
            beta_state = store.create_profile(
                name="beta",
                base_url="https://example.com/v1",
                model="gpt-image-1",
                api_key="beta-key",
            )

            next_state = store.delete_profile(beta_state["active_profile_id"])

            self.assertEqual(next_state["active_profile_id"], alpha_state["active_profile_id"])
            self.assertEqual(next_state["active_profile"]["name"], "alpha")
            self.assertEqual(len(next_state["profiles"]), 1)

    def test_delete_last_profile_clears_active_profile(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = ProviderProfileStore(Path(temp_dir) / "provider-profiles.json")
            state = store.create_profile(
                name="solo",
                base_url="https://example.com/v1",
                model="gpt-image-1",
                api_key="solo-key",
            )

            next_state = store.delete_profile(state["active_profile_id"])

            self.assertIsNone(next_state["active_profile_id"])
            self.assertIsNone(next_state["active_profile"])
            self.assertEqual(next_state["profiles"], [])


class ProviderCompatProfileTests(unittest.TestCase):
    def test_openai_legacy_profile_routes_to_openai_sdk_protocol(self) -> None:
        profile = get_compat_profile(OPENAI_LEGACY_COMPAT_PROFILE_ID)

        self.assertEqual(profile.text_to_image_transport, TEXT_TO_IMAGE_TRANSPORT_OPENAI_SDK)
        self.assertEqual(profile.image_to_image_transport, IMAGE_TO_IMAGE_TRANSPORT_OPENAI_SDK)


class OpenAISDKGatewayTests(unittest.TestCase):
    def test_base_url_without_version_suffix_is_normalized(self) -> None:
        self.assertEqual(
            normalize_openai_sdk_base_url("https://example.com"),
            "https://example.com/v1",
        )
        self.assertEqual(
            normalize_openai_sdk_base_url("https://example.com/v1"),
            "https://example.com/v1",
        )

    def test_request_generation_runs_in_process_for_desktop_compatibility(self) -> None:
        with patch(
            "openai_image_sdk._execute_openai_sdk_request",
            return_value={"data": [{"b64_json": "ZmFrZQ=="}]},
        ) as mocked_execute:
            payload = request_openai_sdk_generation(
                base_url="https://example.com",
                api_key="test-key",
                model="gpt-image-1",
                prompt="apple",
                count=1,
                quality="low",
                size="1024x1024",
                config=OpenAISDKConfig(),
            )

        self.assertEqual(payload, {"data": [{"b64_json": "ZmFrZQ=="}]})
        mocked_execute.assert_called_once()

    def test_request_generation_honors_cancel_before_request(self) -> None:
        cancel_event = Event()
        cancel_event.set()

        with patch("openai_image_sdk._execute_openai_sdk_request") as mocked_execute:
            with self.assertRaisesRegex(RuntimeError, "图像任务已取消"):
                request_openai_sdk_generation(
                    base_url="https://example.com",
                    api_key="test-key",
                    model="gpt-image-1",
                    prompt="apple",
                    count=1,
                    quality="low",
                    size="1024x1024",
                    config=OpenAISDKConfig(),
                    cancel_event=cancel_event,
                )

        mocked_execute.assert_not_called()

    def test_frozen_sdk_worker_command_uses_app_executable(self) -> None:
        with patch.object(sys, "frozen", True, create=True):
            self.assertEqual(_sdk_worker_command(), [sys.executable, SDK_WORKER_ARG])

    def test_request_generation_uses_runner_managed_subprocess(self) -> None:
        runner = JobRunner(job_id="sdk-runner")

        with patch(
            "openai_image_sdk._run_openai_sdk_subprocess",
            return_value={"data": [{"b64_json": "ZmFrZQ=="}]},
        ) as mocked_subprocess:
            payload = request_openai_sdk_generation(
                base_url="https://example.com",
                api_key="test-key",
                model="gpt-image-1",
                prompt="apple",
                count=1,
                quality="low",
                size="1024x1024",
                config=OpenAISDKConfig(),
                cancel_event=runner.cancel_event,
                runner=runner,
            )

        self.assertEqual(payload, {"data": [{"b64_json": "ZmFrZQ=="}]})
        mocked_subprocess.assert_called_once()
        self.assertIs(mocked_subprocess.call_args.kwargs["runner"], runner)

    def test_runner_cancel_stops_blocked_openai_sdk_subprocess(self) -> None:
        runner = JobRunner(job_id="sdk-cancel")
        started = Event()
        real_popen = subprocess.Popen
        thread_errors: list[BaseException] = []

        def blocking_popen(*args, **kwargs):
            process = real_popen(
                [
                    sys.executable,
                    "-c",
                    (
                        "import signal, time\n"
                        "signal.signal(signal.SIGTERM, lambda *_: exit(0))\n"
                        "time.sleep(30)\n"
                    ),
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                **{key: value for key, value in kwargs.items() if key in {"start_new_session", "creationflags"}},
            )
            started.set()
            return process

        def run_blocked_request() -> None:
            try:
                with self.assertRaisesRegex(RuntimeError, "图像任务已取消"):
                    request_openai_sdk_generation(
                        base_url="https://example.com",
                        api_key="test-key",
                        model="gpt-image-1",
                        prompt="apple",
                        count=1,
                        quality="low",
                        size="1024x1024",
                        config=OpenAISDKConfig(),
                        cancel_event=runner.cancel_event,
                        runner=runner,
                    )
            except BaseException as exc:
                thread_errors.append(exc)

        with patch("openai_image_sdk.subprocess.Popen", side_effect=blocking_popen):
            request_thread = threading.Thread(target=run_blocked_request)
            request_thread.start()
            self.assertTrue(started.wait(1))
            started_at = time.monotonic()
            runner.request_cancel()
            request_thread.join(2)

        self.assertFalse(request_thread.is_alive())
        if thread_errors:
            raise thread_errors[0]
        self.assertLess(time.monotonic() - started_at, 1.5)
        self.assertEqual(runner.process_ids, set())


class GatewayPayloadFallbackTests(unittest.TestCase):
    def test_upstream_error_is_retryable(self) -> None:
        self.assertTrue(_is_retryable_message('{"message":"Upstream request failed","type":"upstream_error"}'))

    def test_save_image_item_falls_back_to_base64_payload(self) -> None:
        payload = base64.b64encode(b"fallback-image-bytes").decode("ascii")
        with TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "image.png"
            with patch(
                "gateway_client.download_file",
                side_effect=GatewayFatalError("primary url failed"),
            ) as mocked_download:
                payload_type = save_image_item(
                    item={
                        "url": "https://example.com/primary.png",
                        "b64_json": payload,
                    },
                    target=target,
                    base_url="https://example.com/v1",
                    config=GatewayConfig(),
                )

            self.assertEqual(payload_type, "b64_json")
            self.assertEqual(target.read_bytes(), b"fallback-image-bytes")
            mocked_download.assert_called_once()

if __name__ == "__main__":
    unittest.main()
