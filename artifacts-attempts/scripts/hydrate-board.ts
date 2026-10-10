#!/usr/bin/env npx tsx
/**
 * Run local demo, snapshot result.json, then POST the TaskView to the board API.
 *
 *   npm run board:serve
 *   npm run board:hydrate
 *
 * To re-post without re-running the demo: npm run board:hydrate-from
 */

import { join } from "node:path";
import { runLocalDemo } from "@artifacts-attempts/pipeline";
import { postBoardView, toBoardTaskView, writeDemoSnapshot } from "./board-view.js";

const API = process.env.ATTEMPTS_API ?? "http://127.0.0.1:8787";
const root = process.env.ATTEMPTS_LOCAL_ROOT ?? join(process.cwd(), ".local/demo-run");

const result = await runLocalDemo({
  root,
  decisionsMode: process.env.DECISIONS_MODE === "openai" ? "openai" : "calibrated",
  approveIfNeeded: true,
});

const view = toBoardTaskView(result);
const snapPath = writeDemoSnapshot(root, result, view);
const posted = await postBoardView(API, view);
console.log(
  JSON.stringify(
    {
      board: posted.board,
      task: posted.task,
      snapshot: snapPath,
      hydrateFrom: "npm run board:hydrate-from",
    },
    null,
    2
  )
);
