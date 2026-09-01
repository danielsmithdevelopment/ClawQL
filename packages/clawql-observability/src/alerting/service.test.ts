import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  alertsFromHealthSnapshotEffect,
  parseAlertRulesYamlEffect,
  summarizeAlertRulesEffect,
} from "./service.js";

describe("observability alerting", () => {
  it("parses packaged-style alert rules YAML", async () => {
    const rules = await Effect.runPromise(
      parseAlertRulesYamlEffect(`
groups:
  - name: clawql-observability
    rules:
      - alert: HighFrontendErrorRate
        expr: sum(rate({app="frontend"}[5m])) > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: Elevated frontend error rate
`)
    );
    expect(rules.groups).toHaveLength(1);
    expect(rules.groups[0]?.rules[0]?.alert).toBe("HighFrontendErrorRate");
    expect(rules.groups[0]?.rules[0]?.labels?.severity).toBe("warning");
  });

  it("maps down providers to critical health alerts", async () => {
    const events = await Effect.runPromise(
      alertsFromHealthSnapshotEffect({
        checkedAt: "2026-09-01T00:00:00.000Z",
        providers: [
          {
            signalType: "log",
            providerId: "lgtm-loki",
            name: "Loki",
            enabled: true,
            health: { status: "down", details: "unreachable" },
          },
        ],
      })
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.alert).toBe("ObservabilityProviderDown");
    expect(events[0]?.severity).toBe("critical");
  });

  it("summarizes rule catalog events", async () => {
    const events = await Effect.runPromise(
      summarizeAlertRulesEffect({
        groups: [
          {
            name: "g",
            rules: [
              {
                alert: "UnexpectedAgentToolUse",
                expr: "up == 0",
                labels: { severity: "critical" },
                annotations: { summary: "tool deny" },
              },
            ],
          },
        ],
      })
    );
    expect(events[0]?.source).toBe("rule");
    expect(events[0]?.alert).toBe("UnexpectedAgentToolUse");
  });
});
