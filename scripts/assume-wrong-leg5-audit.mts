import { Effect, Layer } from "effect";
import { writeFileSync, readFileSync } from "node:fs";

type Finding = { id: string; severity: "FAIL" | "WARN" | "OK"; msg: string };
const findings: Finding[] = [];
const fail = (id: string, msg: string) => findings.push({ id, severity: "FAIL", msg });
const warn = (id: string, msg: string) => findings.push({ id, severity: "WARN", msg });
const ok = (id: string, msg: string) => findings.push({ id, severity: "OK", msg });

const { createGlinerFastDecisionScorerLayer, FastDecisionScorer, HeuristicFastDecisionScorerLive } =
  await import("../packages/clawql-core/src/classifier/scorer.js");
const { runHeldOutValidationSuite, defaultHeldOutSuite } = await import(
  "../packages/clawql-core/src/classifier/held-out/index.js"
);
const { SessionCatalogService, WormAuditSink } = await import("../packages/clawql-core/src/index.js");
const {
  defaultCapabilityRegisterWiring,
  reportHarnessToolRegistration,
  capabilityRegisterInterceptEnabled,
} = await import("../packages/clawql-harness/src/capability-register-wiring.js");
const { registerHarnessPlugins, makeHarnessWormLayer } = await import(
  "../packages/clawql-harness/src/registry.js"
);
const { OuroborosPlugin } = await import("../packages/clawql-harness/plugins/ouroboros/index.js");
const {
  getCapabilityLifecycleRuntime,
  resetCapabilityLifecycleRuntimeForTests,
} = await import("clawql-api");

// 1. GLiNER backendId on HTTP failure
{
  const layer = createGlinerFastDecisionScorerLayer({
    config: { endpointUrl: "http://gliner.fake", modelId: "m", timeoutMs: 500 },
    fetchImpl: (async () => new Response("nope", { status: 503 })) as typeof fetch,
  });
  const backendId = await Effect.runPromise(
    Effect.gen(function* () {
      const s = yield* FastDecisionScorer;
      yield* s.score({
        useSiteId: "skill_fast_path_match",
        ctx: { sessionId: "x", query: "extract springing lien" },
        candidates: [
          { candidateId: "a", features: { description: "extract springing lien" } },
          { candidateId: "b", features: { description: "slack" } },
        ],
      });
      return s.backendId();
    }).pipe(Effect.provide(layer))
  );
  if (backendId === "gliner2") fail("GLINER_BACKEND_ID_LIE", `still gliner2 after 503`);
  else if (backendId === "gliner2-http-fallback-heuristic")
    ok("GLINER_BACKEND_ID_LIE", backendId);
  else warn("GLINER_BACKEND_ID_LIE", `unexpected ${backendId}`);
}

// 2. held-out
{
  const reports = await Effect.runPromise(
    runHeldOutValidationSuite(defaultHeldOutSuite()).pipe(
      Effect.provide(HeuristicFastDecisionScorerLive)
    )
  );
  if (reports.some((r) => r.productionTrusted)) fail("HELD_OUT_TRUST", "synthetic trusted");
  else ok("HELD_OUT_TRUST", `untrusted on ${reports.length} sites`);
}

// 3. catalog share
{
  resetCapabilityLifecycleRuntimeForTests();
  const runtime = getCapabilityLifecycleRuntime();
  const mcpLayer = Layer.mergeAll(
    runtime.catalogLayer,
    Layer.succeed(WormAuditSink, { append: () => Effect.void })
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const c = yield* SessionCatalogService;
      yield* c.bind({
        sessionId: "shared-s",
        tools: new Set(["search"]),
        atrScope: new Set(["search"]),
        boundAt: new Date().toISOString(),
        rebindGeneration: 0,
      });
    }).pipe(Effect.provide(mcpLayer))
  );
  const harnessWiring = defaultCapabilityRegisterWiring();
  const result = reportHarnessToolRegistration({
    wiring: harnessWiring,
    sessionId: "shared-s",
    tool: { name: "search", description: "search", handler: () => Effect.succeed(null) },
  });
  if (result.accepted) ok("REGISTER_CATALOG_FORK", "shared catalog accepts search");
  else fail("REGISTER_CATALOG_FORK", `still forked allow=${result.outcome.allow}`);
}

// 4. MCP env alone must not enable harness register
{
  const prev = process.env.CLAWQL_CAPABILITY_LIFECYCLE;
  const prevH = process.env.CLAWQL_HARNESS_CAPABILITY_REGISTER;
  process.env.CLAWQL_CAPABILITY_LIFECYCLE = "1";
  delete process.env.CLAWQL_HARNESS_CAPABILITY_REGISTER;
  try {
    if (capabilityRegisterInterceptEnabled()) {
      fail("ENV_COUPLING", "CLAWQL_CAPABILITY_LIFECYCLE alone enabled harness register");
    } else ok("ENV_COUPLING", "MCP env does not enable harness register");

    const state = await Effect.runPromise(
      registerHarnessPlugins({
        plugins: [OuroborosPlugin],
        model: { provider: "stub", name: "t" },
        sessionId: "life-1",
      }).pipe(Effect.provide(makeHarnessWormLayer()))
    );
    if (state.tools.has("clawql_think") && state.blockedRegistrations.size === 0) {
      ok("ENV_ENABLE_BREAKS_OUROBOROS", "ouroboros tools still live under MCP env alone");
    } else {
      fail(
        "ENV_ENABLE_BREAKS_OUROBOROS",
        `tools=${state.tools.size} blocked=${state.blockedRegistrations.size}`
      );
    }
  } finally {
    if (prev === undefined) delete process.env.CLAWQL_CAPABILITY_LIFECYCLE;
    else process.env.CLAWQL_CAPABILITY_LIFECYCLE = prev;
    if (prevH === undefined) delete process.env.CLAWQL_HARNESS_CAPABILITY_REGISTER;
    else process.env.CLAWQL_HARNESS_CAPABILITY_REGISTER = prevH;
  }
}

// 5. burst helpers still pure (honest non-controller)
{
  const readme = readFileSync("./packages/clawql-k8s-operator/README.md", "utf8");
  if (/Not a shipped controller/.test(readme) && /Not yet implemented/.test(readme)) {
    ok("BURST_HONESTY", "operator README still admits scaffold");
  } else warn("BURST_HONESTY", "README may overclaim");
}

writeFileSync("/opt/cursor/artifacts/assume-wrong-audit.json", JSON.stringify(findings, null, 2));
console.log(JSON.stringify(findings, null, 2));
if (findings.some((f) => f.severity === "FAIL")) process.exit(1);
