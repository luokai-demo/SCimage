import os
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8765
MAX_IMAGE_COUNT = 6
MAX_PARALLEL_IMAGE_WORKERS = 4
RECENT_JOBS_LIMIT = 60
QUALITY_OPTIONS = ("auto", "low", "medium", "high")

APP_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = APP_ROOT / "scripts" / "generate_image.py"
STATIC_DIR = APP_ROOT / "webapp" / "static"
GENERATED_DIR = APP_ROOT / "generated"
LOCAL_STATE_DIR = APP_ROOT / ".local"
PROVIDER_PROFILES_PATH = LOCAL_STATE_DIR / "provider-profiles.json"
JOB_RECORDS_PATH = LOCAL_STATE_DIR / "job-records.json"
DEFAULT_PROVIDER_MODEL = os.getenv("IMAGE_API_MODEL", "gpt-image-2")
