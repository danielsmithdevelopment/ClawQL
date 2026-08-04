import { describe, expect, it, vi, afterEach } from "vitest";
import {
  labelStudioImportTasks,
  mergeHitlMetadata,
  validateHitlPredictions,
  HITL_PREDICTION_MAX_PER_TASK,
} from "./label-studio.js";

describe("validateHitlPredictions", () => {
  it("accepts undefined", () => {
    expect(validateHitlPredictions(undefined, 0)).toBeNull();
  });

  it("rejects oversized prediction lists", () => {
    const predictions = Array.from({ length: HITL_PREDICTION_MAX_PER_TASK + 1 }, () => ({
      result: [],
    }));
    expect(validateHitlPredictions(predictions, 2)?.message).toMatch(/exceeds max/);
  });

  it("rejects invalid score", () => {
    expect(validateHitlPredictions([{ result: [], score: 1.5 }], 0)?.message).toMatch(/score/);
  });
});

describe("mergeHitlMetadata", () => {
  it("passes predictions through on import bodies", () => {
    const tasks = mergeHitlMetadata({
      project_id: 1,
      confidence: 0.4,
      correlation_id: "corr-1",
      tasks: [
        {
          data: { text: "Employer ACME\nWages 50000" },
          predictions: [
            {
              model_version: "lending-w2-reference-v1",
              score: 0.72,
              result: [
                {
                  from_name: "doc_type",
                  to_name: "doc",
                  type: "labels",
                  value: { labels: ["w2"] },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.data.clawql_hitl).toMatchObject({
      source: "clawql_mcp",
      confidence: 0.4,
      correlation_id: "corr-1",
    });
    expect(tasks[0]!.predictions).toEqual([
      {
        model_version: "lending-w2-reference-v1",
        score: 0.72,
        result: [
          {
            from_name: "doc_type",
            to_name: "doc",
            type: "labels",
            value: { labels: ["w2"] },
          },
        ],
      },
    ]);
  });

  it("omits predictions key when absent", () => {
    const tasks = mergeHitlMetadata({
      project_id: 1,
      tasks: [{ data: { text: "x" } }],
    });
    expect(tasks[0]!.predictions).toBeUndefined();
  });

  it("throws on invalid predictions", () => {
    expect(() =>
      mergeHitlMetadata({
        project_id: 1,
        tasks: [{ data: { text: "x" }, predictions: [{ result: "bad" as never }] }],
      })
    ).toThrow(/result must be an array/);
  });
});

describe("labelStudioImportTasks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs tasks including predictions to Label Studio import", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as unknown[];
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        data: { text: "hello" },
        predictions: [{ model_version: "demo", result: [] }],
      });
      return new Response(JSON.stringify({ task_count: 1 }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await labelStudioImportTasks("http://ls.test", "tok", 9, [
      {
        data: { text: "hello", clawql_hitl: { source: "clawql_mcp" } },
        predictions: [{ model_version: "demo", result: [] }],
      },
    ]);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://ls.test/api/projects/9/import");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Token tok");
  });
});
