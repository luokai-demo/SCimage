from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from time import perf_counter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

import job_store  # noqa: E402


def main() -> None:
    job_total = 10000
    with TemporaryDirectory() as temp_dir:
        store = job_store.JobStore(Path(temp_dir) / "jobs.db")
        start = perf_counter()
        for index in range(job_total):
            job_id = f"bench-{index:06d}"
            store.create(prompt=f"prompt {index % 200}", count=1, quality="auto", job_id=job_id)
            store.append_image(job_id, {"slot": 1, "name": "image-1.png", "url": f"/generated/{job_id}/image-1.png"})
        insert_seconds = perf_counter() - start

        start = perf_counter()
        jobs_page = store.list_page(limit=100)
        gallery_page = store.list_gallery_images(limit=160)
        groups_page = store.list_gallery_groups(group_by="prompt", limit=80)
        query_seconds = perf_counter() - start

    print(
        {
            "jobs": job_total,
            "insert_seconds": round(insert_seconds, 3),
            "query_seconds": round(query_seconds, 3),
            "jobs_page": len(jobs_page["jobs"]),
            "gallery_page": len(gallery_page["items"]),
            "groups_page": len(groups_page["groups"]),
        }
    )


if __name__ == "__main__":
    main()
