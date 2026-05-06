import type { WorkflowName } from "../../stores/workspace";

interface WorkspacePersistenceTarget {
  loadWorkspaceState: () => Promise<void>;
  persistWorkspaceState: () => Promise<void>;
  schedulePersistWorkspaceState: () => void;
}

export function createWorkspacePersistenceBridge() {
  let target: WorkspacePersistenceTarget | null = null;

  function setTarget(nextTarget: WorkspacePersistenceTarget) {
    target = nextTarget;
  }

  function loadWorkspaceState() {
    return target?.loadWorkspaceState() || Promise.resolve();
  }

  function persistWorkspaceState() {
    return target?.persistWorkspaceState() || Promise.resolve();
  }

  function schedulePersistWorkspaceState() {
    target?.schedulePersistWorkspaceState();
  }

  return {
    loadWorkspaceState,
    persistWorkspaceState,
    schedulePersistWorkspaceState,
    setTarget,
  };
}

export function createWorkflowBridge() {
  let setWorkflowTarget: ((workflow: WorkflowName) => boolean) | null = null;

  function setTarget(target: (workflow: WorkflowName) => boolean) {
    setWorkflowTarget = target;
  }

  function setWorkflow(workflow: WorkflowName) {
    return setWorkflowTarget?.(workflow) || false;
  }

  return {
    setTarget,
    setWorkflow,
  };
}
