/**
 * Process-wide skill index (Skills-over-MCP + search ranking).
 * Bound to the host SkillRegistry from createClawQLApi so install and MCP share one store.
 */

import {
  InMemorySkillRegistryLive,
  SkillRegistry,
  type SkillContent,
  type SkillDefinition,
  type SkillIndexEntry,
  type SkillRegisterOptions,
} from "clawql-core";
import { Context, Effect, Layer } from "effect";

let boundRegistry: Context.Tag.Service<typeof SkillRegistry> | undefined;
let fallbackRegistry: Context.Tag.Service<typeof SkillRegistry> | undefined;

function extractInMemory(): Context.Tag.Service<typeof SkillRegistry> {
  return Effect.runSync(
    Effect.gen(function* () {
      return yield* SkillRegistry;
    }).pipe(Effect.provide(InMemorySkillRegistryLive))
  );
}

function activeRegistry(): Context.Tag.Service<typeof SkillRegistry> {
  if (boundRegistry) return boundRegistry;
  if (!fallbackRegistry) fallbackRegistry = extractInMemory();
  return fallbackRegistry;
}

/** Wire MCP skills_* + search to the same SkillRegistry used by plugin install. */
export function bindProcessSkillRegistry(
  registry: Context.Tag.Service<typeof SkillRegistry>
): void {
  boundRegistry = registry;
}

export function getBoundSkillRegistry(): Context.Tag.Service<typeof SkillRegistry> {
  return activeRegistry();
}

function withRegistry<A, E>(
  program: Effect.Effect<A, E, SkillRegistry>
): Effect.Effect<A, E, never> {
  return program.pipe(Effect.provideService(SkillRegistry, activeRegistry()));
}

export function registerProcessSkillsEffect(
  pluginId: string,
  skills: readonly SkillDefinition[],
  options?: SkillRegisterOptions
): Effect.Effect<void, import("clawql-core").ClawQLError, never> {
  return withRegistry(
    Effect.gen(function* () {
      const reg = yield* SkillRegistry;
      yield* reg.register(pluginId, skills, options);
    })
  );
}

export function listProcessSkillIndexEffect(): Effect.Effect<
  readonly SkillIndexEntry[],
  never,
  never
> {
  return withRegistry(
    Effect.gen(function* () {
      const reg = yield* SkillRegistry;
      return yield* reg.listIndex();
    })
  );
}

export function getProcessSkillContentEffect(
  skillId: string
): Effect.Effect<SkillContent | undefined, never, never> {
  return withRegistry(
    Effect.gen(function* () {
      const reg = yield* SkillRegistry;
      return yield* reg.getContent(skillId);
    })
  );
}

export function unregisterProcessSkillsEffect(pluginId: string): Effect.Effect<void, never, never> {
  return withRegistry(
    Effect.gen(function* () {
      const reg = yield* SkillRegistry;
      yield* reg.unregisterPlugin(pluginId);
    })
  );
}

/** Promise façade for MCP / legacy callers. */
export function registerProcessSkills(
  pluginId: string,
  skills: readonly SkillDefinition[],
  options?: SkillRegisterOptions
): Promise<void> {
  return Effect.runPromise(registerProcessSkillsEffect(pluginId, skills, options));
}

export function listProcessSkillIndex(): Promise<readonly SkillIndexEntry[]> {
  return Effect.runPromise(listProcessSkillIndexEffect());
}

export function getProcessSkillContent(skillId: string): Promise<SkillContent | undefined> {
  return Effect.runPromise(getProcessSkillContentEffect(skillId));
}

export function unregisterProcessSkills(pluginId: string): Promise<void> {
  return Effect.runPromise(unregisterProcessSkillsEffect(pluginId));
}

/** Test helper — clear bound + fallback registries. */
export async function resetProcessSkillsRegistryForTests(): Promise<void> {
  boundRegistry = undefined;
  fallbackRegistry = undefined;
}

// silence unused Layer import if tree-shaken oddly
void Layer;
