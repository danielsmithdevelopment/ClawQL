npm warn Unknown env config "devdir". This will stop working in the next major version of npm.

> clawql-mcp-server@1.0.0 workflow:multi-provider
> npm run build && node scripts/workflow-gke-cloudflare-jira.mjs

npm warn Unknown env config "devdir". This will stop working in the next major version of npm.

> clawql-mcp-server@1.0.0 build
> tsc

[spec-loader] multi 1/50: iam-v2 → /Users/danielsmith/ClawQL/providers/google/apis/iam-v2/discovery.json
[spec-loader] multi 2/50: cloudresourcemanager-v3 → /Users/danielsmith/ClawQL/providers/google/apis/cloudresourcemanager-v3/discovery.json
[spec-loader] multi 3/50: serviceusage-v1 → /Users/danielsmith/ClawQL/providers/google/apis/serviceusage-v1/discovery.json
[spec-loader] multi 4/50: servicecontrol-v1 → /Users/danielsmith/ClawQL/providers/google/apis/servicecontrol-v1/discovery.json
[spec-loader] multi 5/50: servicemanagement-v1 → /Users/danielsmith/ClawQL/providers/google/apis/servicemanagement-v1/discovery.json
[spec-loader] multi 6/50: compute-v1 → /Users/danielsmith/ClawQL/providers/google/apis/compute-v1/discovery.json
[spec-loader] multi 7/50: dns-v1 → /Users/danielsmith/ClawQL/providers/google/apis/dns-v1/discovery.json
[spec-loader] multi 8/50: servicenetworking-v1 → /Users/danielsmith/ClawQL/providers/google/apis/servicenetworking-v1/discovery.json
[spec-loader] multi 9/50: networkconnectivity-v1 → /Users/danielsmith/ClawQL/providers/google/apis/networkconnectivity-v1/discovery.json
[spec-loader] multi 10/50: networksecurity-v1beta1 → /Users/danielsmith/ClawQL/providers/google/apis/networksecurity-v1beta1/discovery.json
[spec-loader] multi 11/50: networkmanagement-v1beta1 → /Users/danielsmith/ClawQL/providers/google/apis/networkmanagement-v1beta1/discovery.json
[spec-loader] multi 12/50: container-v1 → /Users/danielsmith/ClawQL/providers/google/apis/container-v1/discovery.json
[spec-loader] multi 13/50: gkehub-v2 → /Users/danielsmith/ClawQL/providers/google/apis/gkehub-v2/discovery.json
[spec-loader] multi 14/50: run-v2 → /Users/danielsmith/ClawQL/providers/google/apis/run-v2/discovery.json
[spec-loader] multi 15/50: cloudfunctions-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudfunctions-v2/discovery.json
[spec-loader] multi 16/50: artifactregistry-v1 → /Users/danielsmith/ClawQL/providers/google/apis/artifactregistry-v1/discovery.json
[spec-loader] multi 17/50: cloudbuild-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudbuild-v2/discovery.json
[spec-loader] multi 18/50: clouddeploy-v1 → /Users/danielsmith/ClawQL/providers/google/apis/clouddeploy-v1/discovery.json
[spec-loader] multi 19/50: binaryauthorization-v1 → /Users/danielsmith/ClawQL/providers/google/apis/binaryauthorization-v1/discovery.json
[spec-loader] multi 20/50: pubsub-v1 → /Users/danielsmith/ClawQL/providers/google/apis/pubsub-v1/discovery.json
[spec-loader] multi 21/50: eventarc-v1 → /Users/danielsmith/ClawQL/providers/google/apis/eventarc-v1/discovery.json
[spec-loader] multi 22/50: workflows-v1 → /Users/danielsmith/ClawQL/providers/google/apis/workflows-v1/discovery.json
[spec-loader] multi 23/50: secretmanager-v1 → /Users/danielsmith/ClawQL/providers/google/apis/secretmanager-v1/discovery.json
[spec-loader] multi 24/50: cloudkms-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudkms-v1/discovery.json
[spec-loader] multi 25/50: storage-v1 → /Users/danielsmith/ClawQL/providers/google/apis/storage-v1/discovery.json
[spec-loader] multi 26/50: file-v1 → /Users/danielsmith/ClawQL/providers/google/apis/file-v1/discovery.json
[spec-loader] multi 27/50: sqladmin-v1 → /Users/danielsmith/ClawQL/providers/google/apis/sqladmin-v1/discovery.json
[spec-loader] multi 28/50: redis-v1 → /Users/danielsmith/ClawQL/providers/google/apis/redis-v1/discovery.json
[spec-loader] multi 29/50: spanner-v1 → /Users/danielsmith/ClawQL/providers/google/apis/spanner-v1/discovery.json
[spec-loader] multi 30/50: bigtableadmin-v2 → /Users/danielsmith/ClawQL/providers/google/apis/bigtableadmin-v2/discovery.json
[spec-loader] multi 31/50: bigquery-v2 → /Users/danielsmith/ClawQL/providers/google/apis/bigquery-v2/discovery.json
[spec-loader] multi 32/50: dataflow-v1b3 → /Users/danielsmith/ClawQL/providers/google/apis/dataflow-v1b3/discovery.json
[spec-loader] multi 33/50: dataproc-v1 → /Users/danielsmith/ClawQL/providers/google/apis/dataproc-v1/discovery.json
[spec-loader] multi 34/50: composer-v1 → /Users/danielsmith/ClawQL/providers/google/apis/composer-v1/discovery.json
[spec-loader] multi 35/50: aiplatform-v1 → /Users/danielsmith/ClawQL/providers/google/apis/aiplatform-v1/discovery.json
[spec-loader] multi 36/50: notebooks-v1 → /Users/danielsmith/ClawQL/providers/google/apis/notebooks-v1/discovery.json
[spec-loader] multi 37/50: logging-v2 → /Users/danielsmith/ClawQL/providers/google/apis/logging-v2/discovery.json
[spec-loader] multi 38/50: monitoring-v3 → /Users/danielsmith/ClawQL/providers/google/apis/monitoring-v3/discovery.json
[spec-loader] multi 39/50: cloudtrace-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudtrace-v2/discovery.json
[spec-loader] multi 40/50: clouderrorreporting-v1beta1 → /Users/danielsmith/ClawQL/providers/google/apis/clouderrorreporting-v1beta1/discovery.json
[spec-loader] multi 41/50: cloudprofiler-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudprofiler-v2/discovery.json
[spec-loader] multi 42/50: cloudasset-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudasset-v1/discovery.json
[spec-loader] multi 43/50: cloudscheduler-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudscheduler-v1/discovery.json
[spec-loader] multi 44/50: cloudtasks-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudtasks-v2/discovery.json
[spec-loader] multi 45/50: iap-v1 → /Users/danielsmith/ClawQL/providers/google/apis/iap-v1/discovery.json
[spec-loader] multi 46/50: identitytoolkit-v3 → /Users/danielsmith/ClawQL/providers/google/apis/identitytoolkit-v3/discovery.json
[spec-loader] multi 47/50: recommender-v1 → /Users/danielsmith/ClawQL/providers/google/apis/recommender-v1/discovery.json
[spec-loader] multi 48/50: billingbudgets-v1 → /Users/danielsmith/ClawQL/providers/google/apis/billingbudgets-v1/discovery.json
[spec-loader] multi 49/50: cloudbilling-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudbilling-v1/discovery.json
[spec-loader] multi 50/50: osconfig-v1 → /Users/danielsmith/ClawQL/providers/google/apis/osconfig-v1/discovery.json
[spec-loader] Multi-spec: 50 APIs merged → 4141 operations (REST execution; GraphQL not used for execute)
[spec-loader] bundled provider "cloudflare" → /Users/danielsmith/ClawQL/providers/cloudflare/openapi.yaml
[spec-loader] Using bundled local OpenAPI (no network): /Users/danielsmith/ClawQL/providers/cloudflare/openapi.yaml
[spec-loader] Loaded 2697 operations (Cloudflare API)
[spec-loader] bundled provider "jira" → /Users/danielsmith/ClawQL/providers/atlassian/jira/openapi.yaml
[spec-loader] Using bundled local OpenAPI (no network): /Users/danielsmith/ClawQL/providers/atlassian/jira/openapi.yaml
[spec-loader] Loaded 336 operations (The Jira Cloud platform REST API)
[spec-loader] multi 1/50: iam-v2 → /Users/danielsmith/ClawQL/providers/google/apis/iam-v2/discovery.json
[spec-loader] multi 2/50: cloudresourcemanager-v3 → /Users/danielsmith/ClawQL/providers/google/apis/cloudresourcemanager-v3/discovery.json
[spec-loader] multi 3/50: serviceusage-v1 → /Users/danielsmith/ClawQL/providers/google/apis/serviceusage-v1/discovery.json
[spec-loader] multi 4/50: servicecontrol-v1 → /Users/danielsmith/ClawQL/providers/google/apis/servicecontrol-v1/discovery.json
[spec-loader] multi 5/50: servicemanagement-v1 → /Users/danielsmith/ClawQL/providers/google/apis/servicemanagement-v1/discovery.json
[spec-loader] multi 6/50: compute-v1 → /Users/danielsmith/ClawQL/providers/google/apis/compute-v1/discovery.json
[spec-loader] multi 7/50: dns-v1 → /Users/danielsmith/ClawQL/providers/google/apis/dns-v1/discovery.json
[spec-loader] multi 8/50: servicenetworking-v1 → /Users/danielsmith/ClawQL/providers/google/apis/servicenetworking-v1/discovery.json
[spec-loader] multi 9/50: networkconnectivity-v1 → /Users/danielsmith/ClawQL/providers/google/apis/networkconnectivity-v1/discovery.json
[spec-loader] multi 10/50: networksecurity-v1beta1 → /Users/danielsmith/ClawQL/providers/google/apis/networksecurity-v1beta1/discovery.json
[spec-loader] multi 11/50: networkmanagement-v1beta1 → /Users/danielsmith/ClawQL/providers/google/apis/networkmanagement-v1beta1/discovery.json
[spec-loader] multi 12/50: container-v1 → /Users/danielsmith/ClawQL/providers/google/apis/container-v1/discovery.json
[spec-loader] multi 13/50: gkehub-v2 → /Users/danielsmith/ClawQL/providers/google/apis/gkehub-v2/discovery.json
[spec-loader] multi 14/50: run-v2 → /Users/danielsmith/ClawQL/providers/google/apis/run-v2/discovery.json
[spec-loader] multi 15/50: cloudfunctions-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudfunctions-v2/discovery.json
[spec-loader] multi 16/50: artifactregistry-v1 → /Users/danielsmith/ClawQL/providers/google/apis/artifactregistry-v1/discovery.json
[spec-loader] multi 17/50: cloudbuild-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudbuild-v2/discovery.json
[spec-loader] multi 18/50: clouddeploy-v1 → /Users/danielsmith/ClawQL/providers/google/apis/clouddeploy-v1/discovery.json
[spec-loader] multi 19/50: binaryauthorization-v1 → /Users/danielsmith/ClawQL/providers/google/apis/binaryauthorization-v1/discovery.json
[spec-loader] multi 20/50: pubsub-v1 → /Users/danielsmith/ClawQL/providers/google/apis/pubsub-v1/discovery.json
[spec-loader] multi 21/50: eventarc-v1 → /Users/danielsmith/ClawQL/providers/google/apis/eventarc-v1/discovery.json
[spec-loader] multi 22/50: workflows-v1 → /Users/danielsmith/ClawQL/providers/google/apis/workflows-v1/discovery.json
[spec-loader] multi 23/50: secretmanager-v1 → /Users/danielsmith/ClawQL/providers/google/apis/secretmanager-v1/discovery.json
[spec-loader] multi 24/50: cloudkms-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudkms-v1/discovery.json
[spec-loader] multi 25/50: storage-v1 → /Users/danielsmith/ClawQL/providers/google/apis/storage-v1/discovery.json
[spec-loader] multi 26/50: file-v1 → /Users/danielsmith/ClawQL/providers/google/apis/file-v1/discovery.json
[spec-loader] multi 27/50: sqladmin-v1 → /Users/danielsmith/ClawQL/providers/google/apis/sqladmin-v1/discovery.json
[spec-loader] multi 28/50: redis-v1 → /Users/danielsmith/ClawQL/providers/google/apis/redis-v1/discovery.json
[spec-loader] multi 29/50: spanner-v1 → /Users/danielsmith/ClawQL/providers/google/apis/spanner-v1/discovery.json
[spec-loader] multi 30/50: bigtableadmin-v2 → /Users/danielsmith/ClawQL/providers/google/apis/bigtableadmin-v2/discovery.json
[spec-loader] multi 31/50: bigquery-v2 → /Users/danielsmith/ClawQL/providers/google/apis/bigquery-v2/discovery.json
[spec-loader] multi 32/50: dataflow-v1b3 → /Users/danielsmith/ClawQL/providers/google/apis/dataflow-v1b3/discovery.json
[spec-loader] multi 33/50: dataproc-v1 → /Users/danielsmith/ClawQL/providers/google/apis/dataproc-v1/discovery.json
[spec-loader] multi 34/50: composer-v1 → /Users/danielsmith/ClawQL/providers/google/apis/composer-v1/discovery.json
[spec-loader] multi 35/50: aiplatform-v1 → /Users/danielsmith/ClawQL/providers/google/apis/aiplatform-v1/discovery.json
[spec-loader] multi 36/50: notebooks-v1 → /Users/danielsmith/ClawQL/providers/google/apis/notebooks-v1/discovery.json
[spec-loader] multi 37/50: logging-v2 → /Users/danielsmith/ClawQL/providers/google/apis/logging-v2/discovery.json
[spec-loader] multi 38/50: monitoring-v3 → /Users/danielsmith/ClawQL/providers/google/apis/monitoring-v3/discovery.json
[spec-loader] multi 39/50: cloudtrace-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudtrace-v2/discovery.json
[spec-loader] multi 40/50: clouderrorreporting-v1beta1 → /Users/danielsmith/ClawQL/providers/google/apis/clouderrorreporting-v1beta1/discovery.json
[spec-loader] multi 41/50: cloudprofiler-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudprofiler-v2/discovery.json
[spec-loader] multi 42/50: cloudasset-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudasset-v1/discovery.json
[spec-loader] multi 43/50: cloudscheduler-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudscheduler-v1/discovery.json
[spec-loader] multi 44/50: cloudtasks-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudtasks-v2/discovery.json
[spec-loader] multi 45/50: iap-v1 → /Users/danielsmith/ClawQL/providers/google/apis/iap-v1/discovery.json
[spec-loader] multi 46/50: identitytoolkit-v3 → /Users/danielsmith/ClawQL/providers/google/apis/identitytoolkit-v3/discovery.json
[spec-loader] multi 47/50: recommender-v1 → /Users/danielsmith/ClawQL/providers/google/apis/recommender-v1/discovery.json
[spec-loader] multi 48/50: billingbudgets-v1 → /Users/danielsmith/ClawQL/providers/google/apis/billingbudgets-v1/discovery.json
[spec-loader] multi 49/50: cloudbilling-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudbilling-v1/discovery.json
[spec-loader] multi 50/50: osconfig-v1 → /Users/danielsmith/ClawQL/providers/google/apis/osconfig-v1/discovery.json
[spec-loader] Multi-spec: 50 APIs merged → 4141 operations (REST execution; GraphQL not used for execute)
[spec-loader] multi 1/50: iam-v2 → /Users/danielsmith/ClawQL/providers/google/apis/iam-v2/discovery.json
[spec-loader] multi 2/50: cloudresourcemanager-v3 → /Users/danielsmith/ClawQL/providers/google/apis/cloudresourcemanager-v3/discovery.json
[spec-loader] multi 3/50: serviceusage-v1 → /Users/danielsmith/ClawQL/providers/google/apis/serviceusage-v1/discovery.json
[spec-loader] multi 4/50: servicecontrol-v1 → /Users/danielsmith/ClawQL/providers/google/apis/servicecontrol-v1/discovery.json
[spec-loader] multi 5/50: servicemanagement-v1 → /Users/danielsmith/ClawQL/providers/google/apis/servicemanagement-v1/discovery.json
[spec-loader] multi 6/50: compute-v1 → /Users/danielsmith/ClawQL/providers/google/apis/compute-v1/discovery.json
[spec-loader] multi 7/50: dns-v1 → /Users/danielsmith/ClawQL/providers/google/apis/dns-v1/discovery.json
[spec-loader] multi 8/50: servicenetworking-v1 → /Users/danielsmith/ClawQL/providers/google/apis/servicenetworking-v1/discovery.json
[spec-loader] multi 9/50: networkconnectivity-v1 → /Users/danielsmith/ClawQL/providers/google/apis/networkconnectivity-v1/discovery.json
[spec-loader] multi 10/50: networksecurity-v1beta1 → /Users/danielsmith/ClawQL/providers/google/apis/networksecurity-v1beta1/discovery.json
[spec-loader] multi 11/50: networkmanagement-v1beta1 → /Users/danielsmith/ClawQL/providers/google/apis/networkmanagement-v1beta1/discovery.json
[spec-loader] multi 12/50: container-v1 → /Users/danielsmith/ClawQL/providers/google/apis/container-v1/discovery.json
[spec-loader] multi 13/50: gkehub-v2 → /Users/danielsmith/ClawQL/providers/google/apis/gkehub-v2/discovery.json
[spec-loader] multi 14/50: run-v2 → /Users/danielsmith/ClawQL/providers/google/apis/run-v2/discovery.json
[spec-loader] multi 15/50: cloudfunctions-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudfunctions-v2/discovery.json
[spec-loader] multi 16/50: artifactregistry-v1 → /Users/danielsmith/ClawQL/providers/google/apis/artifactregistry-v1/discovery.json
[spec-loader] multi 17/50: cloudbuild-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudbuild-v2/discovery.json
[spec-loader] multi 18/50: clouddeploy-v1 → /Users/danielsmith/ClawQL/providers/google/apis/clouddeploy-v1/discovery.json
[spec-loader] multi 19/50: binaryauthorization-v1 → /Users/danielsmith/ClawQL/providers/google/apis/binaryauthorization-v1/discovery.json
[spec-loader] multi 20/50: pubsub-v1 → /Users/danielsmith/ClawQL/providers/google/apis/pubsub-v1/discovery.json
[spec-loader] multi 21/50: eventarc-v1 → /Users/danielsmith/ClawQL/providers/google/apis/eventarc-v1/discovery.json
[spec-loader] multi 22/50: workflows-v1 → /Users/danielsmith/ClawQL/providers/google/apis/workflows-v1/discovery.json
[spec-loader] multi 23/50: secretmanager-v1 → /Users/danielsmith/ClawQL/providers/google/apis/secretmanager-v1/discovery.json
[spec-loader] multi 24/50: cloudkms-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudkms-v1/discovery.json
[spec-loader] multi 25/50: storage-v1 → /Users/danielsmith/ClawQL/providers/google/apis/storage-v1/discovery.json
[spec-loader] multi 26/50: file-v1 → /Users/danielsmith/ClawQL/providers/google/apis/file-v1/discovery.json
[spec-loader] multi 27/50: sqladmin-v1 → /Users/danielsmith/ClawQL/providers/google/apis/sqladmin-v1/discovery.json
[spec-loader] multi 28/50: redis-v1 → /Users/danielsmith/ClawQL/providers/google/apis/redis-v1/discovery.json
[spec-loader] multi 29/50: spanner-v1 → /Users/danielsmith/ClawQL/providers/google/apis/spanner-v1/discovery.json
[spec-loader] multi 30/50: bigtableadmin-v2 → /Users/danielsmith/ClawQL/providers/google/apis/bigtableadmin-v2/discovery.json
[spec-loader] multi 31/50: bigquery-v2 → /Users/danielsmith/ClawQL/providers/google/apis/bigquery-v2/discovery.json
[spec-loader] multi 32/50: dataflow-v1b3 → /Users/danielsmith/ClawQL/providers/google/apis/dataflow-v1b3/discovery.json
[spec-loader] multi 33/50: dataproc-v1 → /Users/danielsmith/ClawQL/providers/google/apis/dataproc-v1/discovery.json
[spec-loader] multi 34/50: composer-v1 → /Users/danielsmith/ClawQL/providers/google/apis/composer-v1/discovery.json
[spec-loader] multi 35/50: aiplatform-v1 → /Users/danielsmith/ClawQL/providers/google/apis/aiplatform-v1/discovery.json
[spec-loader] multi 36/50: notebooks-v1 → /Users/danielsmith/ClawQL/providers/google/apis/notebooks-v1/discovery.json
[spec-loader] multi 37/50: logging-v2 → /Users/danielsmith/ClawQL/providers/google/apis/logging-v2/discovery.json
[spec-loader] multi 38/50: monitoring-v3 → /Users/danielsmith/ClawQL/providers/google/apis/monitoring-v3/discovery.json
[spec-loader] multi 39/50: cloudtrace-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudtrace-v2/discovery.json
[spec-loader] multi 40/50: clouderrorreporting-v1beta1 → /Users/danielsmith/ClawQL/providers/google/apis/clouderrorreporting-v1beta1/discovery.json
[spec-loader] multi 41/50: cloudprofiler-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudprofiler-v2/discovery.json
[spec-loader] multi 42/50: cloudasset-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudasset-v1/discovery.json
[spec-loader] multi 43/50: cloudscheduler-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudscheduler-v1/discovery.json
[spec-loader] multi 44/50: cloudtasks-v2 → /Users/danielsmith/ClawQL/providers/google/apis/cloudtasks-v2/discovery.json
[spec-loader] multi 45/50: iap-v1 → /Users/danielsmith/ClawQL/providers/google/apis/iap-v1/discovery.json
[spec-loader] multi 46/50: identitytoolkit-v3 → /Users/danielsmith/ClawQL/providers/google/apis/identitytoolkit-v3/discovery.json
[spec-loader] multi 47/50: recommender-v1 → /Users/danielsmith/ClawQL/providers/google/apis/recommender-v1/discovery.json
[spec-loader] multi 48/50: billingbudgets-v1 → /Users/danielsmith/ClawQL/providers/google/apis/billingbudgets-v1/discovery.json
[spec-loader] multi 49/50: cloudbilling-v1 → /Users/danielsmith/ClawQL/providers/google/apis/cloudbilling-v1/discovery.json
[spec-loader] multi 50/50: osconfig-v1 → /Users/danielsmith/ClawQL/providers/google/apis/osconfig-v1/discovery.json
[spec-loader] Multi-spec: 50 APIs merged → 4141 operations (REST execution; GraphQL not used for execute)
[spec-loader] bundled provider "cloudflare" → /Users/danielsmith/ClawQL/providers/cloudflare/openapi.yaml
[spec-loader] Using bundled local OpenAPI (no network): /Users/danielsmith/ClawQL/providers/cloudflare/openapi.yaml
[spec-loader] Loaded 2697 operations (Cloudflare API)
[spec-loader] bundled provider "cloudflare" → /Users/danielsmith/ClawQL/providers/cloudflare/openapi.yaml
[spec-loader] Using bundled local OpenAPI (no network): /Users/danielsmith/ClawQL/providers/cloudflare/openapi.yaml
[spec-loader] Loaded 2697 operations (Cloudflare API)
[spec-loader] bundled provider "jira" → /Users/danielsmith/ClawQL/providers/atlassian/jira/openapi.yaml
[spec-loader] Using bundled local OpenAPI (no network): /Users/danielsmith/ClawQL/providers/atlassian/jira/openapi.yaml
[spec-loader] Loaded 336 operations (The Jira Cloud platform REST API)
=== ClawQL multi-provider workflow (search-only) ===

Providers: google, cloudflare, jira
Merged operations indexed across provider specs: 7174
Per-provider operation counts: google=4141, cloudflare=2697, jira=336
Unique candidate operations shown in this report: 62
Draft due date (next Friday): 2026-03-27

--- [GOOGLE] GKE — create / manage clusters ---

  Query: "create kubernetes cluster GKE regional zonal" (5 hits)
    1. POST redis.projects.locations.clusters.create
       v1/projects/{projectsId}/locations/{locationsId}/clusters
       score=27 [id:redis.projects.locations.clusters.create, description(partial), resource:clusters, description, path:v1/projects/{projectsId}/locations/{locationsId}/clusters, param]
    2. POST bigtableadmin.projects.instances.clusters.create
       v2/projects/{projectsId}/instances/{instancesId}/clusters
       score=27 [id:bigtableadmin.projects.instances.clusters.create, description(partial), resource:clusters, description, path:v2/projects/{projectsId}/instances/{instancesId}/clusters, param]
    3. POST container.projects.locations.clusters.create
       v1/projects/{projectsId}/locations/{locationsId}/clusters
       score=25 [id:container.projects.locations.clusters.create, description(partial), resource:clusters, description, path:v1/projects/{projectsId}/locations/{locationsId}/clusters]
    4. POST container.projects.zones.clusters.create
       v1/projects/{projectId}/zones/{zone}/clusters
       score=25 [id:container.projects.zones.clusters.create, description(partial), resource:clusters, description, path:v1/projects/{projectId}/zones/{zone}/clusters]
    5. DELETE container.projects.zones.clusters.delete
       v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}
       score=25 [description(partial), description, id:container.projects.zones.clusters.delete, resource:clusters, path:v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}, param]

  Query: "deploy application workload container image kubernetes engine" (5 hits)
    1. POST clouddeploy.projects.locations.deployPolicies.create
       v1/projects/{projectsId}/locations/{locationsId}/deployPolicies
       score=23 [spec:clouddeploy-v1, id:clouddeploy.projects.locations.deployPolicies.create, resource:deployPolicies, description(partial), path:v1/projects/{projectsId}/locations/{locationsId}/deployPolicies, param]
    2. GET clouddeploy.projects.locations.deployPolicies.list
       v1/projects/{projectsId}/locations/{locationsId}/deployPolicies
       score=21 [spec:clouddeploy-v1, id:clouddeploy.projects.locations.deployPolicies.list, resource:deployPolicies, description(partial), path:v1/projects/{projectsId}/locations/{locationsId}/deployPolicies]
    3. GET compute.images.get
       projects/{project}/global/images/{image}
       score=20 [id:compute.images.get, resource:images, description, path:projects/{project}/global/images/{image}, param]
    4. DELETE compute.images.delete
       projects/{project}/global/images/{image}
       score=20 [id:compute.images.delete, resource:images, description, path:projects/{project}/global/images/{image}, param]
    5. POST compute.images.deprecate
       projects/{project}/global/images/{image}/deprecate
       score=20 [id:compute.images.deprecate, resource:images, description, path:projects/{project}/global/images/{image}/deprecate, param]

--- [GOOGLE] GKE — expose service & network (incl. Cloudflare-friendly ingress) ---

  Query: "kubernetes service load balancer external IP expose" (5 hits)
    1. POST servicecontrol.services.check
       v1/services/{serviceName}:check
       score=26 [spec:servicecontrol-v1, id:servicecontrol.services.check, resource:services, description, path:v1/services/{serviceName}:check, param]
    2. POST servicecontrol.services.report
       v1/services/{serviceName}:report
       score=26 [spec:servicecontrol-v1, id:servicecontrol.services.report, resource:services, description, path:v1/services/{serviceName}:report, param]
    3. POST servicecontrol.services.allocateQuota
       v1/services/{serviceName}:allocateQuota
       score=26 [spec:servicecontrol-v1, id:servicecontrol.services.allocateQuota, resource:services, description, path:v1/services/{serviceName}:allocateQuota, param]
    4. GET servicemanagement.services.get
       v1/services/{serviceName}
       score=26 [spec:servicemanagement-v1, id:servicemanagement.services.get, resource:services, description, path:v1/services/{serviceName}, param]
    5. GET servicemanagement.services.getConfig
       v1/services/{serviceName}/config
       score=26 [spec:servicemanagement-v1, id:servicemanagement.services.getConfig, resource:services, description, path:v1/services/{serviceName}/config, param]

  Query: "compute firewall rule ingress allow tcp source ip range" (5 hits)
    1. POST compute.firewallPolicies.addRule
       locations/global/firewallPolicies/{firewallPolicy}/addRule
       score=45 [spec:compute-v1, id:compute.firewallPolicies.addRule, resource:firewallPolicies, description, path:locations/global/firewallPolicies/{firewallPolicy}/addRule, param]
    2. POST compute.networkFirewallPolicies.addRule
       projects/{project}/global/firewallPolicies/{firewallPolicy}/addRule
       score=45 [spec:compute-v1, id:compute.networkFirewallPolicies.addRule, resource:networkFirewallPolicies, description, path:projects/{project}/global/firewallPolicies/{firewallPolicy}/addRule, param]
    3. POST compute.networkFirewallPolicies.addPacketMirroringRule
       projects/{project}/global/firewallPolicies/{firewallPolicy}/addPacketMirroringRule
       score=45 [spec:compute-v1, id:compute.networkFirewallPolicies.addPacketMirroringRule, resource:networkFirewallPolicies, description, path:projects/{project}/global/firewallPolicies/{firewallPolicy}/addPacketMirroringRule, param]
    4. POST compute.regionNetworkFirewallPolicies.addRule
       projects/{project}/regions/{region}/firewallPolicies/{firewallPolicy}/addRule
       score=45 [spec:compute-v1, id:compute.regionNetworkFirewallPolicies.addRule, resource:regionNetworkFirewallPolicies, description, path:projects/{project}/regions/{region}/firewallPolicies/{firewallPolicy}/addRule, param]
    5. POST compute.firewallPolicies.cloneRules
       locations/global/firewallPolicies/{firewallPolicy}/cloneRules
       score=44 [spec:compute-v1, id:compute.firewallPolicies.cloneRules, resource:firewallPolicies, description, path:locations/global/firewallPolicies/{firewallPolicy}/cloneRules, param, description(partial)]

  Query: "container clusters get credentials kubectl" (5 hits)
    1. GET container.projects.zones.clusters.get
       v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}
       score=36 [spec:container-v1, id:container.projects.zones.clusters.get, resource:clusters, path:v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}, method:GET, description(partial)]
    2. GET container.projects.locations.clusters.list
       v1/projects/{projectsId}/locations/{locationsId}/clusters
       score=33 [spec:container-v1, id:container.projects.locations.clusters.list, resource:clusters, description, path:v1/projects/{projectsId}/locations/{locationsId}/clusters, method:GET]
    3. GET container.projects.locations.clusters.get
       v1/projects/{projectsId}/locations/{locationsId}/clusters/{clustersId}
       score=33 [spec:container-v1, id:container.projects.locations.clusters.get, resource:clusters, method:GET, description(partial)]
    4. GET container.projects.locations.clusters.getJwks
       v1/projects/{projectsId}/locations/{locationsId}/clusters/{clustersId}/jwks
       score=33 [spec:container-v1, id:container.projects.locations.clusters.getJwks, resource:clusters, method:GET, description(partial)]
    5. GET container.projects.zones.clusters.list
       v1/projects/{projectId}/zones/{zone}/clusters
       score=33 [spec:container-v1, id:container.projects.zones.clusters.list, resource:clusters, description, path:v1/projects/{projectId}/zones/{zone}/clusters, method:GET]

--- [CLOUDFLARE] Cloudflare — DNS & proxy toward cluster endpoint ---

  Query: "create dns record zone A CNAME proxy" (5 hits)
    1. POST dns-records-for-a-zone-create-dns-record
       zones/{zone_id}/dns_records
       score=57 [id:dns-records-for-a-zone-create-dns-record, description, resource:dns_records, path:zones/{zone_id}/dns_records, param]
    2. GET dns-records-for-a-zone-list-dns-records
       zones/{zone_id}/dns_records
       score=44 [id:dns-records-for-a-zone-list-dns-records, resource:dns_records, description, path:zones/{zone_id}/dns_records, description(partial), param]
    3. GET dns-records-for-a-zone-dns-record-details
       zones/{zone_id}/dns_records/{dns_record_id}
       score=41 [id:dns-records-for-a-zone-dns-record-details, description, path:zones/{zone_id}/dns_records/{dns_record_id}, param]
    4. PUT dns-records-for-a-zone-update-dns-record
       zones/{zone_id}/dns_records/{dns_record_id}
       score=41 [id:dns-records-for-a-zone-update-dns-record, description, path:zones/{zone_id}/dns_records/{dns_record_id}, param]
    5. PATCH dns-records-for-a-zone-patch-dns-record
       zones/{zone_id}/dns_records/{dns_record_id}
       score=41 [id:dns-records-for-a-zone-patch-dns-record, description, path:zones/{zone_id}/dns_records/{dns_record_id}, param]

  Query: "list dns records filter name content" (5 hits)
    1. GET dns-records-for-a-zone-list-dns-records
       zones/{zone_id}/dns_records
       score=50 [id:dns-records-for-a-zone-list-dns-records, description, resource:dns_records, path:zones/{zone_id}/dns_records, param]
    2. GET web3-hostname-ipfs-universal-path-gateway-content-list-details
       zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list
       score=45 [id:web3-hostname-ipfs-universal-path-gateway-content-list-details, resource:content_list, description, path:zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list]
    3. PUT web3-hostname-update-ipfs-universal-path-gateway-content-list
       zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list
       score=45 [id:web3-hostname-update-ipfs-universal-path-gateway-content-list, resource:content_list, description, path:zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list]
    4. GET web3-hostname-ipfs-universal-path-gateway-content-list-entry-details
       zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list/entries/{content_list_entry_identifier}
       score=39 [id:web3-hostname-ipfs-universal-path-gateway-content-list-entry-details, description, path:zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list/entries/{content_list_entry_identifier}, param]
    5. PUT web3-hostname-edit-ipfs-universal-path-gateway-content-list-entry
       zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list/entries/{content_list_entry_identifier}
       score=39 [id:web3-hostname-edit-ipfs-universal-path-gateway-content-list-entry, description, path:zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list/entries/{content_list_entry_identifier}, param]

  Query: "load balancer pool origin health check" (5 hits)
    1. GET account-load-balancer-pools-pool-health-details
       accounts/{account_id}/load_balancers/pools/{pool_id}/health
       score=51 [id:account-load-balancer-pools-pool-health-details, path:accounts/{account_id}/load_balancers/pools/{pool_id}/health, description, param, resource:health]
    2. GET load-balancer-pools-pool-health-details
       user/load_balancers/pools/{pool_id}/health
       score=51 [id:load-balancer-pools-pool-health-details, path:user/load_balancers/pools/{pool_id}/health, description, param, resource:health]
    3. POST diagnostics-endpoint-healthcheck-create
       accounts/{account_id}/diagnostics/endpoint-healthchecks
       score=36 [id:diagnostics-endpoint-healthcheck-create, resource:endpoint-healthchecks, description, path:accounts/{account_id}/diagnostics/endpoint-healthchecks]
    4. POST account-load-balancer-pools-create-pool
       accounts/{account_id}/load_balancers/pools
       score=36 [id:account-load-balancer-pools-create-pool, path:accounts/{account_id}/load_balancers/pools, resource:pools, description]
    5. POST load-balancer-pools-create-pool
       user/load_balancers/pools
       score=36 [id:load-balancer-pools-create-pool, path:user/load_balancers/pools, resource:pools, description]

--- [CLOUDFLARE] Cloudflare — caching / performance for HTTP(S) to origin ---

  Query: "cache rules cache reserve ttl bypass" (5 hits)
    1. GET zone-cache-settings-get-cache-reserve-setting
       zones/{zone_id}/cache/cache_reserve
       score=54 [id:zone-cache-settings-get-cache-reserve-setting, resource:cache_reserve, description, path:zones/{zone_id}/cache/cache_reserve]
    2. PATCH zone-cache-settings-change-cache-reserve-setting
       zones/{zone_id}/cache/cache_reserve
       score=54 [id:zone-cache-settings-change-cache-reserve-setting, resource:cache_reserve, description, path:zones/{zone_id}/cache/cache_reserve]
    3. GET zone-cache-settings-get-cache-reserve-clear
       zones/{zone_id}/cache/cache_reserve_clear
       score=54 [id:zone-cache-settings-get-cache-reserve-clear, resource:cache_reserve_clear, description, path:zones/{zone_id}/cache/cache_reserve_clear]
    4. POST zone-cache-settings-start-cache-reserve-clear
       zones/{zone_id}/cache/cache_reserve_clear
       score=54 [id:zone-cache-settings-start-cache-reserve-clear, resource:cache_reserve_clear, description, path:zones/{zone_id}/cache/cache_reserve_clear]
    5. GET smart-shield-settings-get-cache-reserve-clear
       zones/{zone_id}/smart_shield/cache_reserve_clear
       score=54 [id:smart-shield-settings-get-cache-reserve-clear, resource:cache_reserve_clear, description, path:zones/{zone_id}/smart_shield/cache_reserve_clear]

  Query: "zone settings cache always online" (5 hits)
    1. GET zone-cache-settings-get-cache-reserve-setting
       zones/{zone_id}/cache/cache_reserve
       score=35 [id:zone-cache-settings-get-cache-reserve-setting, path:zones/{zone_id}/cache/cache_reserve, param, resource:cache_reserve, description]
    2. PATCH zone-cache-settings-change-cache-reserve-setting
       zones/{zone_id}/cache/cache_reserve
       score=35 [id:zone-cache-settings-change-cache-reserve-setting, path:zones/{zone_id}/cache/cache_reserve, param, resource:cache_reserve, description]
    3. GET zone-cache-settings-get-cache-reserve-clear
       zones/{zone_id}/cache/cache_reserve_clear
       score=35 [id:zone-cache-settings-get-cache-reserve-clear, path:zones/{zone_id}/cache/cache_reserve_clear, param, resource:cache_reserve_clear, description]
    4. POST zone-cache-settings-start-cache-reserve-clear
       zones/{zone_id}/cache/cache_reserve_clear
       score=35 [id:zone-cache-settings-start-cache-reserve-clear, path:zones/{zone_id}/cache/cache_reserve_clear, param, resource:cache_reserve_clear, description]
    5. GET zone-cache-settings-get-regional-tiered-cache-setting
       zones/{zone_id}/cache/regional_tiered_cache
       score=35 [id:zone-cache-settings-get-regional-tiered-cache-setting, path:zones/{zone_id}/cache/regional_tiered_cache, param, resource:regional_tiered_cache, description]

--- [JIRA] Jira — issue tracking for multi-cloud work ---

  Query: "create issue project fields summary" (5 hits)
    1. GET com.atlassian.jira.rest.v2.issue.IssueResource.getCreateIssueMeta_get
       rest/api/3/issue/createmeta
       score=35 [id:com.atlassian.jira.rest.v2.issue.IssueResource.getCreateIssueMeta_get, resource:createmeta, description, path:rest/api/3/issue/createmeta, param]
    2. POST com.atlassian.jira.rest.v2.issue.ProjectResource.createProject_post
       rest/api/3/project
       score=34 [id:com.atlassian.jira.rest.v2.issue.ProjectResource.createProject_post, description, resource:project, path:rest/api/3/project]
    3. POST com.atlassian.jira.rest.v2.issue.ProjectCategoryResource.createProjectCategory_post
       rest/api/3/projectCategory
       score=34 [id:com.atlassian.jira.rest.v2.issue.ProjectCategoryResource.createProjectCategory_post, description, resource:projectCategory, path:rest/api/3/projectCategory]
    4. GET com.atlassian.jira.rest.v2.issue.ProjectIssueSecurityLevelSchemeResource.getIssueSecurityScheme_get
       rest/api/3/project/{projectKeyOrId}/issuesecuritylevelscheme
       score=33 [id:com.atlassian.jira.rest.v2.issue.ProjectIssueSecurityLevelSchemeResource.getIssueSecurityScheme_get, resource:issuesecuritylevelscheme, description, path:rest/api/3/project/{projectKeyOrId}/issuesecuritylevelscheme, param]
    5. POST com.atlassian.jira.rest.v2.issue.IssueResource.createIssue_post
       rest/api/3/issue
       score=28 [id:com.atlassian.jira.rest.v2.issue.IssueResource.createIssue_post, description, resource:issue, path:rest/api/3/issue]

  Query: "assign issue accountId assignee" (5 hits)
    1. PUT com.atlassian.jira.rest.v2.issue.IssueResource.assignIssue_put
       rest/api/3/issue/{issueIdOrKey}/assignee
       score=41 [id:com.atlassian.jira.rest.v2.issue.IssueResource.assignIssue_put, resource:assignee, description, path:rest/api/3/issue/{issueIdOrKey}/assignee, param]
    2. GET com.atlassian.jira.rest.v2.issue.UserResource.findAssignableUsers_get
       rest/api/3/user/assignable/search
       score=21 [id:com.atlassian.jira.rest.v2.issue.UserResource.findAssignableUsers_get, description(partial), path:rest/api/3/user/assignable/search, param]
    3. DELETE com.atlassian.jira.rest.v2.issue.field.IssueFieldOptionResource.replaceIssueFieldOption_delete
       rest/api/3/field/{fieldKey}/option/{optionId}/issue
       score=18 [id:com.atlassian.jira.rest.v2.issue.field.IssueFieldOptionResource.replaceIssueFieldOption_delete, resource:issue, description, path:rest/api/3/field/{fieldKey}/option/{optionId}/issue]
    4. POST com.atlassian.jira.rest.v2.issue.IssueResource.createIssue_post
       rest/api/3/issue
       score=18 [id:com.atlassian.jira.rest.v2.issue.IssueResource.createIssue_post, resource:issue, description, path:rest/api/3/issue]
    5. POST com.atlassian.jira.rest.v2.issue.LinkIssueResource.linkIssues_post
       rest/api/3/issueLink
       score=18 [id:com.atlassian.jira.rest.v2.issue.LinkIssueResource.linkIssues_post, resource:issueLink, description, path:rest/api/3/issueLink]

  Query: "edit issue labels duedate priority" (5 hits)
    1. GET com.atlassian.jira.rest.v2.issue.IssueResource.getEditIssueMeta_get
       rest/api/3/issue/{issueIdOrKey}/editmeta
       score=35 [id:com.atlassian.jira.rest.v2.issue.IssueResource.getEditIssueMeta_get, resource:editmeta, description, path:rest/api/3/issue/{issueIdOrKey}/editmeta, param]
    2. PUT com.atlassian.jira.rest.v2.issue.IssueResource.editIssue_put
       rest/api/3/issue/{issueIdOrKey}
       score=27 [id:com.atlassian.jira.rest.v2.issue.IssueResource.editIssue_put, description, param, path:rest/api/3/issue/{issueIdOrKey}]
    3. GET com.atlassian.jira.rest.v2.issue.PriorityResource.getPriorities_get
       rest/api/3/priority
       score=20 [id:com.atlassian.jira.rest.v2.issue.PriorityResource.getPriorities_get, resource:priority, path:rest/api/3/priority]
    4. GET com.atlassian.jira.rest.v2.issue.PriorityResource.getPriority_get
       rest/api/3/priority/{id}
       score=19 [id:com.atlassian.jira.rest.v2.issue.PriorityResource.getPriority_get, description, path:rest/api/3/priority/{id}]
    5. GET com.atlassian.jira.rest.v2.issue.field.IssueFieldOptionResource.getSelectableIssueFieldOptions_get
       rest/api/3/field/{fieldKey}/option/suggestions/edit
       score=18 [resource:edit, path:rest/api/3/field/{fieldKey}/option/suggestions/edit, id:com.atlassian.jira.rest.v2.issue.field.IssueFieldOptionResource.getSelectableIssueFieldOptions_get, description]

  Query: "get create issue metadata createmeta" (5 hits)
    1. GET com.atlassian.jira.rest.v2.issue.IssueResource.getCreateIssueMeta_get
       rest/api/3/issue/createmeta
       score=58 [id:com.atlassian.jira.rest.v2.issue.IssueResource.getCreateIssueMeta_get, method:GET, description, resource:createmeta, path:rest/api/3/issue/createmeta, param]
    2. GET com.atlassian.jira.rest.v2.issue.IssueResource.getEditIssueMeta_get
       rest/api/3/issue/{issueIdOrKey}/editmeta
       score=32 [id:com.atlassian.jira.rest.v2.issue.IssueResource.getEditIssueMeta_get, method:GET, description, path:rest/api/3/issue/{issueIdOrKey}/editmeta, param]
    3. GET com.atlassian.jira.rest.v2.issue.IssueLinkTypeResource.getIssueLinkTypes_get
       rest/api/3/issueLinkType
       score=31 [id:com.atlassian.jira.rest.v2.issue.IssueLinkTypeResource.getIssueLinkTypes_get, method:GET, description, resource:issueLinkType, path:rest/api/3/issueLinkType]
    4. GET com.atlassian.jira.rest.v2.issue.IssueSecuritySchemeResource.getIssueSecuritySchemes_get
       rest/api/3/issuesecurityschemes
       score=31 [id:com.atlassian.jira.rest.v2.issue.IssueSecuritySchemeResource.getIssueSecuritySchemes_get, method:GET, description, resource:issuesecurityschemes, path:rest/api/3/issuesecurityschemes]
    5. GET com.atlassian.jira.rest.v2.issue.IssueTypeResource.getIssueAllTypes_get
       rest/api/3/issuetype
       score=31 [id:com.atlassian.jira.rest.v2.issue.IssueTypeResource.getIssueAllTypes_get, method:GET, description, resource:issuetype, path:rest/api/3/issuetype]

Wrote structured report: /Users/danielsmith/ClawQL/docs/workflow-multi-provider-latest.json

--- Jira draft (summary) ---
[Multi-cloud] GKE + Cloudflare DNS/caching — API requests & rollout tracking

--- Jira draft (description, full) ---
## Goal
Document the REST/API work to: (1) stand up GKE and deploy a service, (2) expose it in a way compatible with Cloudflare source IPs (https://www.cloudflare.com/ips/ (publish IPv4/IPv6 ranges; use on GCP firewall / load balancer allowlists as needed).), (3) point Cloudflare DNS at the cluster/LB endpoint with appropriate caching.

## Due date
2026-03-27 (next Friday, UTC date used for API fields).

## Google Cloud (GKE / networking) — candidate operations (from ClawQL search)
- `POST` redis.projects.locations.clusters.create — `v1/projects/{projectsId}/locations/{locationsId}/clusters`
- `POST` bigtableadmin.projects.instances.clusters.create — `v2/projects/{projectsId}/instances/{instancesId}/clusters`
- `POST` container.projects.locations.clusters.create — `v1/projects/{projectsId}/locations/{locationsId}/clusters`
- `POST` container.projects.zones.clusters.create — `v1/projects/{projectId}/zones/{zone}/clusters`
- `DELETE` container.projects.zones.clusters.delete — `v1/projects/{projectId}/zones/{zone}/clusters/{clusterId}`
- `POST` clouddeploy.projects.locations.deployPolicies.create — `v1/projects/{projectsId}/locations/{locationsId}/deployPolicies`
- `GET` clouddeploy.projects.locations.deployPolicies.list — `v1/projects/{projectsId}/locations/{locationsId}/deployPolicies`
- `GET` compute.images.get — `projects/{project}/global/images/{image}`
- `DELETE` compute.images.delete — `projects/{project}/global/images/{image}`
- `POST` compute.images.deprecate — `projects/{project}/global/images/{image}/deprecate`
- `POST` servicecontrol.services.check — `v1/services/{serviceName}:check`
- `POST` servicecontrol.services.report — `v1/services/{serviceName}:report`

## Cloudflare — candidate operations
- `POST` dns-records-for-a-zone-create-dns-record — `zones/{zone_id}/dns_records`
- `GET` dns-records-for-a-zone-list-dns-records — `zones/{zone_id}/dns_records`
- `GET` dns-records-for-a-zone-dns-record-details — `zones/{zone_id}/dns_records/{dns_record_id}`
- `PUT` dns-records-for-a-zone-update-dns-record — `zones/{zone_id}/dns_records/{dns_record_id}`
- `PATCH` dns-records-for-a-zone-patch-dns-record — `zones/{zone_id}/dns_records/{dns_record_id}`
- `GET` web3-hostname-ipfs-universal-path-gateway-content-list-details — `zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list`
- `PUT` web3-hostname-update-ipfs-universal-path-gateway-content-list — `zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list`
- `GET` web3-hostname-ipfs-universal-path-gateway-content-list-entry-details — `zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list/entries/{content_list_entry_identifier}`
- `PUT` web3-hostname-edit-ipfs-universal-path-gateway-content-list-entry — `zones/{zone_id}/web3/hostnames/{identifier}/ipfs_universal_path/content_list/entries/{content_list_entry_identifier}`
- `GET` account-load-balancer-pools-pool-health-details — `accounts/{account_id}/load_balancers/pools/{pool_id}/health`
- `GET` load-balancer-pools-pool-health-details — `user/load_balancers/pools/{pool_id}/health`
- `POST` diagnostics-endpoint-healthcheck-create — `accounts/{account_id}/diagnostics/endpoint-healthchecks`

## Jira — candidate operations
- `GET` com.atlassian.jira.rest.v2.issue.IssueResource.getCreateIssueMeta_get — `rest/api/3/issue/createmeta`
- `POST` com.atlassian.jira.rest.v2.issue.ProjectResource.createProject_post — `rest/api/3/project`
- `POST` com.atlassian.jira.rest.v2.issue.ProjectCategoryResource.createProjectCategory_post — `rest/api/3/projectCategory`
- `GET` com.atlassian.jira.rest.v2.issue.ProjectIssueSecurityLevelSchemeResource.getIssueSecurityScheme_get — `rest/api/3/project/{projectKeyOrId}/issuesecuritylevelscheme`
- `POST` com.atlassian.jira.rest.v2.issue.IssueResource.createIssue_post — `rest/api/3/issue`
- `PUT` com.atlassian.jira.rest.v2.issue.IssueResource.assignIssue_put — `rest/api/3/issue/{issueIdOrKey}/assignee`
- `GET` com.atlassian.jira.rest.v2.issue.UserResource.findAssignableUsers_get — `rest/api/3/user/assignable/search`
- `DELETE` com.atlassian.jira.rest.v2.issue.field.IssueFieldOptionResource.replaceIssueFieldOption_delete — `rest/api/3/field/{fieldKey}/option/{optionId}/issue`

## Notes
- Use GCP firewall / LB allowlists with Cloudflare published IP ranges where you intend to restrict ingress.
- Cloudflare: configure DNS (proxied/orange-cloud) and cache rules appropriate for your API vs static assets.
- Validate Jira `createmeta` for required fields before POST /rest/api/3/issue.

--- Jira API ---
{
  "skipped": true,
  "reason": "Set WORKFLOW_CREATE_JIRA_ISSUE=1 to POST to Jira"
}
{
  "ok": true,
  "exit": "success",
  "reportPath": "/Users/danielsmith/ClawQL/docs/workflow-multi-provider-latest.json",
  "mergedOperationCount": 7174,
  "jira": {
    "skipped": true,
    "reason": "Set WORKFLOW_CREATE_JIRA_ISSUE=1 to POST to Jira"
  }
}
