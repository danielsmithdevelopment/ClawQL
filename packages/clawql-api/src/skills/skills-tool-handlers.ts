/**
 * MCP `skills_list` / `skills_get` handlers (Core tools — always on).
 */

import { z } from "zod";
import { logMcpToolShape } from "../mcp/tool-shape-log.js";
import {
  getProcessSkillContent,
  listProcessSkillIndex,
} from "./process-skills.js";

export type SkillsToolMcpResult = { content: { type: "text"; text: string }[] };

function jsonResponse(obj: unknown): SkillsToolMcpResult {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

/** MCP SDK listing only — no args. */
export const skillsListToolZodShape = {} as const;

export const skillsGetToolZodShape = {
  skillId: z.string().min(1).describe("Skill id from skills_list index."),
} as const;

export async function handleSkillsListToolInput(
  _params: unknown
): Promise<SkillsToolMcpResult> {
  const skills = await listProcessSkillIndex();
  logMcpToolShape("skills_list", { count: skills.length });
  return jsonResponse({ ok: true, skills });
}

const skillsGetInputSchema = z.object(skillsGetToolZodShape);

export async function handleSkillsGetToolInput(
  params: unknown
): Promise<SkillsToolMcpResult> {
  const { skillId: parsed } = skillsGetInputSchema.parse(params);
  logMcpToolShape("skills_get", { skillIdLen: parsed.length });
  const content = await getProcessSkillContent(parsed);
  if (!content) {
    return jsonResponse({ ok: false, error: `Skill not found: ${parsed}` });
  }
  return jsonResponse({ ok: true, skill: content });
}
