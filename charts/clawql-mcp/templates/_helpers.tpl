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

{{- define "clawql-mcp.uiName" -}}
{{- printf "%s-ui" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
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

{{- define "clawql-mcp.storesPostgresName" -}}
{{- printf "%s-postgres" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.storesRedisName" -}}
{{- printf "%s-redis" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-mcp.flinkName" -}}
{{- printf "%s-flink" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
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

{{- define "clawql-mcp.onyxRedisName" -}}
{{- printf "%s-onyx-cache" (include "clawql-mcp.fullname" .) | trunc 63 | trimSuffix "-" }}
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
