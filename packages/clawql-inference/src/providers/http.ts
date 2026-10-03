import { Effect } from "effect";

export function readHttpErrorEffect(res: Response): Effect.Effect<string> {
  return Effect.tryPromise({
    try: async () => {
      const text = await res.text().catch(() => "");
      return text.slice(0, 400);
    },
    catch: () => "",
  });
}

/** Promise façade for provider adapters that still await HTTP error bodies. */
export async function readHttpError(res: Response): Promise<string> {
  return Effect.runPromise(readHttpErrorEffect(res));
}
