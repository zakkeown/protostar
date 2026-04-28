export interface AuthorizationPayload {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly decisionPath: string;
  readonly target: {
    readonly owner: string;
    readonly repo: string;
    readonly baseBranch: string;
  };
  readonly branchName: string;
  readonly title: string;
  readonly body: string;
  readonly headSha: string;
  readonly baseSha: string;
  readonly mintedAt: string;
}

const BRANCH_NAME_PATTERN = /^[a-zA-Z0-9._/-]+$/;

export function isAuthorizationPayload(value: unknown): value is AuthorizationPayload {
  if (!isRecord(value) || value["schemaVersion"] !== "1.0.0") {
    return false;
  }

  const target = value["target"];
  return (
    typeof value["runId"] === "string" &&
    typeof value["decisionPath"] === "string" &&
    isRecord(target) &&
    typeof target["owner"] === "string" &&
    typeof target["repo"] === "string" &&
    typeof target["baseBranch"] === "string" &&
    typeof value["branchName"] === "string" &&
    BRANCH_NAME_PATTERN.test(value["branchName"]) &&
    typeof value["title"] === "string" &&
    typeof value["body"] === "string" &&
    typeof value["headSha"] === "string" &&
    typeof value["baseSha"] === "string" &&
    typeof value["mintedAt"] === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
