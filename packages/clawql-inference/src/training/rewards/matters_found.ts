import type { GrpoTask, RewardFunction, RewardScore } from "../types.js";

function extractArtifact(rollout: string, name: string): string | null {
  const fence = new RegExp(
    "```(?:json)?\\s*(" + name.replace(".", "\\.") + ")?\\s*([\\s\\S]*?)```",
    "i"
  );
  const labeled = rollout.match(
    new RegExp(`${name}\\s*[:=]\\s*(\\{[\\s\\S]*\\}|\\[[\\s\\S]*\\])`, "i")
  );
  if (labeled?.[1]) return labeled[1];

  const marker = rollout.indexOf(name);
  if (marker >= 0) {
    const slice = rollout.slice(marker);
    const arr = slice.match(/\[[\s\S]*?\]/);
    if (arr) return arr[0];
  }

  const fenced = rollout.match(fence);
  if (fenced?.[2]) return fenced[2].trim();
  return null;
}

export const mattersFoundReward: RewardFunction = {
  id: "matters_found_completeness",
  description: "B-7 institutional knowledge enumeration completeness",

  async score(rollout: string, task: GrpoTask): Promise<RewardScore> {
    const mattersJson = extractArtifact(rollout, "matters.json");
    if (!mattersJson) return { score: 0, breakdown: { reason: "no_artifact" } };

    let parsed: unknown;
    try {
      parsed = JSON.parse(mattersJson);
    } catch {
      return { score: 0, breakdown: { reason: "invalid_json" } };
    }

    if (!Array.isArray(parsed)) {
      return { score: 0, breakdown: { reason: "not_array" } };
    }

    const foundIds = new Set(
      parsed.map((m: { id?: string }) => m?.id).filter((id): id is string => Boolean(id))
    );
    const groundTruth = new Set(task.taskMeta.groundTruth?.matterIds ?? []);
    if (groundTruth.size === 0) {
      return { score: 0, breakdown: { reason: "no_ground_truth" } };
    }

    const truePositives = [...foundIds].filter((id) => groundTruth.has(id)).length;
    const falsePositives = [...foundIds].filter((id) => !groundTruth.has(id)).length;

    if (falsePositives > 0) {
      return { score: 0, breakdown: { reason: "false_positives", falsePositives } };
    }

    const recall = truePositives / groundTruth.size;
    const usedStructuredFilter = rollout.includes('"filters"') && rollout.includes('"gte"');

    return {
      score: recall + (usedStructuredFilter ? 0.1 : 0),
      breakdown: {
        recall,
        truePositives,
        falsePositives: 0,
        total: groundTruth.size,
        usedStructuredFilter,
      },
    };
  },
};
