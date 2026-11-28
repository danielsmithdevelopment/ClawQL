/**
 * Locate Executor v2 `serve` for /proc memory sampling.
 *
 * Prefer the native platform binary over the tiny node launcher; skip workerd.
 * Root PID walks up to the node `executor serve` wrapper when present so the
 * tree includes CLI + HTTP server + sandbox workers.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";

function cmdlineOf(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
  } catch {
    return "";
  }
}

function parentPid(pid) {
  try {
    const text = readFileSync(`/proc/${pid}/status`, "utf8");
    const m = text.match(/^PPid:\s+(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** Prefer native platform binary PID — not the tiny node launcher. */
export function findExecutorV2ServePid() {
  if (process.env.EXECUTOR_V2_PID) {
    const n = Number(process.env.EXECUTOR_V2_PID);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const ranked = [];
  for (const ent of readdirSync("/proc")) {
    if (!/^\d+$/.test(ent)) continue;
    try {
      const cmd = cmdlineOf(ent);
      if (!/\bserve\b/.test(cmd) || /workerd/.test(cmd)) continue;
      if (/executor-(linux|darwin|win)[^/]*\/executor(\.exe)?\b/.test(cmd)) {
        ranked.push({ pid: Number(ent), rank: 0 });
      } else if (/\bexecutor\b/.test(cmd) && !/\bnode\b/.test(cmd)) {
        ranked.push({ pid: Number(ent), rank: 1 });
      } else if (/\bexecutor\b/.test(cmd)) {
        ranked.push({ pid: Number(ent), rank: 2 });
      }
    } catch {
      /* ignore */
    }
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked[0]?.pid ?? null;
}

/**
 * Top of the Executor serve tree (node launcher → native serve → workerd kids).
 * Use this as the PPID-walk root for fair RSS/anon vs aggregator trees.
 */
export function findExecutorV2ServeRootPid() {
  let pid = findExecutorV2ServePid();
  if (pid == null) return null;
  for (;;) {
    const ppid = parentPid(pid);
    if (ppid == null || ppid <= 1) break;
    const cmd = cmdlineOf(ppid);
    if (!cmd || /workerd/.test(cmd)) break;
    if (/\bexecutor\b/.test(cmd) && /\bserve\b/.test(cmd)) {
      pid = ppid;
      continue;
    }
    break;
  }
  return pid;
}

export function executorV2ApiKey() {
  const fromEnv = process.env.EXECUTOR_V2_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const path = "/tmp/executor-v2-data/api_key.txt";
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  return "";
}
