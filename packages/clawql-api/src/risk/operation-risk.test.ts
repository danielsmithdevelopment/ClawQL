import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { bootProcessWormFromEnvEffect, resetProcessWormForTests } from "clawql-audit";
import type { Operation } from "../spec/operation-types.js";
import { classifyOperationRisk } from "./classify-operation-risk.js";
import { formatSearchResults } from "../spec/spec-search.js";
import { executeClawqlOperationEffect } from "../execute/execute-core.js";
import {
  OperationRiskLive,
  OperationRiskService,
  applyOperationRiskToLoadedOps,
} from "./operation-risk-service.js";

function baseOp(partial: Partial<Operation> & Pick<Operation, "id" | "method">): Operation {
  return {
    path: "/x",
    flatPath: "x",
    description: "test",
    resource: "x",
    parameters: {},
    scopes: [],
    ...partial,
  };
}

describe("classifyOperationRisk defaults by source kind", () => {
  it("OpenAPI: GET allow, POST mandate, DELETE block, unknown mandate", () => {
    const trusted = new Set<string>();
    expect(
      classifyOperationRisk({
        operation: baseOp({ id: "getThing", method: "GET", protocolKind: "openapi" }),
        trustedMcpSourceIds: trusted,
      }).policy
    ).toBe("allow");
    expect(
      classifyOperationRisk({
        operation: baseOp({ id: "create", method: "POST", protocolKind: "openapi" }),
        trustedMcpSourceIds: trusted,
      }).policy
    ).toBe("mandate");
    expect(
      classifyOperationRisk({
        operation: baseOp({ id: "del", method: "DELETE", protocolKind: "openapi" }),
        trustedMcpSourceIds: trusted,
      }).policy
    ).toBe("block");
    expect(
      classifyOperationRisk({
        operation: baseOp({ id: "weird", method: "PROPFIND", protocolKind: "openapi" }),
        trustedMcpSourceIds: trusted,
      })
    ).toMatchObject({ policy: "mandate", source: "unknown-default" });
  });

  it("GraphQL: QUERY allow, MUTATION mandate", () => {
    const trusted = new Set<string>();
    expect(
      classifyOperationRisk({
        operation: baseOp({
          id: "gq",
          method: "QUERY",
          protocolKind: "graphql",
          nativeGraphQL: { sourceLabel: "g", operationType: "query", fieldName: "viewer" },
        }),
        trustedMcpSourceIds: trusted,
      }).policy
    ).toBe("allow");
    expect(
      classifyOperationRisk({
        operation: baseOp({
          id: "gm",
          method: "MUTATION",
          protocolKind: "graphql",
          nativeGraphQL: { sourceLabel: "g", operationType: "mutation", fieldName: "create" },
        }),
        trustedMcpSourceIds: trusted,
      }).policy
    ).toBe("mandate");
  });

  it("gRPC: NO_SIDE_EFFECTS allow, otherwise mandate", () => {
    const trusted = new Set<string>();
    expect(
      classifyOperationRisk({
        operation: baseOp({
          id: "grpc-ro",
          method: "GRPC",
          protocolKind: "grpc",
          riskHints: { grpcNoSideEffects: true },
          nativeGrpc: { sourceLabel: "s", clientKey: "k", rpcName: "Get" },
        }),
        trustedMcpSourceIds: trusted,
      }).policy
    ).toBe("allow");
    expect(
      classifyOperationRisk({
        operation: baseOp({
          id: "grpc-w",
          method: "GRPC",
          protocolKind: "grpc",
          nativeGrpc: { sourceLabel: "s", clientKey: "k", rpcName: "Update" },
        }),
        trustedMcpSourceIds: trusted,
      })
    ).toMatchObject({ policy: "mandate", source: "unknown-default" });
  });

  it("MCP: trusted honors annotations; untrusted ignores them → mandate", () => {
    const trusted = new Set(["safe-server"]);
    const readOnlyOp = baseOp({
      id: "mcp-ro",
      method: "MCP",
      protocolKind: "mcp",
      riskHints: {
        mcpSourceId: "evil-server",
        mcpReadOnlyHint: true,
        mcpDestructiveHint: false,
      },
      nativeMcp: { sourceId: "evil-server", toolName: "delete_all" },
    });
    expect(
      classifyOperationRisk({ operation: readOnlyOp, trustedMcpSourceIds: trusted })
    ).toMatchObject({ policy: "mandate", source: "unknown-default" });

    const trustedRo = baseOp({
      id: "mcp-trusted-ro",
      method: "MCP",
      protocolKind: "mcp",
      riskHints: { mcpSourceId: "safe-server", mcpReadOnlyHint: true },
      nativeMcp: { sourceId: "safe-server", toolName: "list" },
    });
    expect(
      classifyOperationRisk({ operation: trustedRo, trustedMcpSourceIds: trusted })
    ).toMatchObject({ policy: "allow", source: "mcp-annotation" });

    const trustedDest = baseOp({
      id: "mcp-trusted-dest",
      method: "MCP",
      protocolKind: "mcp",
      riskHints: { mcpSourceId: "safe-server", mcpDestructiveHint: true },
      nativeMcp: { sourceId: "safe-server", toolName: "wipe" },
    });
    expect(
      classifyOperationRisk({ operation: trustedDest, trustedMcpSourceIds: trusted })
    ).toMatchObject({ policy: "block", source: "mcp-annotation" });
  });
});

describe("operation-risk overrides + WORM", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_SESSION_ID;
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_MCP_TRUSTED_SOURCES;
  });

  it("applies override and appends OPERATION_RISK_OVERRIDE to WORM", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-risk-"));
    process.env.CLAWQL_HOME = home;
    await writeFile(
      join(home, "operation-risk.json"),
      JSON.stringify({
        version: 1,
        overrides: {
          searchIssues: {
            policy: "allow",
            level: "LOW",
            reason: "POST search endpoint is read-only",
          },
        },
      }),
      "utf8"
    );

    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_SESSION_ID = "risk-test";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";
    const trail = await Effect.runPromise(bootProcessWormFromEnvEffect());
    expect(trail).not.toBeNull();

    const ops = await applyOperationRiskToLoadedOps(
      [
        baseOp({
          id: "searchIssues",
          method: "POST",
          protocolKind: "openapi",
        }),
      ],
      { home, wormLogOverrides: true }
    );

    expect(ops[0]?.risk).toMatchObject({
      policy: "allow",
      level: "LOW",
      source: "override",
      reason: "POST search endpoint is read-only",
    });

    const entries = await Effect.runPromise(trail!.query({}));
    const overrideEntry = entries.find((e) => e.type === "OPERATION_RISK_OVERRIDE");
    expect(overrideEntry).toBeDefined();
    expect(overrideEntry?.metadata).toMatchObject({
      operationId: "searchIssues",
      policy: "allow",
      previousPolicy: "mandate",
    });
  });
});

describe("search + execute surfaces", () => {
  it("search results include risk", () => {
    const text = formatSearchResults([
      {
        kind: "operation",
        operation: {
          ...baseOp({
            id: "list",
            method: "GET",
            protocolKind: "openapi",
            risk: {
              level: "LOW",
              policy: "allow",
              source: "spec-default",
              reason: "HTTP GET",
            },
          }),
        },
        score: 1,
        matchedOn: ["id"],
      },
    ]);
    const parsed = JSON.parse(text) as {
      results: Array<{ risk?: { policy: string } }>;
    };
    expect(parsed.results[0]?.risk?.policy).toBe("allow");
  });

  it("execute refuses mandate and block with risk in the body", async () => {
    const mandateOp = baseOp({
      id: "writeThing",
      method: "POST",
      protocolKind: "openapi",
      risk: {
        level: "MEDIUM",
        policy: "mandate",
        source: "spec-default",
        reason: "HTTP POST",
      },
    });
    const blockOp = baseOp({
      id: "deleteThing",
      method: "DELETE",
      protocolKind: "openapi",
      risk: {
        level: "HIGH",
        policy: "block",
        source: "spec-default",
        reason: "HTTP DELETE",
      },
    });

    const loadSpecFn = async () =>
      ({
        operations: [mandateOp, blockOp],
        openapi: { openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {} },
        multi: false,
      }) as Awaited<ReturnType<typeof import("../spec/spec-loader.js").loadSpec>>;

    const mandateBody = await Effect.runPromise(
      executeClawqlOperationEffect({ operationId: "writeThing", args: {} }, loadSpecFn)
    );
    const mandateJson = JSON.parse(mandateBody[0]!.text) as {
      status: string;
      risk: { policy: string };
    };
    expect(mandateJson.status).toBe("mandate_required");
    expect(mandateJson.risk.policy).toBe("mandate");

    const blockBody = await Effect.runPromise(
      executeClawqlOperationEffect({ operationId: "deleteThing", args: {} }, loadSpecFn)
    );
    const blockJson = JSON.parse(blockBody[0]!.text) as {
      status: string;
      risk: { policy: string };
    };
    expect(blockJson.status).toBe("blocked");
    expect(blockJson.risk.policy).toBe("block");
  });
});

describe("OperationRiskService Tag", () => {
  it("loads empty config when file missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-risk-empty-"));
    process.env.CLAWQL_HOME = home;
    const cfg = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* OperationRiskService;
        return yield* svc.loadConfig();
      }).pipe(Effect.provide(OperationRiskLive))
    );
    expect(cfg.version).toBe(1);
    expect(cfg.overrides ?? {}).toEqual({});
    delete process.env.CLAWQL_HOME;
  });
});

describe("unclassifiable defaults to mandate", () => {
  it("CLI and empty method → mandate", () => {
    expect(
      classifyOperationRisk({
        operation: baseOp({ id: "cli-run", method: "CLI", protocolKind: "cli" }),
        trustedMcpSourceIds: new Set(),
      })
    ).toMatchObject({ policy: "mandate", source: "unknown-default" });
  });
});
