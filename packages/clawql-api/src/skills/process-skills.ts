/**
 * Process-wide skill index (Skills-over-MCP tier-1 list / tier-2 get).
 * Empty by default — {@link ProviderPlugin} install should call {@link registerProcessSkills}.
 */

import {
  InMemorySkillRegistryLive,
  SkillRegistry,
  type SkillContent,
  type SkillDefinition,
  type SkillIndexEntry,
} from "clawql-core";
import { Effect, ManagedRuntime } from "effect";

type ProcessSkillsRuntime = ManagedRuntime.ManagedRuntime<SkillRegistry, never>;

let processSkillsRuntime: ProcessSkillsRuntime | undefined;

function getProcessSkillsRuntime(): ProcessSkillsRuntime {
  if (!processSkillsRuntime) {
    processSkillsRuntime = ManagedRuntime.make(InMemorySkillRegistryLive);
    processSkillsRuntime.runSync(Effect.void);
  }
  return processSkillsRuntime;
}

function runProcessSkillsEffect<A, E>(program: Effect.Effect<A, E, SkillRegistry>): Promise<A> {
  return getProcessSkillsRuntime().runPromise(program);
}

export function registerProcessSkillsEffect(
  pluginId: string,
  skills: readonly SkillDefinition[]
): Effect.Effect<void, import("clawql-core").ClawQLError, SkillRegistry> {
  return Effect.gen(function* () {
    const reg = yield* SkillRegistry;
    yield* reg.register(pluginId, skills);
  });
}

export function listProcessSkillIndexEffect(): Effect.Effect<
  readonly SkillIndexEntry[],
  never,
  SkillRegistry
> {
  return Effect.gen(function* () {
    const reg = yield* SkillRegistry;
    return yield* reg.listIndex();
  });
}

export function getProcessSkillContentEffect(
  skillId: string
): Effect.Effect<SkillContent | undefined, never, SkillRegistry> {
  return Effect.gen(function* () {
    const reg = yield* SkillRegistry;
    return yield* reg.getContent(skillId);
  });
}

export function unregisterProcessSkillsEffect(
  pluginId: string
): Effect.Effect<void, never, SkillRegistry> {
  return Effect.gen(function* () {
    const reg = yield* SkillRegistry;
    yield* reg.unregisterPlugin(pluginId);
  });
}

/** Promise façade for MCP / legacy callers. */
export function registerProcessSkills(
  pluginId: string,
  skills: readonly SkillDefinition[]
): Promise<void> {
  return runProcessSkillsEffect(registerProcessSkillsEffect(pluginId, skills));
}

export function listProcessSkillIndex(): Promise<readonly SkillIndexEntry[]> {
  return runProcessSkillsEffect(listProcessSkillIndexEffect());
}

export function getProcessSkillContent(skillId: string): Promise<SkillContent | undefined> {
  return runProcessSkillsEffect(getProcessSkillContentEffect(skillId));
}

export function unregisterProcessSkills(pluginId: string): Promise<void> {
  return runProcessSkillsEffect(unregisterProcessSkillsEffect(pluginId));
}

/** Test helper — disposes the singleton ManagedRuntime and clears the in-memory index. */
export async function resetProcessSkillsRegistryForTests(): Promise<void> {
  if (processSkillsRuntime) {
    await processSkillsRuntime.dispose();
    processSkillsRuntime = undefined;
  }
}
