/**
 * Root-field introspection against a schema built from OpenAPI (same subset as remote proxy).
 */

import { execute, parse } from "graphql";
import { buildGraphQLSchema } from "./graphql-schema-builder.js";

const INTROSPECTION_DOC = `
  query IntrospectRootFields {
    __schema {
      queryType { fields { name args { name } } }
      mutationType { fields { name args { name } } }
    }
  }
`;

export type GraphQLFieldInfo = { name: string; args: string[] };

export async function introspectRootFieldsFromOpenApi(
  openapi: object,
  baseUrl: string
): Promise<{
  query: GraphQLFieldInfo[];
  mutation: GraphQLFieldInfo[];
}> {
  const { schema } = await buildGraphQLSchema(openapi, baseUrl);
  const result = await execute({
    schema,
    document: parse(INTROSPECTION_DOC),
    contextValue: {},
  });
  if (result.errors?.length) {
    const msg = result.errors.map((e) => e.message).join("; ");
    throw new Error(`In-process GraphQL introspection failed: ${msg}`);
  }
  const data = result.data as {
    __schema: {
      queryType: {
        fields: Array<{ name: string; args: Array<{ name: string }> }>;
      };
      mutationType: {
        fields: Array<{ name: string; args: Array<{ name: string }> }>;
      } | null;
    };
  };
  return {
    query: data.__schema.queryType.fields.map((f) => ({
      name: f.name,
      args: f.args.map((a) => a.name),
    })),
    mutation: (data.__schema.mutationType?.fields ?? []).map((f) => ({
      name: f.name,
      args: f.args.map((a) => a.name),
    })),
  };
}
