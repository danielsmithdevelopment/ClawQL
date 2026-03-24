# GitHub REST API

Source: [github/rest-api-description](https://github.com/github/rest-api-description) — OpenAPI descriptions for `api.github.com` (YAML and JSON; this repo uses the root `api.github.com.yaml`).

Refresh the bundled copy:

```bash
npm run fetch-provider-specs
```

The spec is very large; `search` uses the full document, and `pregenerate-graphql` may be slow or fail on some Omnigraph builds.
