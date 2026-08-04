/** Minimal Swagger UI shell (CDN) pointed at `/openapi.json`. */
export function swaggerDocsHtml(title: string): string {
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
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
    <strong>OpenAPI on-ramp</strong> — call MCP tools by name over HTTP.
    Also: GraphQL <a href="/graphiql">/graphiql</a>.
    Production / mesh / large payloads: prefer
    <code>model_context_protocol.Mcp/CallTool</code> via
    <a href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-grpc-transport">mcp-grpc-transport</a>
    (see <code>info.x-clawql-grpc</code> in the OpenAPI document).

  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: "BaseLayout"
    });
  </script>
</body>
</html>`;
}
