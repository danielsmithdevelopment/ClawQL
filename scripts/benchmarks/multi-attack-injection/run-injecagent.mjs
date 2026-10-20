/**
 * InjecAgent held-out arm (named before v2 remeasure).
 *
 *   MAI_INJECAGENT=1 npm run benchmark:multi-attack-injection:injecagent
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const py = path.join(
  root,
  "scripts/benchmarks/multi-attack-injection/injecagent/run_injecagent.py"
);
const r = spawnSync("python3", [py], { stdio: "inherit", env: process.env, cwd: root });
process.exit(r.status ?? 1);
