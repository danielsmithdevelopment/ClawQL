/**
 * graphql-client.ts
 *
 * Thin client that sends GraphQL queries to the local proxy server.
 *
 * MCP tool handlers call this instead of hitting the Cloud Run REST API
 * directly, so they can request only the fields they need and return a
 * lean, context-window-friendly response to the agent.
 *
 * Usage:
 *   const client = createGraphQLClient();
 *   const data = await client.query<ListServicesResult>(`
 *     query ListServices($parent: String!) {
 *       v2ProjectsLocationsServicesList(parent: $parent) {
 *         services { name uri latestReadyRevision }
 *       }
 *     }
 *   `, { parent: "projects/my-project/locations/us-central1" });
 */

import fetch from "node-fetch";

const GRAPHQL_URL =
  process.env.GRAPHQL_URL ?? "http://localhost:4000/graphql";

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown; path?: unknown }>;
}

export function createGraphQLClient() {
  async function query<T = unknown>(
    gqlQuery: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: gqlQuery, variables }),
    });

    if (!res.ok) {
      throw new Error(
        `GraphQL proxy returned HTTP ${res.status}: ${await res.text()}`
      );
    }

    const json = (await res.json()) as GraphQLResponse<T>;

    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map((e) => e.message).join("; ");
      throw new Error(`GraphQL errors: ${messages}`);
    }

    if (json.data === undefined) {
      throw new Error("GraphQL response contained no data.");
    }

    return json.data;
  }

  async function mutate<T = unknown>(
    mutation: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    // Mutations and queries use the same HTTP transport in GraphQL
    return query<T>(mutation, variables);
  }

  return { query, mutate };
}

export type GraphQLClient = ReturnType<typeof createGraphQLClient>;