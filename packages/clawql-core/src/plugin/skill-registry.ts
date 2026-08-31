/**
 * In-memory skill index/content registry (Skills-over-MCP two-tier model).
 */

import { createHash } from "node:crypto";
import { Effect, Layer, Ref } from "effect";
import { ClawQLError } from "../errors/clawql-error.js";
import {
  SkillRegistry,
  type SkillContent,
  type SkillDefinition,
  type SkillIndexEntry,
  type SkillRegisterOptions,
} from "./provider-types.js";

type SkillStore = {
  readonly index: ReadonlyMap<string, SkillIndexEntry>;
  readonly bodies: ReadonlyMap<string, SkillContent>;
  readonly byPlugin: ReadonlyMap<string, readonly string[]>;
};

function emptyStore(): SkillStore {
  return { index: new Map(), bodies: new Map(), byPlugin: new Map() };
}

export function digestSkillContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

function toIndexEntry(
  pluginId: string,
  skill: SkillDefinition,
  options?: SkillRegisterOptions
): SkillIndexEntry {
  const digest = digestSkillContent(skill.content);
  const source = options?.source ?? "standalone";
  return {
    skillId: skill.skillId,
    name: skill.name?.trim() || skill.skillId,
    description: skill.description?.trim() || skill.content.slice(0, 200),
    digest,
    pluginId,
    applicability: skill.applicability ?? "query-matched",
    source,
    ...(source === "provider" && options?.scopeTokens
      ? { scopeTokens: options.scopeTokens }
      : {}),
  };
}

function toContent(pluginId: string, skill: SkillDefinition, digest: string): SkillContent {
  return {
    skillId: skill.skillId,
    pluginId,
    digest,
    body: skill.content,
    purposeTrace: skill.purposeTrace,
  };
}

export const InMemorySkillRegistryLive: Layer.Layer<SkillRegistry> = Layer.effect(
  SkillRegistry,
  Effect.gen(function* () {
    const ref = yield* Ref.make(emptyStore());

    return {
      register: (pluginId, skills, options) =>
        Effect.gen(function* () {
          yield* Ref.update(ref, (store) => {
            const index = new Map(store.index);
            const bodies = new Map(store.bodies);
            const byPlugin = new Map(store.byPlugin);
            const ids: string[] = [];
            for (const skill of skills) {
              if (!skill.skillId.trim()) {
                // skip invalid; caller should validate — keep register total for Effect typing
                continue;
              }
              const entry = toIndexEntry(pluginId, skill, options);
              index.set(skill.skillId, entry);
              bodies.set(skill.skillId, toContent(pluginId, skill, entry.digest));
              ids.push(skill.skillId);
            }
            byPlugin.set(pluginId, ids);
            return { index, bodies, byPlugin };
          });
        }),

      unregisterPlugin: (pluginId) =>
        Effect.gen(function* () {
          yield* Ref.update(ref, (store) => {
            const ids = store.byPlugin.get(pluginId) ?? [];
            const index = new Map(store.index);
            const bodies = new Map(store.bodies);
            const byPlugin = new Map(store.byPlugin);
            for (const id of ids) {
              index.delete(id);
              bodies.delete(id);
            }
            byPlugin.delete(pluginId);
            return { index, bodies, byPlugin };
          });
        }),

      listIndex: () =>
        Effect.gen(function* () {
          const store = yield* Ref.get(ref);
          return [...store.index.values()];
        }),

      getContent: (skillId) =>
        Effect.gen(function* () {
          const store = yield* Ref.get(ref);
          return store.bodies.get(skillId);
        }),
    };
  })
);

/** Fail registration when skillId empty — used by installer after validation. */
export function assertSkillDefinitions(
  skills: readonly SkillDefinition[]
): Effect.Effect<void, ClawQLError> {
  return Effect.gen(function* () {
    for (const s of skills) {
      if (!s.skillId.trim()) {
        return yield* Effect.fail(
          new ClawQLError({ reason: "SkillDefinition.skillId must be non-empty" })
        );
      }
      if (!s.content.trim()) {
        return yield* Effect.fail(
          new ClawQLError({ reason: `Skill ${s.skillId}: content must be non-empty` })
        );
      }
    }
  });
}
