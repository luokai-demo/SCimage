import type { GalleryImagePageItem } from "../../stores/gallery";
import type { JobSummary } from "../../stores/jobs";

export function patchGalleryPageJobStatus(
  items: GalleryImagePageItem[],
  jobId: string,
  patch: Partial<JobSummary>,
) {
  return items.map((item) => {
    const job = item?.job || item;
    if (String(job?.id || item?.job_id || "") !== String(jobId)) return item;
    if (item?.job) {
      return { ...item, job: { ...item.job, ...patch } };
    }
    return { ...item, ...patch };
  });
}
