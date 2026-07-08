import { execSync } from "node:child_process";

export type HashicorpVaultProbe = {
  reachable: boolean;
  addr?: string;
  source: "VAULT_ADDR" | "kubectl" | "none";
  sealed?: boolean;
  hint?: string;
};

/** Best-effort detect local HashiCorp Vault (Helm `make local-k8s-up` path). */
export async function probeHashicorpVault(): Promise<HashicorpVaultProbe> {
  const envAddr = process.env.VAULT_ADDR?.trim();
  if (envAddr) {
    const health = await fetchVaultHealth(envAddr);
    return {
      reachable: health.reachable,
      addr: envAddr,
      source: "VAULT_ADDR",
      sealed: health.sealed,
    };
  }

  try {
    execSync("kubectl -n clawql get svc vault -o name", {
      stdio: "ignore",
      timeout: 5_000,
    });
    const addr = "http://127.0.0.1:8200";
    const health = await fetchVaultHealth(addr);
    return {
      reachable: health.reachable,
      addr,
      source: "kubectl",
      sealed: health.sealed,
      hint: "Vault service found in namespace clawql — port-forward or set VAULT_ADDR",
    };
  } catch {
    return { reachable: false, source: "none" };
  }
}

async function fetchVaultHealth(
  addr: string,
): Promise<{ reachable: boolean; sealed?: boolean }> {
  const base = addr.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/v1/sys/health`, {
      signal: AbortSignal.timeout(2_500),
    });
    // Vault: 200=active, 429=unsealed standby, 501=not init, 503=sealed
    const reachable = res.status === 200 || res.status === 429 || res.status === 503 || res.status === 501;
    const sealed = res.status === 503;
    return { reachable, sealed };
  } catch {
    return { reachable: false };
  }
}

export function hasVaultPushCredentials(): boolean {
  return Boolean(process.env.VAULT_TOKEN?.trim());
}
