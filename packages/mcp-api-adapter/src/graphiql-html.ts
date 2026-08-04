/** Minimal GraphiQL shell (CDN) pointed at `/graphql`. */
export function graphiqlHtml(title: string): string {
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="https://unpkg.com/graphiql@3.7.2/graphiql.min.css" />
  <style>
    body { margin: 0; height: 100vh; }
    #graphiql { height: calc(100vh - 52px); }
    .grpc-banner {
      font-family: ui-sans-serif, system-ui, sans-serif;
      padding: 12px 20px;
      background: #0f172a;
      color: #e2e8f0;
      font-size: 14px;
      line-height: 1.45;
    }
    .grpc-banner a { color: #7dd3fc; }
    .grpc-banner code { background: #1e293b; padding: 1px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="grpc-banner">
    <strong>GraphQL on-ramp</strong> — mutations map to MCP tools; backend is
    <code>model_context_protocol.Mcp/CallTool</code> via
    <a href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-grpc-transport">mcp-grpc-transport</a>.
    Also available: OpenAPI <a href="/docs">/docs</a> · REST <code>POST /{toolName}</code>.
  </div>
  <div id="graphiql">Loading…</div>
  <script
    crossorigin
    src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"
  ></script>
  <script
    crossorigin
    src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"
  ></script>
  <script
    crossorigin
    src="https://unpkg.com/graphiql@3.7.2/graphiql.min.js"
  ></script>
  <script>
    const fetcher = GraphiQL.createFetcher({ url: "/graphql" });
    const defaultQuery = \`# MCP tools via GraphQL → gRPC CallTool
query Health {
  health { status grpcAddress toolCount surfaces }
  tools { name description }
}

mutation Echo {
  echo(message: "hello from GraphQL")
}

mutation Add {
  add(a: 20, b: 22)
}

# Generic escape hatch:
# mutation { callTool(name: "greet", args: { name: "GraphQL", shout: true }) }
\`;
    ReactDOM.createRoot(document.getElementById("graphiql")).render(
      React.createElement(GraphiQL, { fetcher, defaultQuery })
    );
  </script>
</body>
</html>`;
}
