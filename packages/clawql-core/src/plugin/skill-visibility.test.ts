import { describe, expect, it } from "vitest";
import {
  atrScopeFromTokens,
  filterSkillsByAtr,
  isSkillVisibleUnderAtr,
  type SkillIndexEntry,
} from "clawql-core";

const standalone: SkillIndexEntry = {
  skillId: "session-handoff",
  name: "Session handoff",
  description: "Handoff",
  digest: "a",
  pluginId: "handoff",
  applicability: "always",
  source: "standalone",
};

const provider: SkillIndexEntry = {
  skillId: "pr-review",
  name: "PR review",
  description: "Review PRs",
  digest: "b",
  pluginId: "github",
  applicability: "query-matched",
  source: "provider",
  scopeTokens: ["github.pulls.get"],
};

describe("skill ATR visibility", () => {
  it("does not filter when atrScope is undefined", () => {
    expect(isSkillVisibleUnderAtr(provider, undefined)).toBe(true);
    expect(filterSkillsByAtr([standalone, provider], undefined)).toHaveLength(2);
  });

  it("always shows standalone skills under empty ATR", () => {
    const empty = atrScopeFromTokens([]);
    expect(isSkillVisibleUnderAtr(standalone, empty)).toBe(true);
    expect(isSkillVisibleUnderAtr(provider, empty)).toBe(false);
  });

  it("shows provider skills when ATR matches plugin id or tool token", () => {
    expect(isSkillVisibleUnderAtr(provider, atrScopeFromTokens(["github"]))).toBe(true);
    expect(isSkillVisibleUnderAtr(provider, atrScopeFromTokens(["github.pulls.get"]))).toBe(true);
    expect(isSkillVisibleUnderAtr(provider, atrScopeFromTokens(["github.*"]))).toBe(true);
    expect(isSkillVisibleUnderAtr(provider, atrScopeFromTokens(["slack.chat.postMessage"]))).toBe(
      false
    );
  });
});
