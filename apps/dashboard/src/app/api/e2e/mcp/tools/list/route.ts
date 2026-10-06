import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { MCP_TOOLS } from "@/lib/managed/fixtures-ops";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
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
      const tools = MCP_TOOLS.map((name) => ({
        name,
        description: `ClawQL tool ${name}`,
      }));
      // Approvals are never an agent tool (GW-08 / GW-10)
      return NextResponse.json({
        tools,
        clientExtras: { approvalForms: false },
      });
    }),
  );
}
