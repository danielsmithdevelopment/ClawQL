/**
 * gRPC ListTools parity for optional plugins (schedule / notify / onyx / hitl / ouroboros).
 * Consolidates the former per-tool `grpc-*-parity.test.ts` clones.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetSpecCache } from "clawql-api";
import { resetClawqlApiForTests } from "./composition/clawql-api-adapters.js";
import { instanceSpecWith } from "./host/server-stdio-env.js";
import { resetSchemaFieldCache } from "./mcp/tools.js";
import {
  GRPC_PARITY_MINIMAL_SPEC,
  listToolNamesFromEphemeralGrpcServer,
} from "./test-utils/grpc-mcp-parity.js";

type ParityCase = {
  readonly name: string;
  readonly setup: (vault: string) => void;
  readonly expectNames: readonly string[];
};

const cases: readonly ParityCase[] = [
  {
    name: "schedule (#76)",
    setup: (vault) => {
      process.env.CLAWQL_INSTANCE_SPEC = instanceSpecWith({
        automation: { schedule: { enabled: true } },
      });
      process.env.CLAWQL_SCHEDULE_DB_PATH = join(vault, "schedule.db");
    },
    expectNames: ["schedule"],
  },
  {
    name: "notify (#140)",
    setup: () => {
      process.env.CLAWQL_INSTANCE_SPEC = instanceSpecWith({
        automation: { notify: { enabled: true } },
      });
    },
    expectNames: ["notify"],
  },
  {
    name: "onyx (#onyx)",
    setup: () => {
      process.env.CLAWQL_INSTANCE_SPEC = instanceSpecWith({
        documents: { enabled: true, onyx: { enabled: true } },
      });
    },
    expectNames: ["knowledge_search_onyx"],
  },
  {
    name: "hitl (#hitl)",
    setup: () => {
      process.env.CLAWQL_INSTANCE_SPEC = instanceSpecWith({
        automation: { hitlLabelStudio: { enabled: true } },
      });
    },
    expectNames: ["hitl_enqueue_label_studio"],
  },
  {
    name: "ouroboros (#141)",
    setup: () => {
      delete process.env.CLAWQL_ENABLE_OUROBOROS;
      delete process.env.CLAWQL_INSTANCE_SPEC;
    },
    expectNames: [
      "ouroboros_create_seed_from_document",
      "ouroboros_run_evolutionary_loop",
      "ouroboros_get_lineage_status",
      "ouroboros_measure_drift",
    ],
  },
];

describe("gRPC ListTools optional-tool parity", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
    process.env.CLAWQL_SPEC_PATH = GRPC_PARITY_MINIMAL_SPEC;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    delete process.env.CLAWQL_SCHEDULE_DB_PATH;
    resetClawqlApiForTests();
    resetSpecCache();
    resetSchemaFieldCache();
  });

  afterEach(() => {
    process.env = { ...saved };
    resetClawqlApiForTests();
    resetSpecCache();
    resetSchemaFieldCache();
  });

  it.each(cases)(
    "$name ListTools includes expected tools",
    async ({ setup, expectNames }) => {
      const vault = mkdtempSync(join(tmpdir(), "clawql-grpc-parity-"));
      process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vault;
      setup(vault);
      const names = await listToolNamesFromEphemeralGrpcServer();
      for (const tool of expectNames) {
        expect(names.has(tool), `expected ListTools to include ${tool}`).toBe(true);
      }
    },
    30_000
  );
});
