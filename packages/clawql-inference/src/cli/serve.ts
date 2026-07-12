import { createInferenceGateway } from "../gateway.js";
import { runInferenceHttpServer } from "../api/server.js";

export type InferenceServeOptions = {
  port?: number;
  host?: string;
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceServe(options: InferenceServeOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const gateway = createInferenceGateway({ env });
  const { port, host } = await runInferenceHttpServer({
    gateway,
    env,
    port: options.port,
    host: options.host,
  });
  console.log(`clawql-inference listening on http://${host}:${port}`);
  console.log("  GET  /healthz");
  console.log("  GET  /v1/models");
  console.log("  POST /v1/chat/completions  (OpenAI-compatible; supports stream: true)");
  return 0;
}
