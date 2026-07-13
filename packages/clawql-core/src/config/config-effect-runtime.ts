import { Cause, Effect, Exit } from "effect";
import { ConfigLive, ConfigService } from "./config-service.js";

/** Run a config Effect program with the default env-backed Layer. */
export async function runConfigEffect<A, E>(
  program: Effect.Effect<A, E, ConfigService>
): Promise<A> {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(ConfigLive)));
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
}
