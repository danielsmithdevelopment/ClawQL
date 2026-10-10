#!/usr/bin/env npx tsx
/**
 * POST an existing demo snapshot to the board (no pipeline re-run).
 * Use after demo:local / board:hydrate / judge-smoke for the video board scene.
 *
 *   npm run board:serve
 *   ATTEMPTS_LOCAL_ROOT=.local/demo-run npm run board:hydrate-from
 */

import { join } from "node:path";
import { postBoardView, readDemoSnapshot } from "./board-view.js";

const API = process.env.ATTEMPTS_API ?? "http://127.0.0.1:8787";
const root = process.env.ATTEMPTS_LOCAL_ROOT ?? join(process.cwd(), ".local/demo-run");

const snap = readDemoSnapshot(root);
const posted = await postBoardView(API, snap.view);
console.log(
  JSON.stringify(
    {
      board: posted.board,
      task: posted.task,
      from: join(root, "result.json"),
      writtenAt: snap.writtenAt,
      canaryPercent: snap.view.canary.canaryPercent,
    },
    null,
    2
  )
);
