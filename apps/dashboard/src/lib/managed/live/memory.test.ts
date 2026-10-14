import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { getManagedMemoryEffect, listManagedMemoryEffect } from "./memory";
import { listManagedSessionsEffect } from "./sessions";
import { listManagedSkillsEffect } from "./skills";

describe("managed memory/sessions/skills fixtures", () => {
  it("filters memory by query and kind", async () => {
    const listed = await Effect.runPromise(
      listManagedMemoryEffect({ query: "northwind", kind: "ENTITY" }),
    );
    expect(listed.results.some((r) => r.id === "ct_4471")).toBe(true);
    const detail = await Effect.runPromise(getManagedMemoryEffect("ct_4471"));
    expect(detail.result?.title).toMatch(/Northwind/);
    expect(detail.fields.length).toBeGreaterThan(0);
  });

  it("lists sessions and skills", async () => {
    const sessions = await Effect.runPromise(listManagedSessionsEffect());
    expect(sessions.sessions.some((s) => s.id === "sess_7f2a91c4")).toBe(true);
    const skills = await Effect.runPromise(listManagedSkillsEffect());
    expect(skills.proposed.some((s) => s.id === "contract-redline-check")).toBe(true);
    expect(skills.active.some((s) => s.id === "standup-digest")).toBe(true);
  });
});
