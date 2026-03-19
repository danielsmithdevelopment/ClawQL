declare module "openapi-to-graphql" {
  import type { GraphQLSchema } from "graphql";

  export interface OasGraphReport {
    warnings: Array<unknown>;
  }

  export interface OasGraphResult {
    schema: GraphQLSchema;
    report: OasGraphReport;
  }

  export function createGraphQLSchema(
    spec: unknown,
    options?: Record<string, unknown>
  ): Promise<OasGraphResult>;
}
