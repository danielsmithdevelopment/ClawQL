#!/usr/bin/env node
import { runOperator } from "./controller/run-operator.js";

const args = process.argv.slice(2);
const once = args.includes("--once");
const namespaceArg = args.find((a) => a.startsWith("--namespace="));
const instanceArg = args.find((a) => a.startsWith("--instance="));

runOperator({
  once,
  namespace: namespaceArg?.split("=", 2)[1],
  instanceName: instanceArg?.split("=", 2)[1],
}).catch((err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
