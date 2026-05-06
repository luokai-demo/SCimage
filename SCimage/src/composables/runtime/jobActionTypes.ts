import type { JobSummary } from "../../stores/jobs";
import type { RuntimeLightboxState } from "./lightbox";
import type { StatusTone } from "./status";

export interface JobBusyController {
  setJobBusy: (jobId: string, busy: boolean) => void;
}

export interface JobLookupContext {
  getActionJob: (jobId: string) => JobSummary | null | undefined;
}

export interface JobActionSharedContext extends JobBusyController, JobLookupContext {
  clearFailurePopupEntries: (jobId: string) => void;
  closeFailurePopup: () => void;
  closeLightboxIfMissing: () => void;
  failurePopupJobId: () => string;
  lightbox: RuntimeLightboxState;
  locallyCanceledJobIds: Set<string>;
  refreshJobs: (options?: { silent?: boolean; reset?: boolean }) => Promise<void>;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
}
