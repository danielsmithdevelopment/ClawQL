# n8n Public API

n8n exposes a Public REST API under `/api/v1`. A live instance serves the **bundled** OpenAPI document embedded in the Swagger UI script at `GET /api/v1/docs/swagger-ui-init.js`, not as a standalone `openapi.json` path.

Refresh the bundled copy from a running n8n (public API enabled):

```bash
N8N_BASE_URL=http://127.0.0.1:5678 npm run fetch-n8n-openapi
```

See [n8n API docs](https://docs.n8n.io/api/) and [disable public API](https://docs.n8n.io/hosting/securing/disable-public-api).
