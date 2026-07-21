export function deriveEnvSuffix(workspaceName: string): string {
  return workspaceName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function deriveClientIdEnvVar(workspaceName: string): string {
  return `SLACK_CLIENT_ID_${deriveEnvSuffix(workspaceName)}`;
}

export function deriveClientSecretEnvVar(workspaceName: string): string {
  return `SLACK_CLIENT_SECRET_${deriveEnvSuffix(workspaceName)}`;
}

export function deriveTokenEnvVar(workspaceName: string): string {
  return `SLACK_TOKEN_${deriveEnvSuffix(workspaceName)}`;
}
