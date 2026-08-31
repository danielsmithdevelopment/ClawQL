import { describe, expect, it, beforeEach } from "vitest";
import {
  getProcessSkillContent,
  listProcessSkillIndex,
  registerProcessSkills,
  resetProcessSkillsRegistryForTests,
  unregisterProcessSkills,
} from "./process-skills.js";
import { handleSkillsGetToolInput, handleSkillsListToolInput } from "./skills-tool-handlers.js";

describe("process-skills registry", () => {
  beforeEach(async () => {
    await resetProcessSkillsRegistryForTests();
  });

  it("starts empty", async () => {
    expect(await listProcessSkillIndex()).toEqual([]);
  });

  it("registers, lists, fetches, and unregisters by pluginId", async () => {
    await registerProcessSkills("demo-plugin", [
      {
        skillId: "session-handoff",
        name: "Session handoff",
        description: "Summarize for a new chat",
        content: "# Handoff\n\nWrite a structured recap.",
        applicability: "always",
      },
    ]);

    const index = await listProcessSkillIndex();
    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({
      skillId: "session-handoff",
      name: "Session handoff",
      pluginId: "demo-plugin",
      applicability: "always",
    });
    expect(index[0]?.digest.length).toBeGreaterThan(0);

    const content = await getProcessSkillContent("session-handoff");
    expect(content?.body).toContain("structured recap");
    expect(content?.pluginId).toBe("demo-plugin");

    await unregisterProcessSkills("demo-plugin");
    expect(await listProcessSkillIndex()).toEqual([]);
    expect(await getProcessSkillContent("session-handoff")).toBeUndefined();
  });
});

describe("skills MCP tool handlers", () => {
  beforeEach(async () => {
    await resetProcessSkillsRegistryForTests();
  });

  it("skills_list returns empty index by default", async () => {
    const result = await handleSkillsListToolInput({});
    const body = JSON.parse(result.content[0]?.text ?? "{}") as {
      ok: boolean;
      skills: unknown[];
    };
    expect(body.ok).toBe(true);
    expect(body.skills).toEqual([]);
  });

  it("skills_get returns error when skill missing", async () => {
    const result = await handleSkillsGetToolInput({ skillId: "missing" });
    const body = JSON.parse(result.content[0]?.text ?? "{}") as {
      ok: boolean;
      error?: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("missing");
  });

  it("skills_get returns full body when registered", async () => {
    await registerProcessSkills("demo", [
      {
        skillId: "demo-skill",
        content: "# Demo\n\nBody text.",
      },
    ]);
    const result = await handleSkillsGetToolInput({ skillId: "demo-skill" });
    const body = JSON.parse(result.content[0]?.text ?? "{}") as {
      ok: boolean;
      skill?: { body: string };
    };
    expect(body.ok).toBe(true);
    expect(body.skill?.body).toContain("Body text.");
  });
});
