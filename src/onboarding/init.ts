/**
 * `clawql init` — scaffold ~/.ClawQL, memory paths, and local provider vault.
 */

import { appendFile, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import {
  DEFAULT_STACK_VAULT_ENTRIES,
  type ProviderVaultKeyEntry,
} from "../provider-vault/catalog.js";
import {
  mergeEnvIntoLocalProvidersVault,
  readLocalProvidersVault,
} from "../provider-vault/local-store.js";
import {
  getClawqlEnvFilePath,
  getClawqlHome,
  getLocalProvidersVaultPath,
  INIT_DIRECTORIES,
} from "./paths.js";

export type InitOptions = {
  home?: string;
  yes?: boolean;
  interactive?: boolean;
  fromEnv?: string;
  pushVault?: boolean;
};

export type InitResult = {
  home: string;
  createdDirs: string[];
  envFile: string;
  providersVault: string;
  providerKeys: string[];
  pushedToHashicorpVault: boolean;
};

async function ensureDir(home: string, rel: string): Promise<boolean> {
  const full = resolve(home, rel);
  const existed = existsSync(full);
  await mkdir(full, { recursive: true });
  return !existed;
}

async function writeClawqlEnv(home: string): Promise<string> {
  const envPath = getClawqlEnvFilePath(home);
  const lines = [
    "# ClawQL local config (no secrets — provider tokens live in vault/providers.json)",
    `CLAWQL_OBSIDIAN_VAULT_PATH=${home}`,
    `CLAWQL_HOME=${home}`,
    "",
  ];
  if (!existsSync(envPath)) {
    await writeFile(envPath, lines.join("\n"), { encoding: "utf8", mode: 0o600 });
    await chmod(envPath, 0o600);
  } else {
    const raw = await readFile(envPath, "utf8");
    const additions: string[] = [];
    if (!raw.includes("CLAWQL_OBSIDIAN_VAULT_PATH=")) {
      additions.push(`CLAWQL_OBSIDIAN_VAULT_PATH=${home}`);
    }
    if (!raw.includes("CLAWQL_HOME=")) {
      additions.push(`CLAWQL_HOME=${home}`);
    }
    if (additions.length) {
      await appendFile(envPath, `\n${additions.join("\n")}\n`);
    }
  }
  return envPath;
}

async function promptToken(
  rl: ReturnType<typeof createInterface>,
  entry: ProviderVaultKeyEntry
): Promise<string | undefined> {
  const hint = entry.hint ? ` (${entry.hint})` : "";
  const answer = (
    await rl.question(`${entry.label}${hint}\n  Paste value or Enter to skip: `)
  ).trim();
  return answer || undefined;
}

async function runInteractiveVault(home: string): Promise<string[]> {
  const rl = createInterface({ input, output });
  const stored: string[] = [];
  try {
    output.write(
      "\nDefault-stack provider tokens (stored in vault/providers.json, mode 0600).\n" +
        "Press Enter to skip any vendor you are not using yet.\n\n"
    );
    const data: Record<string, string> = {
      ...((await readLocalProvidersVault(getLocalProvidersVaultPath(home)))?.data ?? {}),
    };
    for (const entry of DEFAULT_STACK_VAULT_ENTRIES) {
      if (data[entry.vaultProperty]?.trim()) {
        output.write(`  ${entry.label}: already set (skip)\n`);
        continue;
      }
      const value = await promptToken(rl, entry);
      if (value) {
        data[entry.vaultProperty] = value;
        stored.push(entry.vaultProperty);
      }
    }
    if (stored.length) {
      const { writeLocalProvidersVault } = await import("../provider-vault/local-store.js");
      await writeLocalProvidersVault(data, getLocalProvidersVaultPath(home));
    }
  } finally {
    rl.close();
  }
  return stored;
}

async function tryPushHashicorpVault(fromEnvPath: string): Promise<boolean> {
  if (!process.env.VAULT_TOKEN?.trim()) {
    return false;
  }
  const { spawnSync } = await import("node:child_process");
  const args = [
    "scripts/kubernetes/import-dotenv-to-vault.ts",
    "--root",
    resolve(fromEnvPath, ".."),
    "--mode",
    "providers",
  ];
  if (process.env.VAULT_ADDR?.trim()) args.push("--http");
  if (process.env.CLAWQL_INIT_KUBECTL_VAULT === "1") args.push("--kubectl-exec");

  const result = spawnSync("npx", ["tsx", ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      IMPORT_MODE: "providers",
    },
  });
  return result.status === 0;
}

export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const home = resolve(options.home ?? getClawqlHome());
  const createdDirs: string[] = [];
  for (const rel of INIT_DIRECTORIES) {
    if (await ensureDir(home, rel)) createdDirs.push(rel);
  }

  const envFile = await writeClawqlEnv(home);
  let providerKeys: string[] = [];

  if (options.fromEnv) {
    const parsed = loadDotenv({ path: resolve(options.fromEnv) }).parsed ?? {};
    const merged = await mergeEnvIntoLocalProvidersVault(parsed, getLocalProvidersVaultPath(home));
    providerKeys = listKeys(merged.data);
  }

  if (options.interactive && !options.yes) {
    providerKeys = [...new Set([...providerKeys, ...(await runInteractiveVault(home))])];
  }

  const vault = await readLocalProvidersVault(getLocalProvidersVaultPath(home));
  let pushedToHashicorpVault = false;
  if (options.pushVault && vault && Object.keys(vault.data).length > 0) {
    const tmpEnv = `${home}/.clawql-init-push.env`;
    const { vaultProviderDataToEnv } = await import("../provider-vault/catalog.js");
    const envLines = Object.entries(vaultProviderDataToEnv(vault.data)).map(
      ([k, v]) => `${k}=${v}`
    );
    await writeFile(tmpEnv, `${envLines.join("\n")}\n`, { mode: 0o600 });
    pushedToHashicorpVault = await tryPushHashicorpVault(tmpEnv);
  }

  return {
    home,
    createdDirs,
    envFile,
    providersVault: getLocalProvidersVaultPath(home),
    providerKeys: listKeys(vault?.data ?? {}),
    pushedToHashicorpVault,
  };
}

function listKeys(data: Record<string, string>): string[] {
  return Object.keys(data).filter((k) => data[k]?.trim());
}
