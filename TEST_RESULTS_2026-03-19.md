# Cloud Run MCP + GraphQL Test Results (2026-03-19)

## Scope

Validated the current end-to-end flow:

1. GraphQL proxy startup + health.
2. Parsed-spec operation lookup.
3. Live GraphQL execution against Cloud Run list services endpoint.

## Environment

- Workspace: `ClawQL`
- Date: 2026-03-19
- Runtime used:
  - GraphQL proxy: `bun run graphql`
  - MCP server: `node --import tsx src/server.ts`

## 1) GraphQL proxy health

Command:

```bash
curl -sS http://localhost:4000/health
```

Result:

```json
{"status":"ok","endpoint":"http://localhost:4000/graphql"}
```

## 2) Parsed spec lookup (Cloud Run docs search)

Test query:

- `lookup docs for get IAM policy for Cloud Run jobs`

Top operation matches returned from parsed spec (`54` total ops loaded):

1. `run.projects.locations.jobs.getIamPolicy` (`GET`)
2. `run.projects.locations.services.getIamPolicy` (`GET`)
3. `run.projects.locations.workerPools.getIamPolicy` (`GET`)
4. `run.projects.locations.jobs.setIamPolicy` (`POST`)
5. `run.projects.locations.services.setIamPolicy` (`POST`)

Conclusion: parsed-spec search is returning relevant Cloud Run API operations.

## 3) Live GraphQL execution test (`list services`)

### 3.1 Initial query using expected helper name (failed)

Query field attempted:

- `v2ProjectsLocationsServicesList`

Result:

```json
{
  "errors": [
    {
      "message": "Cannot query field \"v2ProjectsLocationsServicesList\" on type \"Query\". Did you mean \"runProjectsLocationsServicesGetIamPolicy\"?"
    }
  ]
}
```

### 3.2 Introspection of service-related query fields

Returned fields included:

- `googleCloudRunV2ListServicesResponse`
- `runProjectsLocationsServicesGetIamPolicy`
- `runProjectsLocationsServicesRevisionsExportStatus`

### 3.3 Query with discovered field and corrected arguments

Working field shape required:

- `googleCloudRunV2ListServicesResponse(projectsId: String!, locationsId: String!, pageSize: Int)`

Execution result:

```json
{
  "errors": [
    {
      "message": "Could not invoke operation GET /v2/projects/{projectsId}/locations/{locationsId}/services",
      "extensions": {
        "statusCode": 401,
        "statusText": "Unauthorized",
        "responseBody": {
          "error": {
            "status": "UNAUTHENTICATED",
            "message": "Request is missing required authentication credential..."
          }
        }
      }
    }
  ],
  "data": {
    "googleCloudRunV2ListServicesResponse": null
  }
}
```

Conclusion: GraphQL pipeline is executing through to Cloud Run, and failure is now credential-related (`401`) rather than schema/build/runtime.

## Notes / Follow-up

- To get successful data responses, provide valid Google API credentials.
- The generated GraphQL query name for list services currently differs from the helper assumption in `tools.ts`.
  - Current schema exposes `googleCloudRunV2ListServicesResponse` (not `v2ProjectsLocationsServicesList`).
  - If desired, update query-name resolution logic to map directly from introspected schema names or from OASGraph report metadata.

## 4) Re-test after `tools.ts` fix

Implemented in `execute()`:

- Dynamic GraphQL field resolution via one-time schema introspection cache.
- Candidate matching order:
  1. run-style from operationId (`runProjectsLocations...`)
  2. legacy flatPath-derived name (`v2ProjectsLocations...`)
  3. response schema-derived fallback (`googleCloudRunV2...Response`)
- Argument normalization:
  - expands `parent=projects/{project}/locations/{location}` into `projectsId` + `locationsId` when required.
  - keeps only arguments that exist on the resolved GraphQL field.

Verification for operation `run.projects.locations.services.list`:

```json
{
  "resolvedField": "googleCloudRunV2ListServicesResponse",
  "resolvedArgs": ["locationsId", "pageSize", "pageToken", "projectsId", "showDeleted"],
  "variables": {
    "projectsId": "test-project",
    "locationsId": "us-central1",
    "pageSize": 1
  },
  "responseStatus": 401,
  "responseMessage": "Could not invoke operation GET /v2/projects/{projectsId}/locations/{locationsId}/services"
}
```

Conclusion:

- Field-name mismatch is resolved.
- Argument-shape mismatch (`parent` vs split IDs) is resolved for this path.
- Remaining failure is expected credential error (`401`) until valid GCP credentials are provided.
