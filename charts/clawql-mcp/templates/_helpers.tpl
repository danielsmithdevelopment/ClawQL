{{- define "clawql-mcp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "clawql-mcp.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "clawql-mcp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.labels" -}}
helm.sh/chart: {{ include "clawql-mcp.chart" . }}
{{ include "clawql-mcp.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "clawql-mcp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "clawql-mcp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "clawql-mcp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "clawql-mcp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "clawql-mcp.workflowNamespaceList" -}}
{{- if .Values.workflow.namespaceAllowlist -}}
{{- .Values.workflow.namespaceAllowlist | join "," -}}
{{- else -}}
{{- .Release.Namespace -}}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.workflowDefaultNamespace" -}}
{{- if .Values.workflow.defaultNamespace -}}
{{- .Values.workflow.defaultNamespace -}}
{{- else if .Values.workflow.namespaceAllowlist -}}
{{- index .Values.workflow.namespaceAllowlist 0 -}}
{{- else -}}
{{- .Release.Namespace -}}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.argocdNamespaceList" -}}
{{- if .Values.argocd.namespaceAllowlist -}}
{{- .Values.argocd.namespaceAllowlist | join "," -}}
{{- else -}}
argocd
{{- end -}}
{{- end }}

{{- define "clawql-mcp.argocdDefaultNamespace" -}}
{{- if .Values.argocd.defaultNamespace -}}
{{- .Values.argocd.defaultNamespace -}}
{{- else if .Values.argocd.namespaceAllowlist -}}
{{- index .Values.argocd.namespaceAllowlist 0 -}}
{{- else -}}
argocd
{{- end -}}
{{- end }}

{{- define "clawql-mcp.uiName" -}}
{{- printf "%s-ui" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.dashboardName" -}}
{{- printf "%s-dashboard" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.ouroborosPostgresName" -}}
{{- printf "%s-ouroboros-postgres" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.ouroborosPostgresSecretName" -}}
{{- if .Values.ouroborosPostgres.auth.existingSecret -}}
{{- .Values.ouroborosPostgres.auth.existingSecret | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- printf "%s-ouroboros-postgres-auth" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.tikaName" -}}
{{- printf "%s-tika" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.gotenbergName" -}}
{{- printf "%s-gotenberg" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.stirlingName" -}}
{{- printf "%s-stirling" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.paperlessName" -}}
{{- printf "%s-paperless" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.nextcloudName" -}}
{{- printf "%s-nextcloud" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.coneshareName" -}}
{{- printf "%s-coneshare" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.idpCollaborationSecretName" -}}
{{- printf "%s-idp-collaboration" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.storesPostgresName" -}}
{{- printf "%s-postgres" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.storesDragonflyName" -}}
{{- printf "%s-dragonfly" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Istio egress DNS name for MCP provider allowlist (#275). */}}
{{- define "clawql-mcp.istioEgressGatewayFqdn" -}}
{{- printf "%s.%s.svc.cluster.local" .Values.istio.egressAllowlist.egressGatewayServiceName .Values.istio.egressAllowlist.egressGatewayNamespace }}
{{- end }}

{{- define "clawql-mcp.flinkName" -}}
{{- printf "%s-flink" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.openclawDeploymentName" -}}
{{- printf "%s-openclaw" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.openclawSecretName" -}}
{{- if .Values.openclaw.existingSecret }}
{{- .Values.openclaw.existingSecret | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-openclaw-secrets" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "clawql-mcp.openclawConfigMapName" -}}
{{- printf "%s-openclaw-config" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.openclawPvcName" -}}
{{- printf "%s-openclaw-home" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.openclawLabels" -}}
{{ include "clawql-mcp.labels" . }}
app.kubernetes.io/component: openclaw
{{- end }}

{{- define "clawql-mcp.openclawSelectorLabels" -}}
{{ include "clawql-mcp.selectorLabels" . }}
app.kubernetes.io/component: openclaw
{{- end }}

{{/* In-cluster Streamable HTTP MCP URL for OpenClaw (mcp.servers). Honors mcpProxy when enabled. */}}
{{- define "clawql-mcp.openclawClawqlMcpUrl" -}}
{{- if .Values.openclaw.clawqlMcp.url -}}
{{- .Values.openclaw.clawqlMcp.url -}}
{{- else if .Values.mcpProxy.enabled -}}
{{- printf "http://%s.%s.svc.cluster.local:%v%s" (include "clawql-mcp.mcpProxyName" .) .Release.Namespace (.Values.mcpProxy.service.http.port | int) .Values.mcpPath -}}
{{- else -}}
{{- printf "http://%s.%s.svc.cluster.local:%v%s" (include "clawql-mcp.fullname" .) .Release.Namespace (.Values.service.http.port | int) .Values.mcpPath -}}
{{- end -}}
{{- end }}

{{/* Dashboard Agent Chat → OpenClaw chat-bridge HTTP endpoint (POST /v1/chat). */}}
{{- define "clawql-mcp.openclawChatBridgeUrl" -}}
{{- printf "http://%s.%s.svc.cluster.local:%v/v1/chat" (include "clawql-mcp.openclawDeploymentName" .) .Release.Namespace (.Values.openclaw.chatBridge.port | int) -}}
{{- end }}

{{/* In-cluster ClawQL MCP URL for Goose (CLAWQL_MCP_URL). */}}
{{- define "clawql-mcp.gooseClawqlMcpUrl" -}}
{{- if .Values.goose.clawqlMcp.url -}}
{{- .Values.goose.clawqlMcp.url -}}
{{- else if .Values.mcpProxy.enabled -}}
{{- printf "http://%s.%s.svc.cluster.local:%v%s" (include "clawql-mcp.mcpProxyName" .) .Release.Namespace (.Values.mcpProxy.service.http.port | int) .Values.mcpPath -}}
{{- else -}}
{{- printf "http://%s.%s.svc.cluster.local:%v%s" (include "clawql-mcp.fullname" .) .Release.Namespace (.Values.service.http.port | int) .Values.mcpPath -}}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.gooseDeploymentName" -}}
{{- printf "%s-goose" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.gooseSecretName" -}}
{{- if .Values.goose.existingSecret }}
{{- .Values.goose.existingSecret | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-goose-secrets" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "clawql-mcp.goosePvcName" -}}
{{- printf "%s-goose-state" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.gooseLabels" -}}
{{ include "clawql-mcp.labels" . }}
app.kubernetes.io/component: goose
{{- end }}

{{- define "clawql-mcp.gooseSelectorLabels" -}}
{{ include "clawql-mcp.selectorLabels" . }}
app.kubernetes.io/component: goose
{{- end }}

{{/* Resolved dashboard OpenClaw chat URL: explicit value or auto from openclaw chat bridge. */}}
{{- define "clawql-mcp.dashboardOpenclawChatUrl" -}}
{{- if .Values.dashboard.openclawChatUrl -}}
{{- .Values.dashboard.openclawChatUrl -}}
{{- else if and .Values.openclaw.enabled .Values.openclaw.chatBridge.enabled -}}
{{- include "clawql-mcp.openclawChatBridgeUrl" . -}}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.flinkJobManagerName" -}}
{{- printf "%s-jobmanager" (include "clawql-mcp.flinkName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.flinkTaskManagerName" -}}
{{- printf "%s-taskmanager" (include "clawql-mcp.flinkName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.flinkConnectorSecretName" -}}
{{- if .Values.flink.connectorSecret -}}
{{- .Values.flink.connectorSecret | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- printf "%s-connectors" (include "clawql-mcp.flinkName" .) | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.natsName" -}}
{{- printf "%s-nats" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.natsConfigName" -}}
{{- printf "%s-config" (include "clawql-mcp.natsName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.natsWorkerName" -}}
{{- printf "%s-nats-worker" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.natsMonitoringEndpoint" -}}
{{- printf "%s:%d" (include "clawql-mcp.natsName" .) (.Values.nats.service.monitorPort | int) }}
{{- end }}

{{- define "clawql-mcp.natsJetStreamStream" -}}
{{- default "CLAWQL_WORKFLOW" .Values.nats.keda.stream }}
{{- end }}

{{- define "clawql-mcp.natsJetStreamConsumer" -}}
{{- default "clawql-hitl-resume" .Values.nats.keda.consumer }}
{{- end }}

{{- define "clawql-mcp.natsConfigured" -}}
{{- if or .Values.nats.enabled .Values.nats.url }}1{{- end }}
{{- end }}

{{- define "clawql-mcp.onyxName" -}}
{{- printf "%s-onyx" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.onyxPostgresName" -}}
{{- printf "%s-onyx-postgres" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.onyxPostgresSecretName" -}}
{{- if .Values.onyx.postgres.auth.existingSecret -}}
{{- .Values.onyx.postgres.auth.existingSecret | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- printf "%s-onyx-postgres-auth" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.onyxDragonflyName" -}}
{{- printf "%s-onyx-dragonfly" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.onyxOpenSearchName" -}}
{{- printf "%s-onyx-opensearch" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.onyxOpenSearchSecretName" -}}
{{- if .Values.onyx.opensearch.auth.existingSecret -}}
{{- .Values.onyx.opensearch.auth.existingSecret | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- printf "%s-onyx-opensearch-auth" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.onyxVespaName" -}}
{{- printf "%s-onyx-vespa" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.onyxMinioName" -}}
{{- printf "%s-onyx-minio" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.onyxMinioSecretName" -}}
{{- if .Values.onyx.minio.auth.existingSecret -}}
{{- .Values.onyx.minio.auth.existingSecret | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- printf "%s-onyx-minio-auth" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.onyxInferenceModelName" -}}
{{- printf "%s-onyx-model-infer" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.onyxIndexingModelName" -}}
{{- printf "%s-onyx-model-index" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.onyxBackgroundName" -}}
{{- printf "%s-onyx-background" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.storesPostgresSecretName" -}}
{{- if .Values.stores.postgres.auth.existingSecret -}}
{{- .Values.stores.postgres.auth.existingSecret | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- printf "%s-postgres-auth" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end }}

{{- define "clawql-mcp.documentPipelineSecretName" -}}
{{- if .Values.documentPipeline.paperless.auth.existingSecret -}}
{{- .Values.documentPipeline.paperless.auth.existingSecret | trunc 63 | trimSuffix "-" }}
{{- else if .Values.documentPipeline.stirling.auth.existingSecret -}}
{{- .Values.documentPipeline.stirling.auth.existingSecret | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- printf "%s-doc-pipeline-auth" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end }}

{{/* Optional MCP proxy / chokepoint (nginx or custom gateway) in front of the main MCP Service. */}}
{{- define "clawql-mcp.mcpProxyName" -}}
{{- printf "%s-proxy" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Optional annotations under each Onyx stack Pod template.metadata (e.g. Istio ambient: disable legacy sidecar injection). */}}
{{- define "clawql-mcp.onyxPodTemplateAnnotations" -}}
{{- with .Values.onyx.podAnnotations }}
annotations:
{{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}
