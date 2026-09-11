import { getSandbox, type Sandbox } from "@cloudflare/sandbox";

export { Sandbox } from "@cloudflare/sandbox";

type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  BRIDGE_SECRET: string;
};

function resolveSandboxId(
  mode: "ephemeral" | "session" | "persistent",
  sessionId: string | undefined
): string {
  if (mode === "ephemeral") {
    return `ephemeral-${crypto.randomUUID()}`;
  }
  if (mode === "persistent") {
    return "clawql-persistent";
  }
  const sid = sessionId?.trim() || "default";
  return `session-${sid}`;
}

function buildPaths(
  language: "python" | "javascript" | "shell",
  workspace: string
): { rel: string; cmd: string } {
  switch (language) {
    case "python":
      return { rel: "clawql_snippet.py", cmd: `python3 ${workspace}/clawql_snippet.py` };
    case "javascript":
      return { rel: "clawql_snippet.mjs", cmd: `node ${workspace}/clawql_snippet.mjs` };
    case "shell":
      return { rel: "clawql_snippet.sh", cmd: `sh ${workspace}/clawql_snippet.sh` };
    default:
      throw new Error(`unsupported language: ${language}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/exec") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const auth = request.headers.get("Authorization") ?? "";
    const expected = `Bearer ${env.BRIDGE_SECRET}`;
    if (!env.BRIDGE_SECRET || auth !== expected) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
      code?: string;
      language?: "python" | "javascript" | "shell";
      sessionId?: string;
      persistenceMode?: "ephemeral" | "session" | "persistent";
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.code || typeof body.code !== "string") {
      return Response.json({ error: "Missing code" }, { status: 400 });
    }
    const language = body.language ?? "python";
    if (language !== "python" && language !== "javascript" && language !== "shell") {
      return Response.json({ error: "Invalid language" }, { status: 400 });
    }

    const persistenceMode = body.persistenceMode ?? "session";
    if (
      persistenceMode !== "ephemeral" &&
      persistenceMode !== "session" &&
      persistenceMode !== "persistent"
    ) {
      return Response.json({ error: "Invalid persistenceMode" }, { status: 400 });
    }

    const sandboxId = resolveSandboxId(persistenceMode, body.sessionId);
    const sandbox = getSandbox(env.Sandbox, sandboxId);
    const workspace = "/workspace";
    const { rel, cmd } = buildPaths(language, workspace);
    const path = `${workspace}/${rel}`;
    await sandbox.writeFile(path, body.code);
    const result = await sandbox.exec(cmd);

    return Response.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      success: result.success,
      sandboxId,
    });
  },
};
