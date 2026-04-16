npm warn Unknown env config "devdir". This will stop working in the next major version of npm.

> clawql-mcp@1.0.0 workflow:gcp-multi
> npm run build && node scripts/mcp-workflow-gcp-multi.mjs

npm warn Unknown env config "devdir". This will stop working in the next major version of npm.

> clawql-mcp@1.0.0 build
> tsc

=== ClawQL GCP multi-spec workflow (MCP search) ===

Provider: google (top 50 specs, merged)
Merged operations indexed: 4141
Mode: bundledOffline=1, via=mcp-stdio

--- Cross-cutting query ---
Query: "enable APIs batch GKE cluster firewall logging monitoring DNS bucket BigQuery" (10 hits)

1. POST container.projects.zones.clusters.monitoring
   v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}/monitoring
   score=33 []
2. POST container.projects.zones.clusters.logging
   v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}/logging
   score=33 []
3. POST logging.locations.buckets.createAsync
   v2/{v2Id}/{v2Id1}/locations/{locationsId}/buckets:createAsync
   score=32 []
4. POST logging.locations.buckets.create
   v2/{v2Id}/{v2Id1}/locations/{locationsId}/buckets
   score=32 []
5. POST logging.projects.locations.buckets.createAsync
   v2/projects/{projectsId}/locations/{locationsId}/buckets:createAsync
   score=32 []
6. POST logging.projects.locations.buckets.create
   v2/projects/{projectsId}/locations/{locationsId}/buckets
   score=32 []
7. POST logging.organizations.locations.buckets.createAsync
   v2/organizations/{organizationsId}/locations/{locationsId}/buckets:createAsync
   score=32 []
8. POST logging.organizations.locations.buckets.create
   v2/organizations/{organizationsId}/locations/{locationsId}/buckets
   score=32 []
9. POST logging.folders.locations.buckets.createAsync
   v2/folders/{foldersId}/locations/{locationsId}/buckets:createAsync
   score=32 []
10. POST logging.folders.locations.buckets.create
    v2/folders/{foldersId}/locations/{locationsId}/buckets
    score=32 []

--- 0. Service Usage — enable APIs ---
Query: "batch enable services projects serviceusage" (5 hits)

1. POST serviceusage.services.batchEnable
   v1/{v1Id}/{v1Id1}/services:batchEnable
   score=56 []
2. GET serviceusage.services.batchGet
   v1/{v1Id}/{v1Id1}/services:batchGet
   score=40 []
3. POST serviceusage.services.enable
   v1/{v1Id}/{v1Id1}/services/{servicesId}:enable
   score=36 []
4. GET serviceusage.services.list
   v1/{v1Id}/{v1Id1}/services
   score=31 []
5. POST compute.projects.enableXpnHost
   projects/{project}/enableXpnHost
   score=27 []

--- 1. Resource Manager — project IAM ---
Query: "get IAM policy project set bindings cloudresourcemanager" (5 hits)

1. POST cloudresourcemanager.projects.setIamPolicy
   v3/projects/{projectsId}:setIamPolicy
   score=63 []
2. POST cloudresourcemanager.projects.getIamPolicy
   v3/projects/{projectsId}:getIamPolicy
   score=62 []
3. POST aiplatform.projects.locations.datasets.getIamPolicy
   v1/projects/{projectsId}/locations/{locationsId}/datasets/{datasetsId}:getIamPolicy
   score=55 []
4. POST cloudresourcemanager.tagValues.getIamPolicy
   v3/tagValues/{tagValuesId}:getIamPolicy
   score=52 []
5. GET networkconnectivity.projects.locations.global.policyBasedRoutes.getIamPolicy
   v1/projects/{projectsId}/locations/global/policyBasedRoutes/{policyBasedRoutesId}:getIamPolicy
   score=52 []

--- 2. Networking & firewall ---
Query: "compute firewall insert network subnet VPC ingress" (5 hits)

1. POST compute.regionNetworkFirewallPolicies.insert
   projects/{project}/regions/{region}/firewallPolicies
   score=51 []
2. POST compute.regionNetworkFirewallPolicies.addRule
   projects/{project}/regions/{region}/firewallPolicies/{firewallPolicy}/addRule
   score=48 []
3. POST compute.regionNetworkFirewallPolicies.addAssociation
   projects/{project}/regions/{region}/firewallPolicies/{firewallPolicy}/addAssociation
   score=48 []
4. POST compute.subnetworks.insert
   projects/{project}/regions/{region}/subnetworks
   score=48 []
5. POST compute.subnetworks.setPrivateIpGoogleAccess
   projects/{project}/regions/{region}/subnetworks/{subnetwork}/setPrivateIpGoogleAccess
   score=48 []

--- 3. GKE cluster ---
Query: "create kubernetes cluster regional container locations" (5 hits)

1. POST container.projects.zones.clusters.locations
   v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}/locations
   score=49 []
2. POST container.projects.locations.clusters.create
   v1/projects/{projectsId}/locations/{locationsId}/clusters
   score=44 []
3. POST container.projects.locations.clusters.setLocations
   v1/projects/{projectsId}/locations/{locationsId}/clusters/{clustersId}:setLocations
   score=44 []
4. DELETE container.projects.locations.clusters.delete
   v1/projects/{projectsId}/locations/{locationsId}/clusters/{clustersId}
   score=40 []
5. POST container.projects.zones.clusters.create
   v1/projects/{projectId}/zones/{zone}/clusters
   score=38 []

--- 4. Logging ---
Query: "logging sink create export logs BigQuery storage destination" (5 hits)

1. POST logging.sinks.create
   v2/{v2Id}/{v2Id1}/sinks
   score=45 []
2. POST logging.projects.sinks.create
   v2/projects/{projectsId}/sinks
   score=45 []
3. POST logging.organizations.sinks.create
   v2/organizations/{organizationsId}/sinks
   score=45 []
4. POST logging.folders.sinks.create
   v2/folders/{foldersId}/sinks
   score=45 []
5. POST logging.billingAccounts.sinks.create
   v2/billingAccounts/{billingAccountsId}/sinks
   score=45 []

--- 5. Monitoring ---
Query: "monitoring alert policy notification channel time series" (5 hits)

1. GET monitoring.folders.timeSeries.list
   v3/folders/{foldersId}/timeSeries
   score=52 []
2. POST monitoring.projects.collectdTimeSeries.create
   v3/projects/{projectsId}/collectdTimeSeries
   score=52 []
3. POST monitoring.projects.timeSeries.query
   v3/projects/{projectsId}/timeSeries:query
   score=52 []
4. GET monitoring.projects.timeSeries.list
   v3/projects/{projectsId}/timeSeries
   score=52 []
5. POST monitoring.projects.timeSeries.create
   v3/projects/{projectsId}/timeSeries
   score=52 []

--- 6. Load balancing (Compute) ---
Query: "global forwarding rule backend service health check url map HTTPS proxy" (5 hits)

1. POST compute.backendServices.getHealth
   projects/{project}/global/backendServices/{backendService}/getHealth
   score=57 []
2. PATCH compute.httpsHealthChecks.patch
   projects/{project}/global/httpsHealthChecks/{httpsHealthCheck}
   score=55 []
3. PATCH compute.globalForwardingRules.patch
   projects/{project}/global/forwardingRules/{forwardingRule}
   score=54 []
4. GET compute.httpsHealthChecks.get
   projects/{project}/global/httpsHealthChecks/{httpsHealthCheck}
   score=54 []
5. DELETE compute.httpsHealthChecks.delete
   projects/{project}/global/httpsHealthChecks/{httpsHealthCheck}
   score=54 []

--- 7. Cloud DNS ---
Query: "DNS managed zone resource record set create A record" (5 hits)

1. POST dns.resourceRecordSets.create
   dns/v1/projects/{project}/managedZones/{managedZone}/rrsets
   score=83 []
2. GET servicenetworking.services.dnsRecordSets.get
   v1/services/{servicesId}/dnsRecordSets:get
   score=78 []
3. DELETE dns.resourceRecordSets.delete
   dns/v1/projects/{project}/managedZones/{managedZone}/rrsets/{name}/{type}
   score=77 []
4. GET dns.resourceRecordSets.list
   dns/v1/projects/{project}/managedZones/{managedZone}/rrsets
   score=77 []
5. GET dns.resourceRecordSets.get
   dns/v1/projects/{project}/managedZones/{managedZone}/rrsets/{name}/{type}
   score=76 []

--- 8. Cloud Storage ---
Query: "storage bucket insert objects upload IAM policy" (5 hits)

1. GET storage.buckets.getIamPolicy
   b/{bucket}/iam
   score=57 []
2. PUT storage.buckets.setIamPolicy
   b/{bucket}/iam
   score=55 []
3. GET storage.objects.getIamPolicy
   b/{bucket}/o/{object}/iam
   score=51 []
4. PUT storage.objects.setIamPolicy
   b/{bucket}/o/{object}/iam
   score=51 []
5. POST storage.buckets.lockRetentionPolicy
   b/{bucket}/lockRetentionPolicy
   score=45 []

--- 9. BigQuery ---
Query: "BigQuery dataset query job insert table" (5 hits)

1. POST bigquery.tabledata.insertAll
   projects/{projectsId}/datasets/{datasetsId}/tables/{tablesId}/insertAll
   score=63 []
2. POST bigquery.tables.insert
   projects/{projectsId}/datasets/{datasetsId}/tables
   score=57 []
3. DELETE bigquery.tables.delete
   projects/{projectsId}/datasets/{datasetsId}/tables/{tablesId}
   score=53 []
4. GET bigquery.tabledata.list
   projects/{projectsId}/datasets/{datasetsId}/tables/{tablesId}/data
   score=49 []
5. GET bigquery.tables.get
   projects/{projectsId}/datasets/{datasetsId}/tables/{tablesId}
   score=49 []

--- Run metadata ---
reportPath: /Users/danielsmith/ClawQL/docs/workflow-gcp-multi-latest.json
generatedAt: 2026-03-24T06:38:41.811Z

--- GCP draft (summary) ---
[GCP multi-service] API call plan — enable services, networking, GKE, observability, DNS, storage, and analytics

--- GCP draft (description, full) ---

## Goal

Summarize the most relevant Google Cloud API operations discovered by ClawQL search to stand up a multi-service GCP deployment end-to-end.

## Candidate operations (from ClawQL search)

- `POST` serviceusage.services.batchEnable — `v1/{v1Id}/{v1Id1}/services:batchEnable`
- `GET` serviceusage.services.batchGet — `v1/{v1Id}/{v1Id1}/services:batchGet`
- `POST` serviceusage.services.enable — `v1/{v1Id}/{v1Id1}/services/{servicesId}:enable`
- `GET` serviceusage.services.list — `v1/{v1Id}/{v1Id1}/services`
- `POST` compute.projects.enableXpnHost — `projects/{project}/enableXpnHost`
- `POST` cloudresourcemanager.projects.setIamPolicy — `v3/projects/{projectsId}:setIamPolicy`
- `POST` cloudresourcemanager.projects.getIamPolicy — `v3/projects/{projectsId}:getIamPolicy`
- `POST` aiplatform.projects.locations.datasets.getIamPolicy — `v1/projects/{projectsId}/locations/{locationsId}/datasets/{datasetsId}:getIamPolicy`
- `POST` cloudresourcemanager.tagValues.getIamPolicy — `v3/tagValues/{tagValuesId}:getIamPolicy`
- `GET` networkconnectivity.projects.locations.global.policyBasedRoutes.getIamPolicy — `v1/projects/{projectsId}/locations/global/policyBasedRoutes/{policyBasedRoutesId}:getIamPolicy`
- `POST` compute.regionNetworkFirewallPolicies.insert — `projects/{project}/regions/{region}/firewallPolicies`
- `POST` compute.regionNetworkFirewallPolicies.addRule — `projects/{project}/regions/{region}/firewallPolicies/{firewallPolicy}/addRule`
- `POST` compute.regionNetworkFirewallPolicies.addAssociation — `projects/{project}/regions/{region}/firewallPolicies/{firewallPolicy}/addAssociation`
- `POST` compute.subnetworks.insert — `projects/{project}/regions/{region}/subnetworks`
- `POST` compute.subnetworks.setPrivateIpGoogleAccess — `projects/{project}/regions/{region}/subnetworks/{subnetwork}/setPrivateIpGoogleAccess`
- `POST` container.projects.zones.clusters.locations — `v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}/locations`
- `POST` container.projects.locations.clusters.create — `v1/projects/{projectsId}/locations/{locationsId}/clusters`
- `POST` container.projects.locations.clusters.setLocations — `v1/projects/{projectsId}/locations/{locationsId}/clusters/{clustersId}:setLocations`
- `DELETE` container.projects.locations.clusters.delete — `v1/projects/{projectsId}/locations/{locationsId}/clusters/{clustersId}`
- `POST` container.projects.zones.clusters.create — `v1/projects/{projectId}/zones/{zone}/clusters`

## Proposed call sequence to finish task

### 0. Service Usage — enable APIs

Query: "batch enable services projects serviceusage"

- `POST` serviceusage.services.batchEnable — `v1/{v1Id}/{v1Id1}/services:batchEnable`
- `GET` serviceusage.services.batchGet — `v1/{v1Id}/{v1Id1}/services:batchGet`

### 1. Resource Manager — project IAM

Query: "get IAM policy project set bindings cloudresourcemanager"

- `POST` cloudresourcemanager.projects.setIamPolicy — `v3/projects/{projectsId}:setIamPolicy`
- `POST` cloudresourcemanager.projects.getIamPolicy — `v3/projects/{projectsId}:getIamPolicy`

### 2. Networking & firewall

Query: "compute firewall insert network subnet VPC ingress"

- `POST` compute.regionNetworkFirewallPolicies.insert — `projects/{project}/regions/{region}/firewallPolicies`
- `POST` compute.regionNetworkFirewallPolicies.addRule — `projects/{project}/regions/{region}/firewallPolicies/{firewallPolicy}/addRule`

### 3. GKE cluster

Query: "create kubernetes cluster regional container locations"

- `POST` container.projects.zones.clusters.locations — `v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}/locations`
- `POST` container.projects.locations.clusters.create — `v1/projects/{projectsId}/locations/{locationsId}/clusters`

### 4. Logging

Query: "logging sink create export logs BigQuery storage destination"

- `POST` logging.sinks.create — `v2/{v2Id}/{v2Id1}/sinks`
- `POST` logging.projects.sinks.create — `v2/projects/{projectsId}/sinks`

### 5. Monitoring

Query: "monitoring alert policy notification channel time series"

- `GET` monitoring.folders.timeSeries.list — `v3/folders/{foldersId}/timeSeries`
- `POST` monitoring.projects.collectdTimeSeries.create — `v3/projects/{projectsId}/collectdTimeSeries`

### 6. Load balancing (Compute)

Query: "global forwarding rule backend service health check url map HTTPS proxy"

- `POST` compute.backendServices.getHealth — `projects/{project}/global/backendServices/{backendService}/getHealth`
- `PATCH` compute.httpsHealthChecks.patch — `projects/{project}/global/httpsHealthChecks/{httpsHealthCheck}`

### 7. Cloud DNS

Query: "DNS managed zone resource record set create A record"

- `POST` dns.resourceRecordSets.create — `dns/v1/projects/{project}/managedZones/{managedZone}/rrsets`
- `GET` servicenetworking.services.dnsRecordSets.get — `v1/services/{servicesId}/dnsRecordSets:get`

### 8. Cloud Storage

Query: "storage bucket insert objects upload IAM policy"

- `GET` storage.buckets.getIamPolicy — `b/{bucket}/iam`
- `PUT` storage.buckets.setIamPolicy — `b/{bucket}/iam`

### 9. BigQuery

Query: "BigQuery dataset query job insert table"

- `POST` bigquery.tabledata.insertAll — `projects/{projectsId}/datasets/{datasetsId}/tables/{tablesId}/insertAll`
- `POST` bigquery.tables.insert — `projects/{projectsId}/datasets/{datasetsId}/tables`

## Notes

- This is a search-driven plan; validate IAM permissions, project/location values, and resource names before execution.
- Prefer project-scoped endpoints where equivalent org/folder variants exist.

{
"ok": true,
"exit": "success",
"reportPath": "/Users/danielsmith/ClawQL/docs/workflow-gcp-multi-latest.json",
"mergedOperationCount": 4141,
"draftSummary": "[GCP multi-service] API call plan — enable services, networking, GKE, observability, DNS, storage, and analytics"
}

[mcp-workflow-gcp-multi] Wrote /Users/danielsmith/ClawQL/docs/workflow-gcp-multi-latest.json (MCP tools/call → search)
