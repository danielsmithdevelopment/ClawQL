{{- define "clawql-falco.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-falco.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "clawql-falco.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "clawql-falco.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "clawql-falco.labels" -}}
helm.sh/chart: {{ include "clawql-falco.chart" . }}
{{ include "clawql-falco.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
clawql.io/component: falco-prometheus-rules
{{- end }}

{{- define "clawql-falco.selectorLabels" -}}
app.kubernetes.io/name: {{ include "clawql-falco.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
