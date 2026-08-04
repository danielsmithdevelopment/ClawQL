import type { Express, Request, Response } from "express";
import { graphql, printSchema } from "graphql";
import { graphiqlHtml } from "./graphiql-html.js";
import { buildGraphqlSchemaFromCatalog } from "./graphql-schema.js";
import type { CallToolFn, ToolCatalog } from "./types.js";

export type AttachGraphqlOptions = {
  callTool: CallToolFn;
  getCatalog: () => ToolCatalog;
  title?: string;
  grpcAddress?: string;
};

export function attachGraphqlRoutes(app: Express, options: AttachGraphqlOptions): void {
  const buildSchema = () =>
    buildGraphqlSchemaFromCatalog(options.getCatalog(), {
      callTool: options.callTool,
      getCatalog: options.getCatalog,
      grpcAddress: options.grpcAddress,
    });

  app.get("/graphql/schema.graphql", (_req, res) => {
    res.type("text/plain").send(printSchema(buildSchema()));
  });

  app.get("/graphiql", (_req, res) => {
    res.type("html").send(graphiqlHtml(options.title ?? "MCP GraphQL Gateway"));
  });

  app.get("/graphql", (req, res) => {
    const accept = req.get("accept") ?? "";
    if (accept.includes("text/html") && !req.query.query) {
      res.type("html").send(graphiqlHtml(options.title ?? "MCP GraphQL Gateway"));
      return;
    }
    void runGraphql(req, res, buildSchema, {
      query: typeof req.query.query === "string" ? req.query.query : undefined,
      variables: parseVars(req.query.variables),
      operationName:
        typeof req.query.operationName === "string" ? req.query.operationName : undefined,
    });
  });

  app.post("/graphql", (req, res) => {
    const body = (req.body ?? {}) as {
      query?: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    };
    void runGraphql(req, res, buildSchema, body);
  });
}

function parseVars(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function runGraphql(
  _req: Request,
  res: Response,
  buildSchema: () => ReturnType<typeof buildGraphqlSchemaFromCatalog>,
  input: {
    query?: string;
    variables?: Record<string, unknown>;
    operationName?: string;
  }
): Promise<void> {
  if (!input.query || typeof input.query !== "string") {
    res.status(400).json({ errors: [{ message: "Must provide query string." }] });
    return;
  }
  try {
    const result = await graphql({
      schema: buildSchema(),
      source: input.query,
      variableValues: input.variables,
      operationName: input.operationName,
    });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ errors: [{ message }] });
  }
}
