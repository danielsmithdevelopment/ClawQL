/**
 * Version pins for multi-attack board rows.
 *
 * Every measured arm records the ClawQL commit and the peer product version
 * so the board can be reproduced when anyone ships an update.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");

function git(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** ClawQL pin for the board / every peer row. */
export function clawqlVersionPin() {
  const pkg = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8")
  ).version;
  const commit = git("git rev-parse HEAD");
  const commit_short = git("git rev-parse --short HEAD");
  const branch = git("git rev-parse --abbrev-ref HEAD");
  return {
    package: pkg,
    commit,
    commit_short,
    branch,
  };
}

/**
 * @param {"obot"|"bifrost"|"executor"|"clawql"|"passthrough"} peer
 * @param {Record<string, unknown>} [detected]
 */
export function peerVersionPin(peer, detected = {}) {
  const base = {
    peer,
    ...detected,
  };
  if (peer === "obot") {
    return {
      ...base,
      kind: "container_image",
      image:
        detected.image ||
        process.env.OBOT_IMAGE?.trim() ||
        "ghcr.io/obot-platform/obot:latest",
      digest: detected.digest || process.env.OBOT_IMAGE_DIGEST?.trim() || null,
      label: detected.label || "Obot gateway (mcp-webhook-validations)",
    };
  }
  if (peer === "bifrost") {
    return {
      ...base,
      kind: "bifrost_http_binary",
      package: detected.package || "@maximhq/bifrost",
      binary: detected.binary || process.env.BIFROST_BIN?.trim() || null,
      version:
        detected.version ||
        process.env.BIFROST_VERSION?.trim() ||
        inferBifrostVersion(detected.binary || process.env.BIFROST_BIN),
      label: detected.label || "Bifrost MCP (virtual-key tool scoping)",
    };
  }
  if (peer === "executor") {
    return {
      ...base,
      kind: "npm_package",
      package: "executor",
      version:
        detected.version ||
        process.env.EXECUTOR_VERSION?.trim() ||
        readExecutorNpmVersion(),
      install_dir:
        detected.install_dir ||
        process.env.EXECUTOR_INSTALL?.trim() ||
        "/tmp/executor-gov",
      label: detected.label || "Executor (native policies.block)",
    };
  }
  if (peer === "clawql") {
    return {
      ...base,
      kind: "clawql_package",
      ...clawqlVersionPin(),
      label: "ClawQL product gate (park + IFC)",
    };
  }
  return {
    ...base,
    kind: "control",
    label: "Passthrough vault-mcp (no gateway)",
  };
}

function inferBifrostVersion(binPath) {
  if (!binPath) return null;
  // ~/.cache/bifrost/v2.3.1/bin/bifrost-http-0
  const m = String(binPath).match(/\/v(\d+\.\d+\.\d+)\//);
  return m ? m[1] : null;
}

function readExecutorNpmVersion() {
  const home =
    process.env.EXECUTOR_INSTALL?.trim() || "/tmp/executor-gov";
  const pkgPath = join(home, "node_modules/executor/package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")).version;
  } catch {
    return null;
  }
}

/**
 * Maintainer invites with per-peer reproduction commands.
 * First response should be "here's a better configuration", not "this is unfair."
 */
export function maintainerInvites() {
  return {
    framing:
      "Peer maintainers: the scripted board uses your product's native best-config, a deny precondition (Obot), the same Obsidian Memory/ vault, the same 12 attacks, and the same 14 benign cases. If you have a stronger configuration that keeps memory writes working while stopping these attacks, open a PR with raw JSON from the commands below.",
    clawql_board:
      "npm run build -w clawql-api && npm run benchmark:multi-attack-injection",
    peers: {
      bifrost: {
        product: "Bifrost",
        mechanism: "Virtual key that omits memory_ingest (tools_to_execute allow-list)",
        reproduce:
          "npm run benchmark:multi-attack-injection:bifrost",
        docs: "scripts/benchmarks/multi-attack-injection/ci-bifrost-peer.sh",
      },
      executor: {
        product: "Executor",
        mechanism: "Native coreTools.policies.create action=block on vault memory_ingest",
        reproduce:
          "npm run benchmark:multi-attack-injection:executor",
        docs: "scripts/benchmarks/multi-attack-injection/ci-executor-peer.sh",
      },
      obot: {
        product: "Obot",
        mechanism:
          "Native mcp-webhook-validations deny on memory_ingest (precondition: one refused tools/call outside corpus, then one 12+14 run)",
        reproduce:
          "npm run benchmark:multi-attack-injection:obot",
        docs: "docs/benchmarks/security-suite/multi-attack-injection/MAC-MINI-OBOT.md",
        platform: "macOS / Mac mini (results stamp host_os=darwin, measured_on=mac_mini)",
      },
    },
  };
}
