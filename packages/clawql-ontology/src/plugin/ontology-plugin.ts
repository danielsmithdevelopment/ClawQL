import { defineRegisteringProviderPlugin, type ProviderPlugin } from "clawql-core";
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
import { runLowKineticTransaction, type KineticAtrClaims } from "../kinetic/index.js";
import { redactOntologyPiiFields } from "../pii.js";

export const ONTOLOGY_PLUGIN_ID = "clawql-ontology";

const CONTRACT_PII = ["parties.contact_email", "parties.contact_phone"];
const ORG_PII = ["contact_email", "contact_phone"];

export type CreateOntologyPluginOptions = {
  /** Register LOW kinetic write tools (requires fixture mutators). Default false. */
  enableWrites?: boolean;
  /** ATR claims for kinetic writes; default resolves from env / permissive local. */
  atrClaims?: KineticAtrClaims | null;
};

function logOntologyTool(name: string, meta: Record<string, unknown>): void {
  if (process.env.CLAWQL_MCP_TOOL_SHAPE_LOG === "1") {
    console.debug(`[clawql-ontology] ${name}`, meta);
  }
}

async function textResult(
  payload: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function createOntologyPlugin(opts: CreateOntologyPluginOptions = {}): ProviderPlugin {
  const enableWrites = opts.enableWrites === true;
  return defineRegisteringProviderPlugin({
    id: ONTOLOGY_PLUGIN_ID,
    version: "0.1.0",
    description: "Contract and organization ontology read/write MCP tools",
    register: (api) =>
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

        if (enableWrites) {
          yield* api.registerMcpTool({
            name: "update_contract_status",
            schema: {
              id: z.string().describe("Contract identifier"),
              status: z
                .enum(["draft", "active", "expired", "terminated"])
                .describe("New contract status"),
            },
            handler: async (args) => {
              const a = args as { id?: string; status?: string };
              const id = String(a.id ?? "");
              const status = String(a.status ?? "");
              logOntologyTool("update_contract_status", { id, status });
              const result = await runLowKineticTransaction({
                tool: "update_contract_status",
                entity: "Contract",
                recordId: id,
                field: "status",
                nextValue: status,
                executor: "NATIVE",
                kineticLevel: "LOW",
                claims: opts.atrClaims,
              });
              return textResult(result);
            },
          });

          yield* api.registerMcpTool({
            name: "adjust_contract_value",
            schema: {
              id: z.string().describe("Contract identifier"),
              amount: z.number().describe("New contract value amount"),
              mandate_type: z.string().optional().describe("Mandate type (e.g. AP2_FINANCIAL)"),
              mandate_id: z.string().optional().describe("Mandate / approval id"),
            },
            handler: async (args) => {
              const a = args as {
                id?: string;
                amount?: number;
                mandate_type?: string;
                mandate_id?: string;
              };
              const id = String(a.id ?? "");
              const amount = Number(a.amount);
              logOntologyTool("adjust_contract_value", { id, amount });
              const mandate = a.mandate_id?.trim()
                ? {
                    type: a.mandate_type?.trim() || "AP2_FINANCIAL",
                    id: a.mandate_id.trim(),
                  }
                : null;
              const result = await runLowKineticTransaction({
                tool: "adjust_contract_value",
                entity: "Contract",
                recordId: id,
                field: "value.amount",
                nextValue: amount,
                executor: "NATIVE",
                kineticLevel: "MEDIUM",
                claims: opts.atrClaims,
                mandate,
                mandatePolicy: {
                  requiresMandate: true,
                  mandateType: "AP2_FINANCIAL",
                  changeLimit: 10000,
                },
              });
              return textResult(result);
            },
          });
        }
      }),
  });
}
