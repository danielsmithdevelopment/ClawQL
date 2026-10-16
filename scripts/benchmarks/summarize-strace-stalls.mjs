/**
 * Filter strace -tt -T output for long syscalls; optional correlate with mt-client-slow lines.
 *
 *   node scripts/benchmarks/summarize-strace-stalls.mjs \
 *     --strace /opt/cursor/artifacts/stall.strace \
 *     --slow-log /opt/cursor/artifacts/srvcli.stderr.log \
 *     --min-ms 20
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}
const stracePath = opt("--strace", "/opt/cursor/artifacts/stall.strace");
const slowLog = opt("--slow-log", "");
const minMs = Number(opt("--min-ms", "20")) || 20;
const outPath = opt("--out", "/opt/cursor/artifacts/strace-stall-summary.json");

const text = readFileSync(stracePath, "utf8");
const longCalls = [];
// Completed:  pid HH:MM:SS.u syscall(...) = r <sec>
// Resumed:    pid HH:MM:SS.u <... syscall resumed>) = r <sec>
const reDone =
  /^(\d+)\s+(\d{2}:\d{2}:\d{2}\.\d+)\s+([A-Za-z0-9_]+)\((.*)\)\s*=\s*(.*?)\s*<([0-9.]+)>$/;
const reResume =
  /^(\d+)\s+(\d{2}:\d{2}:\d{2}\.\d+)\s+<\.\.\. ([A-Za-z0-9_]+) resumed>\)\s*=\s*(.*?)\s*<([0-9.]+)>$/;
for (const line of text.split(/\r?\n/)) {
  let m = line.match(reResume);
  if (m) {
    const durMs = Number(m[5]) * 1000;
    if (durMs < minMs) continue;
    longCalls.push({
      pid: Number(m[1]),
      t: m[2],
      syscall: m[3],
      args: "(resumed)",
      result: m[4].slice(0, 80),
      duration_ms: Number(durMs.toFixed(2)),
    });
    continue;
  }
  m = line.match(reDone);
  if (!m) continue;
  const durMs = Number(m[6]) * 1000;
  if (durMs < minMs) continue;
  longCalls.push({
    pid: Number(m[1]),
    t: m[2],
    syscall: m[3],
    args: m[4].slice(0, 180),
    result: m[5].slice(0, 80),
    duration_ms: Number(durMs.toFixed(2)),
  });
}
longCalls.sort((a, b) => b.duration_ms - a.duration_ms);

let clientSlows = [];
if (slowLog) {
  try {
    const slog = readFileSync(slowLog, "utf8");
    for (const line of slog.split(/\r?\n/)) {
      if (!line.includes("[mt-client-slow]")) continue;
      const ms = Number(line.match(/\[mt-client-slow\] ([\d.]+)ms/)?.[1] ?? NaN);
      const t0 = line.match(/t0=(\S+)/)?.[1];
      const ttfb = line.match(/ttfb_ms=([\d.-]+)/)?.[1];
      const complete = line.match(/complete_ms=([\d.-]+)/)?.[1];
      const hold = line.match(/hold_ms=([\d.-]+)/)?.[1];
      const ctype = line.match(/content_type=(\S+)/)?.[1];
      if (Number.isFinite(ms)) {
        clientSlows.push({
          client_ms: ms,
          t0,
          ttfb_ms: ttfb,
          complete_ms: complete,
          hold_ms: hold,
          content_type: ctype,
          line: line.slice(0, 400),
        });
      }
    }
  } catch {
    /* optional */
  }
}

const bySyscall = {};
for (const c of longCalls) {
  bySyscall[c.syscall] = (bySyscall[c.syscall] || 0) + 1;
}

const out = {
  stracePath,
  min_ms: minMs,
  long_call_count: longCalls.length,
  by_syscall: bySyscall,
  top: longCalls.slice(0, 40),
  client_slows: clientSlows.slice(0, 30),
  note:
    "Long epoll_wait/futex alone is idle. Long write/send* during a client slow window implicates response path. " +
    "hold_ms ≫ ttfb_ms with content_type text/event-stream ⇒ stream not closed promptly.",
};
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
