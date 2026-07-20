import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import {
  getContract,
  getContractParties,
  getOrganization,
  getOrganizationContracts,
  listContractsExpiring,
  searchContracts,
  searchOrganizations,
} from "../fixture-store.js";
import { redactOntologyPiiFields } from "../pii.js";

export const ONTOLOGY_PLUGIN_ID = "clawql-ontology";

const CONTRACT_PII = ["parties.contact_email", "parties.contact_phone"];
const ORG_PII = ["contact_email", "contact_phone"];

function logOntologyTool(name: string, meta: Record<string, unknown>): void {
  if (process.env.CLAWQL_MCP_TOOL_SHAPE_LOG === "1") {
    console.debug(`[clawql-ontology] ${name}`, meta);
  }
}

async function textResult(payload: unknown): Promise<{ content: { type: "text"; text: string }[] }> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function createOntologyPlugin(): Plugin {
  return {
    id: ONTOLOGY_PLUGIN_ID,
    version: "0.1.0",
    kind: "default",
    onRegister: (api) =>
      Effect.gen(function* () {
        yield* api.registerMcpTool({
          name: "get_contract",
          schema: {
            id: z.string().describe("Contract identifier"),
          },
          handler: async (args) => {
            const id = String((args as { id?: string }).id ?? "");
            logOntologyTool("get_contract", { id });
            const row = getContract(id);
            if (!row) {
              return textResult({ error: "not_found", contract_id: id });
            }
            const redacted = await redactOntologyPiiFields(row, CONTRACT_PII);
            return textResult(redacted);
          },
        });

        yield* api.registerMcpTool({
          name: "search_contracts",
          schema: {
            query: z.string().describe("Free-text search"),
            limit: z.number().optional().describe("Max results"),
          },
          handler: async (args) => {
            const a = args as { query?: string; limit?: number };
            logOntologyTool("search_contracts", { queryLen: a.query?.length ?? 0 });
            const rows = searchContracts(a.query ?? "", a.limit ?? 20);
            const out = [];
            for (const row of rows) {
              out.push(await redactOntologyPiiFields(row, CONTRACT_PII));
            }
            return textResult(out);
          },
        });

        yield* api.registerMcpTool({
          name: "list_contracts_expiring",
          schema: {
            days: z.number().describe("Horizon in days"),
          },
          handler: async (args) => {
            const days = Number((args as { days?: number }).days ?? 90);
            logOntologyTool("list_contracts_expiring", { days });
            const rows = listContractsExpiring(days);
            const out = [];
            for (const row of rows) {
              out.push(await redactOntologyPiiFields(row, CONTRACT_PII));
            }
            return textResult(out);
          },
        });

        yield* api.registerMcpTool({
          name: "get_contract_parties",
          schema: {
            id: z.string().describe("Contract identifier"),
          },
          handler: async (args) => {
            const id = String((args as { id?: string }).id ?? "");
            logOntologyTool("get_contract_parties", { id });
            const parties = getContractParties(id);
            const out = [];
            for (const p of parties) {
              out.push(await redactOntologyPiiFields(p, ORG_PII));
            }
            return textResult(out);
          },
        });

        yield* api.registerMcpTool({
          name: "get_organization",
          schema: {
            id: z.string().describe("Organization identifier"),
          },
          handler: async (args) => {
            const id = String((args as { id?: string }).id ?? "");
            logOntologyTool("get_organization", { id });
            const row = getOrganization(id);
            if (!row) return textResult({ error: "not_found", organization_id: id });
            return textResult(await redactOntologyPiiFields(row, ORG_PII));
          },
        });

        yield* api.registerMcpTool({
          name: "search_organizations",
          schema: {
            query: z.string().describe("Free-text search"),
            limit: z.number().optional(),
          },
          handler: async (args) => {
            const a = args as { query?: string; limit?: number };
            const rows = searchOrganizations(a.query ?? "", a.limit ?? 20);
            const out = [];
            for (const row of rows) {
              out.push(await redactOntologyPiiFields(row, ORG_PII));
            }
            return textResult(out);
          },
        });

        yield* api.registerMcpTool({
          name: "get_organization_contracts",
          schema: {
            id: z.string().describe("Organization identifier"),
          },
          handler: async (args) => {
            const id = String((args as { id?: string }).id ?? "");
            const rows = getOrganizationContracts(id);
            const out = [];
            for (const row of rows) {
              out.push(await redactOntologyPiiFields(row, CONTRACT_PII));
            }
            return textResult(out);
          },
        });
      }),
  };
}
