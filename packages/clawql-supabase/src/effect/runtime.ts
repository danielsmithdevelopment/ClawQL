import { Effect, Layer } from "effect";
import { SupabaseAuthService, SupabaseAuthServiceLive } from "../auth/supabase-auth-service.js";

export type SupabaseServices = SupabaseAuthService;

/** Merged live Layer for Supabase Auth + config. */
export function supabaseServicesLiveLayer(): Layer.Layer<SupabaseServices> {
  return SupabaseAuthServiceLive;
}

/** Run a Supabase Effect program with default services Layer. */
export async function runSupabaseEffect<A, E>(
  program: Effect.Effect<A, E, SupabaseServices>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(supabaseServicesLiveLayer())));
}

export function resetSupabaseEffectRuntimeForTests(): void {
  // Stateless Layers today — reserved for future ManagedRuntime.
}
