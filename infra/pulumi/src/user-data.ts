import type { SyncProvider } from "./types.js";

export type BootstrapUserDataOptions = {
  bucket: string;
  prefix: string;
  syncProvider: SyncProvider;
  /** When set, bootstrap loads credentials from AWS SSM Parameter Store at boot. */
  ssmParameterPrefix?: string;
  /**
   * When true (Dedicated VG alpha), boot runs vault sync then starts the Managed Edge
   * Gateway (`/mcp` + `/v1`) via `/usr/local/bin/bootstrap-dedicated-gateway.sh`.
   */
  startManagedGateway?: boolean;
  /** Tenant / team label passed to `clawql gateway create --team`. */
  gatewayTeam?: string;
  /** Edge listen port (default 8080). */
  gatewayPort?: number;
};

/**
 * Cloud-init bash for golden Packer images: set non-secret sync config, then run
 * vault bootstrap and optionally the Dedicated VG Managed Edge Gateway starter.
 * Credentials via env or SSM — never baked into the image.
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
      "if command -v aws >/dev/null 2>&1; then",
      '  export CLAWQL_SYNC_ACCESS_KEY_ID="$(aws ssm get-parameter --name "${SSM_PREFIX}/access-key-id" --with-decryption --query Parameter.Value --output text 2>/dev/null || true)"',
      '  export CLAWQL_SYNC_SECRET_ACCESS_KEY="$(aws ssm get-parameter --name "${SSM_PREFIX}/secret-access-key" --with-decryption --query Parameter.Value --output text 2>/dev/null || true)"',
      '  export CLAWQL_R2_ACCOUNT_ID="$(aws ssm get-parameter --name "${SSM_PREFIX}/r2-account-id" --with-decryption --query Parameter.Value --output text 2>/dev/null || true)"',
      "fi"
    );
  }

  if (opts.startManagedGateway) {
    const team = escapeShellDoubleQuoted(opts.gatewayTeam?.trim() || "default");
    const port = String(
      opts.gatewayPort && Number.isFinite(opts.gatewayPort) ? opts.gatewayPort : 8080
    );
    lines.push(
      `export CLAWQL_GATEWAY_TEAM="${team}"`,
      `export CLAWQL_GATEWAY_PORT="${port}"`,
      'export CLAWQL_GATEWAY_HOST="0.0.0.0"',
      'export CLAWQL_DEDICATED_VG="1"',
      "if [ -x /usr/local/bin/bootstrap-dedicated-gateway.sh ]; then",
      "  exec /usr/local/bin/bootstrap-dedicated-gateway.sh",
      "fi",
      'echo "[user-data] bootstrap-dedicated-gateway.sh not found" >&2',
      "exit 1"
    );
  } else {
    lines.push(
      "if [ -x /usr/local/bin/bootstrap-team-vault.sh ]; then",
      "  exec /usr/local/bin/bootstrap-team-vault.sh",
      "fi",
      'echo "[user-data] bootstrap-team-vault.sh not found" >&2',
      "exit 1"
    );
  }

  return lines.join("\n") + "\n";
}

/** GCP metadata startup-script (same bash as AWS user-data). */
export function buildGcpStartupScript(opts: BootstrapUserDataOptions): string {
  return buildBootstrapUserData(opts);
}

function escapeShellDoubleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$");
}
