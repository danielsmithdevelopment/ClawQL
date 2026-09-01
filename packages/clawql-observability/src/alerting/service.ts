/**
 * Phase 5 — alerting consumes health + federation (registry design §13),
 * not a duplicate provider list. Evaluates packaged alert rules catalog
 * and health snapshots into structured alert events.
 */

import { readFile } from "node:fs/promises";

import { Context, Effect, Layer, Ref } from "effect";

import { ObservabilityError } from "../errors.js";
import {
  ObservabilityHealthService,
  type ObservabilityHealthSnapshot,
} from "../health/scheduler.js";
import { packagePaths } from "../paths.js";

export type ObservabilityAlertSeverity = "info" | "warning" | "critical";

export type ObservabilityAlertEvent = {
  readonly alert: string;
  readonly severity: ObservabilityAlertSeverity;
  readonly summary: string;
  readonly firedAt: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly source: "health" | "rule";
};

export type ObservabilityAlertRule = {
  readonly alert: string;
  readonly expr: string;
  readonly for?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly annotations?: Readonly<Record<string, string>>;
};

export type ObservabilityAlertRulesFile = {
  readonly groups: readonly {
    readonly name: string;
    readonly rules: readonly ObservabilityAlertRule[];
  }[];
};

export class ObservabilityAlertingService extends Context.Tag(
  "clawql/ObservabilityAlertingService"
)<
  ObservabilityAlertingService,
  {
    readonly loadRules: () => Effect.Effect<ObservabilityAlertRulesFile, ObservabilityError>;
    readonly evaluateHealth: () => Effect.Effect<
      readonly ObservabilityAlertEvent[],
      ObservabilityError,
      ObservabilityHealthService
    >;
    readonly getLastEvents: () => Effect.Effect<readonly ObservabilityAlertEvent[]>;
  }
>() {}

const severityFromLabels = (
  labels: Readonly<Record<string, string>> | undefined
): ObservabilityAlertSeverity => {
  const raw = labels?.severity?.toLowerCase();
  if (raw === "critical" || raw === "warning" || raw === "info") return raw;
  return "warning";
};

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

/** Minimal YAML subset parser for packaged alert rules (avoids a yaml dependency). */
export const parseAlertRulesYamlEffect = (
  text: string
): Effect.Effect<ObservabilityAlertRulesFile, ObservabilityError> =>
  Effect.try({
    try: () => {
      const groups: { name: string; rules: ObservabilityAlertRule[] }[] = [];
      let currentGroup: { name: string; rules: ObservabilityAlertRule[] } | null = null;
      type AlertRuleDraft = {
        alert?: string;
        expr?: string;
        for?: string;
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
      };
      let currentRule: AlertRuleDraft | null = null;
      let inLabels = false;
      let inAnnotations = false;

      const flushRule = () => {
        if (currentRule?.alert && currentRule.expr && currentGroup) {
          currentGroup.rules.push({
            alert: currentRule.alert,
            expr: currentRule.expr,
            for: currentRule.for,
            labels: currentRule.labels,
            annotations: currentRule.annotations,
          });
        }
        currentRule = null;
        inLabels = false;
        inAnnotations = false;
      };

      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, "");
        if (!line.trim()) continue;

        const groupMatch = line.match(/^\s*-\s*name:\s*(.+)\s*$/);
        if (groupMatch) {
          flushRule();
          if (currentGroup) groups.push(currentGroup);
          currentGroup = { name: unquote(groupMatch[1]!), rules: [] };
          continue;
        }

        const alertMatch = line.match(/^\s*-\s*alert:\s*(.+)\s*$/);
        if (alertMatch) {
          flushRule();
          currentRule = { alert: unquote(alertMatch[1]!) };
          continue;
        }

        if (!currentRule) continue;

        const exprMatch = line.match(/^\s*expr:\s*(.+)\s*$/);
        if (exprMatch) {
          currentRule.expr = unquote(exprMatch[1]!);
          inLabels = false;
          inAnnotations = false;
          continue;
        }

        const forMatch = line.match(/^\s*for:\s*(.+)\s*$/);
        if (forMatch) {
          currentRule.for = unquote(forMatch[1]!);
          continue;
        }

        if (/^\s*labels:\s*$/.test(line)) {
          inLabels = true;
          inAnnotations = false;
          currentRule.labels = {};
          continue;
        }

        if (/^\s*annotations:\s*$/.test(line)) {
          inAnnotations = true;
          inLabels = false;
          currentRule.annotations = {};
          continue;
        }

        const kvMatch = line.match(/^\s+([A-Za-z0-9_]+):\s*(.+)\s*$/);
        if (kvMatch) {
          const key = kvMatch[1]!;
          const value = unquote(kvMatch[2]!);
          if (inLabels) {
            currentRule.labels = { ...(currentRule.labels ?? {}), [key]: value };
          } else if (inAnnotations) {
            currentRule.annotations = { ...(currentRule.annotations ?? {}), [key]: value };
          }
        }
      }

      flushRule();
      if (currentGroup) groups.push(currentGroup);
      if (groups.length === 0) {
        throw new Error("alert rules YAML missing groups[]");
      }
      return { groups };
    },
    catch: (cause) =>
      new ObservabilityError({
        reason: "failed to parse alert rules YAML",
        cause,
      }),
  });

export const loadObservabilityAlertRulesEffect = (
  rulesPath: string = packagePaths.alerts
): Effect.Effect<ObservabilityAlertRulesFile, ObservabilityError> =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => readFile(rulesPath, "utf8"),
      catch: (cause) =>
        new ObservabilityError({
          reason: `failed to load alert rules from ${rulesPath}`,
          cause,
        }),
    });
    return yield* parseAlertRulesYamlEffect(text);
  });

/** Map unhealthy providers to alert events (health-driven). */
export const alertsFromHealthSnapshotEffect = (
  snapshot: ObservabilityHealthSnapshot
): Effect.Effect<readonly ObservabilityAlertEvent[]> =>
  Effect.sync(() => {
    const firedAt = snapshot.checkedAt;
    const events: ObservabilityAlertEvent[] = [];
    for (const provider of snapshot.providers) {
      if (provider.health.status === "down") {
        events.push({
          alert: "ObservabilityProviderDown",
          severity: "critical",
          summary: `Provider ${provider.providerId} (${provider.signalType}) is down`,
          firedAt,
          labels: {
            severity: "critical",
            provider_id: provider.providerId,
            signal_type: provider.signalType,
          },
          source: "health",
        });
      } else if (provider.health.status === "degraded") {
        events.push({
          alert: "ObservabilityProviderDegraded",
          severity: "warning",
          summary: `Provider ${provider.providerId} (${provider.signalType}) is degraded`,
          firedAt,
          labels: {
            severity: "warning",
            provider_id: provider.providerId,
            signal_type: provider.signalType,
          },
          source: "health",
        });
      }
    }
    return events;
  });

/** Catalog packaged rules for dashboards / MCP (PromQL eval is Grafana/Mimir's job). */
export const summarizeAlertRulesEffect = (
  rules: ObservabilityAlertRulesFile
): Effect.Effect<readonly ObservabilityAlertEvent[]> =>
  Effect.sync(() => {
    const firedAt = new Date().toISOString();
    const events: ObservabilityAlertEvent[] = [];
    for (const group of rules.groups) {
      for (const rule of group.rules) {
        events.push({
          alert: rule.alert,
          severity: severityFromLabels(rule.labels),
          summary: rule.annotations?.summary ?? rule.alert,
          firedAt,
          labels: {
            ...(rule.labels ?? {}),
            group: group.name,
            expr: rule.expr,
          },
          source: "rule",
        });
      }
    }
    return events;
  });

export const makeObservabilityAlertingServiceLayer = (
  rulesPath: string = packagePaths.alerts
): Layer.Layer<ObservabilityAlertingService> =>
  Layer.effect(
    ObservabilityAlertingService,
    Effect.gen(function* () {
      const lastEvents = yield* Ref.make<readonly ObservabilityAlertEvent[]>([]);

      const loadRules = () => loadObservabilityAlertRulesEffect(rulesPath);

      const evaluateHealth = () =>
        Effect.gen(function* () {
          const health = yield* ObservabilityHealthService;
          const snapshot = yield* health.runOnce();
          const healthEvents = yield* alertsFromHealthSnapshotEffect(snapshot);
          const rules = yield* loadRules();
          const ruleCatalog = yield* summarizeAlertRulesEffect(rules);
          const events = [...healthEvents, ...ruleCatalog];
          yield* Ref.set(lastEvents, events);
          return events;
        });

      const getLastEvents = () => Ref.get(lastEvents);

      return { loadRules, evaluateHealth, getLastEvents };
    })
  );
