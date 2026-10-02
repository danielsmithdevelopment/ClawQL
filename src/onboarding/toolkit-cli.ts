/**
 * `clawql toolkit` — list / show seeded toolkit presets (pack + ATR packaging).
 */

import { Effect, Result } from "effect";
import { getToolkitEffect, listToolkitsEffect } from "clawql-api";

export async function runToolkitList(): Promise<number> {
  const list = Effect.runSync(listToolkitsEffect());
  if (!list.length) {
    console.log("No seeded toolkits.");
    return 0;
  }
  for (const tk of list) {
    const pack = tk.providers.pack ? `pack=${tk.providers.pack}` : "";
    const enabled = tk.providers.enabled?.length ? `enabled=${tk.providers.enabled.join(",")}` : "";
    const providers = [pack, enabled].filter(Boolean).join(" ");
    console.log(`${tk.id}\t${tk.title}\t${providers}`);
  }
  return 0;
}

export async function runToolkitShow(id: string): Promise<number> {
  if (!id?.trim()) {
    console.error("Usage: clawql toolkit show <id>");
    return 1;
  }
  const result = Effect.runSync(Effect.result(getToolkitEffect(id)));
  if (Result.isFailure(result)) {
    console.error(result.failure.message);
    return 1;
  }
  console.log(JSON.stringify(result.success, null, 2));
  return 0;
}
