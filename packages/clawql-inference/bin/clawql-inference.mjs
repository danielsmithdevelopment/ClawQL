#!/usr/bin/env node
/**
 * Standalone OpenAI-compatible inference gateway.
 * Drop-in: OPENAI_BASE_URL=http://127.0.0.1:8080/v1
 */
import { runInferenceServe } from "../dist/index.js";

const port = process.env.CLAWQL_INFERENCE_PORT?.trim()
  ? Number.parseInt(process.env.CLAWQL_INFERENCE_PORT, 10)
  : undefined;

process.exitCode = await runInferenceServe({ port });
