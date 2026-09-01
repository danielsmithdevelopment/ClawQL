# Matomo Grafana data source

For **Matomo**, use the official [Grafana Labs Matomo data source plugin](https://grafana.com/grafana/plugins/grafana-matomo-datasource/) — no custom exporter is required in `clawql-analytics`.

Point the plugin at the Matomo instance managed through your ClawQL deployment (self-hosted or cloud). Aggregate dashboards in Grafana then sit alongside the rest of the LGTMP stack from `clawql-observability`.

PostHog, Plausible, and Umami do not ship native Grafana plugins; use `custom-exporter.ts` (Phase 4) for Prometheus-scrapeable aggregate metrics only.
