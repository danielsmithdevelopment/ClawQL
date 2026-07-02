/**
 * Upload repo-root `.env` into HashiCorp Vault KV (not a Kubernetes Secret).
 *
 * Prerequisites:
 *   - `VAULT_TOKEN` in your environment (root / operator token — never commit it).
 *   - Either **`VAULT_ADDR`** + `vault` CLI on PATH, or **`--kubectl-exec`** + `kubectl` to run `vault` inside the Vault pod.
 *
 * Default KV path matches the External Secrets docs shape: mount **`secret`**, logical path **`clawql/dotenv`**
 * (every non-empty `.env` key becomes a KV field). Use **`--mode providers`** to write only **`clawql/providers`**
 * (`githubToken`, `slackToken`, `onyxApiToken`, … — see docs/deployment/vault-provider-secrets.md`) for ExternalSecret sync.
 *
 * See: docs/deployment/external-secrets-operator-install.md
 *
 * Usage:
 *   VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=… npm run import-dotenv-to-vault -- --http
 *   VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=… npm run import-dotenv-to-vault   # requires `vault` CLI on PATH
 *   VAULT_TOKEN=… npm run import-dotenv-to-vault -- --kubectl-exec
 *   IMPORT_USE_HTTP=1 bash scripts/kubernetes/import-dotenv-to-vault.sh
 */
import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { existsSync, mkdtempSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildProvidersVaultPayload,
  PROVIDER_VAULT_KEY_CATALOG,
} from "./provider-vault-key-catalog.js";

type Mode = "full" | "providers";

type Args = {
  root: string;
  mount: string;
  path: string;
  mode: Mode;
  kubeContext: string;
  namespace: string;
  kubectlExec: boolean;
  useHttp: boolean;
  vaultPod: string;
  restartDeployment: string;
  noRestart: boolean;
};

function parseArgs(argv: string[]): Args {
  let root = "";
  let mount = "secret";
  let path = "clawql/dotenv";
  let mode: Mode = "full";
  let kubeContext = "";
  let namespace = "clawql";
  let kubectlExec = false;
  let useHttp = false;
  let vaultPod = "";
  let restartDeployment = "clawql-mcp-http";
  let noRestart = true;

  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift();
    if (a === "--root") root = rest.shift() ?? "";
    else if (a === "--mount") mount = rest.shift() ?? "";
    else if (a === "--path") path = rest.shift() ?? "";
    else if (a === "--mode") {
      const m = (rest.shift() ?? "").toLowerCase();
      if (m === "providers") mode = "providers";
      else mode = "full";
    } else if (a === "--kube-context") kubeContext = rest.shift() ?? "";
    else if (a === "--namespace") namespace = rest.shift() ?? "";
    else if (a === "--kubectl-exec") kubectlExec = true;
    else if (a === "--http") useHttp = true;
    else if (a === "--vault-pod") vaultPod = rest.shift() ?? "";
    else if (a === "--restart-deployment") {
      restartDeployment = rest.shift() ?? "";
      noRestart = false;
    } else if (a === "--no-restart") noRestart = true;
  }

  if (mode === "providers") {
    path = "clawql/providers";
  }

  return {
    root,
    mount,
    path,
    mode,
    kubeContext,
    namespace,
    kubectlExec,
    useHttp,
    vaultPod,
    restartDeployment,
    noRestart,
  };
}

function kubectlBase(ctx: string): string[] {
  const t = ctx.trim();
  return t ? ["--context", t] : [];
}

function kubectlRun(args: string[], kubeContext: string): void {
  execFileSync("kubectl", [...kubectlBase(kubeContext), ...args], {
    stdio: "inherit",
    env: process.env,
    maxBuffer: 12 * 1024 * 1024,
  });
}

function deploymentExists(
  kubeContext: string,
  namespace: string,
  deployment: string,
): boolean {
  try {
    execFileSync(
      "kubectl",
      [
        ...kubectlBase(kubeContext),
        "get",
        `deployment/${deployment}`,
        "-n",
        namespace,
      ],
      { stdio: "ignore", env: process.env },
    );
    return true;
  } catch {
    return false;
  }
}

function buildPayload(
  parsed: Record<string, string>,
  mode: Mode,
): Record<string, string> {
  if (mode === "providers") {
    const out = buildProvidersVaultPayload(parsed);
    if (Object.keys(out).length === 0) {
      const keys = PROVIDER_VAULT_KEY_CATALOG.flatMap((e) => [...e.envAliases]).join(", ");
      throw new Error(`mode=providers: no recognized provider tokens in .env (expected one of: ${keys})`);
    }
    return out;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined || v === "") continue;
    out[k] = v;
  }
  if (Object.keys(out).length === 0) {
    throw new Error(".env contained no non-empty values");
  }
  return out;
}

async function vaultPutHttp(
  mount: string,
  logicalPath: string,
  payload: Record<string, string>,
): Promise<void> {
  const addrRaw = process.env.VAULT_ADDR?.trim();
  if (!addrRaw) {
    throw new Error("VAULT_ADDR is required for --http (KV v2 REST API)");
  }
  const addr = addrRaw.replace(/\/+$/, "");
  const token = process.env.VAULT_TOKEN?.trim();
  if (!token) {
    throw new Error("VAULT_TOKEN is required");
  }
  const pathEncoded = logicalPath
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join("/");
  const url = `${addr}/v1/${encodeURIComponent(mount)}/data/${pathEncoded}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Token": token,
    },
    body: JSON.stringify({ data: payload }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `Vault KV HTTP ${res.status}${detail ? `: ${detail.slice(0, 2000)}` : ""}`,
    );
  }
}

function vaultPutLocal(
  mount: string,
  path: string,
  jsonFile: string,
  vaultBin: string,
): void {
  const addr = process.env.VAULT_ADDR?.trim();
  if (!addr) {
    throw new Error("VAULT_ADDR is required for local vault CLI (or use --kubectl-exec)");
  }
  const token = process.env.VAULT_TOKEN?.trim();
  if (!token) {
    throw new Error("VAULT_TOKEN is required");
  }
  execFileSync(
    vaultBin,
    ["kv", "put", `-mount=${mount}`, path, `@${jsonFile}`],
    {
      stdio: "inherit",
      env: { ...process.env, VAULT_ADDR: addr, VAULT_TOKEN: token },
    },
  );
}

function vaultPutViaKubectl(
  mount: string,
  path: string,
  jsonFile: string,
  namespace: string,
  pod: string,
  kubeContext: string,
): void {
  const token = process.env.VAULT_TOKEN?.trim();
  if (!token) {
    throw new Error("VAULT_TOKEN is required for vault kv put inside the pod");
  }
  const remote = "/tmp/clawql-dotenv-to-vault.json";
  kubectlRun(["cp", jsonFile, `${namespace}/${pod}:${remote}`], kubeContext);

  try {
    execFileSync(
      "kubectl",
      [
        ...kubectlBase(kubeContext),
        "exec",
        "-n",
        namespace,
        pod,
        "--",
        "env",
        "VAULT_ADDR=http://127.0.0.1:8200",
        `VAULT_TOKEN=${token}`,
        "vault",
        "kv",
        "put",
        `-mount=${mount}`,
        path,
        `@${remote}`,
      ],
      { stdio: "inherit", env: process.env, maxBuffer: 12 * 1024 * 1024 },
    );
  } finally {
    try {
      kubectlRun(["exec", "-n", namespace, pod, "--", "rm", "-f", remote], kubeContext);
    } catch {
      /* ignore */
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: tsx scripts/kubernetes/import-dotenv-to-vault.ts --root <repo> [options]

Reads .env and runs: vault kv put -mount=<mount> <path> @payload.json

Options:
  --mount <name>           KV mount (default: secret)
  --path <logical-path>    default: clawql/dotenv (--mode providers forces clawql/providers)
  --mode full|providers    full = all non-empty .env keys; providers = githubToken/slackToken/onyxApiToken only
  --http                   write KV v2 via HTTPS/HTTP API (no vault CLI); needs VAULT_ADDR + VAULT_TOKEN
  --kubectl-exec           run vault via kubectl exec (needs --vault-pod or default pod name)
  --vault-pod <name>       default: clawql-hashicorpvault-0
  --namespace <ns>         default: clawql
  --kube-context <ctx>     kubectl --context
  --restart-deployment <name>  after Vault write, kubectl rollout restart (default: clawql-mcp-http)
  --no-restart            skip rollout (default unless --restart-deployment is passed)

Env:
  VAULT_TOKEN              required
  VAULT_ADDR               required for --http and local vault CLI (omit when using --kubectl-exec only)
`);
    process.exit(0);
  }

  const p = parseArgs(argv);
  const {
    root,
    mount,
    path,
    mode,
    kubeContext,
    namespace,
    kubectlExec,
    useHttp,
    vaultPod,
    restartDeployment,
    noRestart,
  } = p;

  if (!root.trim()) {
    console.error("ERROR: --root is required");
    process.exit(1);
  }

  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    console.error(`ERROR: ${envPath} not found`);
    process.exit(1);
  }

  const loaded = loadEnv({ path: envPath });
  if (loaded.error) {
    console.error(loaded.error);
    process.exit(1);
  }
  const parsed = loaded.parsed;
  if (!parsed || Object.keys(parsed).length === 0) {
    console.error("ERROR: .env is empty or could not be parsed");
    process.exit(1);
  }

  let payload: Record<string, string>;
  try {
    payload = buildPayload(parsed, mode);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  if (useHttp && kubectlExec) {
    console.error("ERROR: Pass only one of --http or --kubectl-exec");
    process.exit(1);
  }

  if (!process.env.VAULT_TOKEN?.trim()) {
    console.error("ERROR: VAULT_TOKEN must be set");
    process.exit(1);
  }

  if (useHttp || (!kubectlExec && !process.env.VAULT_ADDR?.trim())) {
    if (!process.env.VAULT_ADDR?.trim()) {
      console.error(
        "ERROR: VAULT_ADDR is required for --http and for the vault CLI on your host (omit only with --kubectl-exec).",
      );
      process.exit(1);
    }
  }

  const dir = mkdtempSync(join(tmpdir(), "clawql-vault-"));
  const jsonFile = join(dir, "payload.json");
  writeFileSync(jsonFile, JSON.stringify(payload), { mode: 0o600 });

  const pod = vaultPod.trim() || "clawql-hashicorpvault-0";

  try {
    console.log(
      `==> vault kv write mount=${mount} path=${path} (${Object.keys(payload).length} field(s), mode=${mode}${useHttp ? ", http" : ""})`,
    );
    if (useHttp) {
      await vaultPutHttp(mount, path, payload);
    } else if (kubectlExec) {
      vaultPutViaKubectl(mount, path, jsonFile, namespace, pod, kubeContext);
    } else {
      vaultPutLocal(mount, path, jsonFile, process.env.VAULT_BIN?.trim() || "vault");
    }
  } finally {
    try {
      unlinkSync(jsonFile);
      rmSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  if (noRestart || !restartDeployment.trim()) {
    console.log(
      "==> Skipping deployment restart (External Secrets will sync on refreshInterval; use --restart-deployment NAME to force rollout)",
    );
    return;
  }

  if (!deploymentExists(kubeContext, namespace, restartDeployment)) {
    console.warn(
      `WARN: deployment/${restartDeployment} not found — skip rollout restart`,
    );
    return;
  }

  console.log(`==> kubectl rollout restart deployment/${restartDeployment}`);
  kubectlRun(
    [
      "rollout",
      "restart",
      `deployment/${restartDeployment}`,
      "-n",
      namespace,
    ],
    kubeContext,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
