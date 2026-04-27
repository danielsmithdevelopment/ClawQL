# Paperless Provider Onboarding

This guide explains how to onboard Paperless-ngx for ClawQL `execute` calls, including how to create an API token and validate authentication.

## Prerequisites

- Running Paperless-ngx instance reachable by ClawQL.
- A Paperless user account with API access.
- ClawQL configured to load the `paperless` provider (for example `CLAWQL_PROVIDER=all-providers`).

## 1) Get a Paperless API Token

Paperless-ngx supports token auth with this header format:

`Authorization: Token <your-token>`

You can create the token in either way:

### Option A: Paperless UI (recommended)

1. Sign in to Paperless web UI.
2. Open your user menu and go to **My Profile**.
3. Use the token regenerate/create button (circular arrow icon).
4. Copy the token.

### Option B: Token endpoint

Request a token from Paperless directly:

```bash
curl -s -X POST "http://YOUR_PAPERLESS_HOST:8000/api/token/" \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USER","password":"YOUR_PASSWORD"}'
```

Expected response includes:

```json
{"token":"..."}
```

## 2) Configure ClawQL Auth

Use one of these patterns:

### Per-provider auth (preferred for merged providers)

```bash
export CLAWQL_PROVIDER_AUTH_JSON='{
  "paperless": "YOUR_PAPERLESS_API_TOKEN"
}'
```

### Direct Paperless env var

```bash
export PAPERLESS_API_TOKEN="YOUR_PAPERLESS_API_TOKEN"
```

## 3) Configure Paperless Base URL for Spec Refresh

If you want to refresh the bundled Paperless spec from your instance:

```bash
export PAPERLESS_BASE_URL="http://YOUR_PAPERLESS_HOST:8000"
npm run fetch-provider-specs
```

This refreshes `providers/paperless/openapi.yaml` from `/api/schema/`.

## 4) Validate Connectivity

First discover Paperless operations:

```json
{"tool":"search","arguments":{"query":"paperless documents list","limit":5}}
```

Then execute a simple read call:

```json
{
  "tool":"execute",
  "arguments":{
    "operationId":"paperless_api_documents_list",
    "args":{"page_size":5}
  }
}
```

If auth is wrong or missing, Paperless typically returns:

`401 {"detail":"Authentication credentials were not provided."}`

## 5) Ingestion Expectation

Current bundled Paperless provider in this repo is a minimal read-focused subset (`status`, `documents`, `tags`, `correspondents`).

If you need direct document upload/ingest operations through ClawQL `execute`, refresh or extend `providers/paperless/openapi.yaml` to include the relevant Paperless upload endpoints from your instance schema.

## References

- [Paperless-ngx REST API docs](https://docs.paperless-ngx.com/api/)
- [Paperless-ngx administration docs](https://docs.paperless-ngx.com/administration/)
