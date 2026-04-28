/**
 * Shared step definitions for the complex release-stack scenario (search queries per vendor).
 * Used by `scripts/workflows/workflow-complex-release-stack.mjs` (in-process) and
 * `scripts/workflows/mcp-workflow-complex-release-stack.mjs` (real MCP search + execute).
 */

/** Ordered steps: each runs `search` with queries on that provider's spec. */
export const COMPLEX_RELEASE_STACK_WORKFLOW = [
  {
    provider: "google",
    title: "Google — GKE cluster & workload",
    queries: [
      "create kubernetes cluster container.googleapis.com regional",
      "node pool create autoscaling kubernetes engine",
      "deploy workload deployment rolling update kubernetes",
    ],
  },
  {
    provider: "google",
    title: "Google — Service (expose deployment) & firewall for Cloudflare IPs",
    queries: [
      "kubernetes service type load balancer external IP",
      "compute firewall rule create allow tcp source range ingress",
      "network endpoint group kubernetes ingress",
    ],
  },
  {
    provider: "cloudflare",
    title: "Cloudflare — DNS to GKE / LB origin",
    queries: [
      "dns record create zone A CNAME proxied",
      "zone details get",
    ],
  },
  {
    provider: "cloudflare",
    title: "Cloudflare — caching / edge to reduce origin load",
    queries: [
      "cache rules configuration",
      "zone settings cache level",
      "tiered cache smart topology",
    ],
  },
  {
    provider: "sentry",
    title: "Sentry — org/project/DSN & releases (GKE workload)",
    queries: [
      "create project organization",
      "dsn key client key",
      "release create deploy",
    ],
  },
  {
    provider: "github",
    title: "GitHub Actions — build image & deploy to GKE on schedule",
    queries: [
      "create workflow dispatch repository",
      "repository secrets actions",
      "cron schedule workflow yaml",
    ],
  },
  {
    provider: "slack",
    title: "Slack — notify release channel per pipeline step",
    queries: [
      "chat.postMessage channel",
      "conversations.history channel",
      "slack incoming webhook url",
    ],
  },
  {
    provider: "n8n",
    title: "n8n — automation (e.g. GitHub release from Slack trigger)",
    queries: [
      "create workflow",
      "activate workflow",
      "n8n retrieve workflow executions",
    ],
  },
  {
    provider: "bitbucket",
    title: "Bitbucket — repos & Pipelines (optional mirror to GitHub flow)",
    queries: [
      "repository create project",
      "pipeline run commit",
      "pull request create",
    ],
  },
  {
    provider: "jira",
    title: "Jira — track rollout (issue fields, assignee, labels)",
    queries: [
      "create issue rest api",
      "edit issue labels priority duedate",
      "assign issue accountId",
    ],
  },
];
