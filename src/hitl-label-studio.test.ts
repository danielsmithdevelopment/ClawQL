/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHitlLabelStudioRestConfig,
  handleHitlEnqueueLabelStudioToolInput,
  labelStudioImportTasks,
} from "./hitl-label-studio.js";

describe("hitl-label-studio", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    delete process.env.CLAWQL_LABEL_STUDIO_URL;
    delete process.env.CLAWQL_LABEL_STUDIO_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it("getHitlLabelStudioRestConfig returns null when vars missing", () => {
    expect(getHitlLabelStudioRestConfig()).toBeNull();
    process.env.CLAWQL_LABEL_STUDIO_URL = "http://ls.example";
    expect(getHitlLabelStudioRestConfig()).toBeNull();
  });

  it("getHitlLabelStudioRestConfig strips trailing slash", () => {
    process.env.CLAWQL_LABEL_STUDIO_URL = "http://ls.example/";
    process.env.CLAWQL_LABEL_STUDIO_API_TOKEN = "tok";
    expect(getHitlLabelStudioRestConfig()).toEqual({
      baseUrl: "http://ls.example",
      apiToken: "tok",
    });
  });

  it("handleHitlEnqueueLabelStudioToolInput errors when not configured", async () => {
    const out = await handleHitlEnqueueLabelStudioToolInput({
      project_id: 1,
      tasks: [{ data: { text: "x" } }],
    });
    const j = JSON.parse(out.content[0]!.text) as { error?: string };
    expect(j.error).toMatch(/not configured/);
  });

  it("labelStudioImportTasks posts import payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => '{"task_count":1}',
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await labelStudioImportTasks("http://ls", "tok", 7, [
      { data: { text: "hello", clawql_hitl: { enqueued_at: "t", source: "clawql_mcp" } } },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ls/api/projects/7/import",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Token tok",
        }),
      })
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body[0].data.text).toBe("hello");
  });
});
