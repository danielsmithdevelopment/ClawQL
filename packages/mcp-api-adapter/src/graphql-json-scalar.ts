import { GraphQLScalarType, Kind, type ValueNode } from "graphql";

function parseJsonLiteral(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return ast.values.map((v) => parseJsonLiteral(v));
    case Kind.OBJECT: {
      const out: Record<string, unknown> = {};
      for (const field of ast.fields) {
        out[field.name.value] = parseJsonLiteral(field.value);
      }
      return out;
    }
    default:
      return null;
  }
}

/** Arbitrary JSON values for MCP tool args/results. */
export const GraphQLJSON = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value (MCP tool arguments / results)",
  serialize(value: unknown): unknown {
    return value;
  },
  parseValue(value: unknown): unknown {
    return value;
  },
  parseLiteral(ast: ValueNode): unknown {
    return parseJsonLiteral(ast);
  },
});

