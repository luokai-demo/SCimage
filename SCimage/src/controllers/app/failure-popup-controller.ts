// @ts-nocheck

export function createFailurePopupController({
  elements,
  formatJobFailureMessage,
  getActionBusy,
  getProblemJobKey,
  isProblemPopupStatus,
  isRetryableJob,
}) {
  const seenProblemJobKeys = new Set();
  const failurePopupQueue = [];
  let activeFailurePopup = null;
  let problemPopupReady = false;

  function syncActions() {
    if (!activeFailurePopup) {
      return;
    }

    const jobId = activeFailurePopup.jobId || "";
    const isBusy = Boolean(jobId && getActionBusy(jobId));
    if (elements.failurePopupRetry) {
      elements.failurePopupRetry.style.display = activeFailurePopup.retryable ? "" : "none";
      elements.failurePopupRetry.disabled = activeFailurePopup.retryable ? isBusy : true;
      elements.failurePopupRetry.dataset.jobId = jobId;
    }
    if (elements.failurePopupDelete) {
      elements.failurePopupDelete.style.display = jobId ? "" : "none";
      elements.failurePopupDelete.disabled = !jobId || isBusy;
      elements.failurePopupDelete.dataset.jobId = jobId;
    }
  }

  function showNext() {
    if (activeFailurePopup || !failurePopupQueue.length || !elements.failurePopup) {
      return;
    }
    activeFailurePopup = failurePopupQueue.shift();
    elements.failurePopupPrompt.textContent = activeFailurePopup.prompt || "未提供提示词";
    elements.failurePopupContent.textContent = activeFailurePopup.message;
    syncActions();
    elements.failurePopup.classList.add("open");
  }

  function close() {
    if (!elements.failurePopup) {
      return;
    }
    elements.failurePopup.classList.remove("open");
    activeFailurePopup = null;
    if (failurePopupQueue.length) {
      window.setTimeout(showNext, 120);
    }
  }

  function clearEntries(jobId) {
    if (!jobId) {
      return;
    }
    for (let index = failurePopupQueue.length - 1; index >= 0; index -= 1) {
      if (failurePopupQueue[index]?.jobId === jobId) {
        failurePopupQueue.splice(index, 1);
      }
    }
    if (activeFailurePopup && activeFailurePopup.jobId === jobId) {
      close();
    }
  }

  function syncProblemJobs(jobs) {
    const nextJobs = Array.isArray(jobs) ? jobs : [];
    const problemJobs = nextJobs.filter((job) => isProblemPopupStatus(job.status));

    if (!problemPopupReady) {
      problemJobs.forEach((job) => {
        seenProblemJobKeys.add(getProblemJobKey(job));
      });
      problemPopupReady = true;
      return;
    }

    problemJobs.forEach((job) => {
      const key = getProblemJobKey(job);
      if (seenProblemJobKeys.has(key)) {
        return;
      }
      seenProblemJobKeys.add(key);
      failurePopupQueue.push({
        jobId: job.id,
        prompt: job.prompt,
        message: formatJobFailureMessage(job),
        retryable: isRetryableJob(job),
      });
    });

    showNext();
  }

  return {
    clearEntries,
    close,
    showNext,
    syncActions,
    syncProblemJobs,
  };
}
