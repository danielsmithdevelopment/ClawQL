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
