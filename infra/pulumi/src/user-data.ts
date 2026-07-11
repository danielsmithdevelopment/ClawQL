import type { SyncProvider } from "./types.js";

export type BootstrapUserDataOptions = {
  bucket: string;
  prefix: string;
  syncProvider: SyncProvider;
  /** When set, bootstrap loads credentials from AWS SSM Parameter Store at boot. */
  ssmParameterPrefix?: string;
};

/**
 * Cloud-init bash for golden Packer images: set non-secret sync config, then run
 * `/usr/local/bin/bootstrap-team-vault.sh` (credentials via env or SSM).
 */
export function buildBootstrapUserData(opts: BootstrapUserDataOptions): string {
  const lines: string[] = [
    "#!/bin/bash",
    "set -euo pipefail",
    'export CLAWQL_SYNC_BUCKET="' + escapeShellDoubleQuoted(opts.bucket) + '"',
    'export CLAWQL_SYNC_PREFIX="' + escapeShellDoubleQuoted(opts.prefix) + '"',
    'export CLAWQL_SYNC_PROVIDER="' + escapeShellDoubleQuoted(opts.syncProvider) + '"',
  ];

  if (opts.ssmParameterPrefix) {
    const p = escapeShellDoubleQuoted(opts.ssmParameterPrefix);
    lines.push(
      `SSM_PREFIX="${p}"`,
      'if command -v aws >/dev/null 2>&1; then',
      '  export CLAWQL_SYNC_ACCESS_KEY_ID="$(aws ssm get-parameter --name "${SSM_PREFIX}/access-key-id" --with-decryption --query Parameter.Value --output text 2>/dev/null || true)"',
      '  export CLAWQL_SYNC_SECRET_ACCESS_KEY="$(aws ssm get-parameter --name "${SSM_PREFIX}/secret-access-key" --with-decryption --query Parameter.Value --output text 2>/dev/null || true)"',
      '  export CLAWQL_R2_ACCOUNT_ID="$(aws ssm get-parameter --name "${SSM_PREFIX}/r2-account-id" --with-decryption --query Parameter.Value --output text 2>/dev/null || true)"',
      "fi"
    );
  }

  lines.push(
    'if [ -x /usr/local/bin/bootstrap-team-vault.sh ]; then',
    "  exec /usr/local/bin/bootstrap-team-vault.sh",
    "fi",
    'echo "[user-data] bootstrap-team-vault.sh not found" >&2',
    "exit 1"
  );

  return lines.join("\n") + "\n";
}

/** GCP metadata startup-script (same bash as AWS user-data). */
export function buildGcpStartupScript(opts: BootstrapUserDataOptions): string {
  return buildBootstrapUserData(opts);
}

function escapeShellDoubleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$");
}
