import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { MCP_TOOLS } from "@/lib/managed/fixtures-ops";

/** POST /mcp/tools/list — MCP tools/list surface. */
export function postMcpToolsList(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const key = yield* h.keyByBearer(req.headers.get("authorization"));
    if (!key || key.revoked) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!key.canUse.includes("tools")) {
      return NextResponse.json({ error: "key cannot use tools" }, { status: 403 });
    }
    const client = req.headers.get("x-clawql-client") ?? "cursor";
    const tools = MCP_TOOLS.map((name) => ({
      name,
      description: `ClawQL tool ${name}`,
    }));
    const extras =
      client === "chatgpt"
        ? [
            { name: "approval_form", description: "Present an approval form (ChatGPT only)" },
            { name: "evidence_view", description: "Evidence view (ChatGPT only)" },
          ]
        : [];
    // Approvals are never an agent tool on Cursor (GW-08 / GW-10)
    return NextResponse.json({
      tools: [...tools, ...extras],
      client,
      clientExtras: { approvalForms: client === "chatgpt", evidenceViews: client === "chatgpt" },
    });
  });
}
