/** Model deployment status values — must match backend LLMModel.deploy_status */
export const DEPLOY_STATUS = {
  NONE: "",
  DEPLOYING: "deploying",
  RUNNING: "running",
  STOPPED: "stopped",
  FAILED: "failed",
  CLEANUP_FAILED: "cleanup_failed",
} as const;

export type DeployStatus = (typeof DEPLOY_STATUS)[keyof typeof DEPLOY_STATUS];

export const DEPLOY_STATUS_LABEL: Record<string, string> = {
  "": "",
  deploying: "部署中",
  running: "运行中",
  stopped: "已停止",
  failed: "部署失败",
  cleanup_failed: "清理失败",
};
