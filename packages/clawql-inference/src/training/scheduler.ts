import type { TrainingConfig } from "./types.js";

export type ArgoContainerTemplate = {
  name: string;
  container: {
    image: string;
    command: string[];
    args: string[];
    resources?: {
      requests?: Record<string, string>;
      limits?: Record<string, string>;
    };
    volumeMounts?: { name: string; mountPath: string }[];
  };
  nodeSelector?: Record<string, string>;
};

export type ArgoWorkflow = {
  metadata: { name: string; labels: Record<string, string> };
  spec: {
    templates: ArgoContainerTemplate[];
    volumes: { name: string; emptyDir: { sizeLimit: string } }[];
    dag: { tasks: { name: string; template: string; dependencies?: string[] }[] };
  };
};

const TRAINING_IMAGE =
  process.env.CLAWQL_TRAINING_IMAGE?.trim() ||
  "ghcr.io/danielsmithdevelopment/clawql-training:latest";
const UNSLOTH_IMAGE =
  process.env.CLAWQL_UNSLOTH_IMAGE?.trim() ||
  "ghcr.io/danielsmithdevelopment/clawql-unsloth:latest";

/** Build Argo DAG: collect → format → train → [evaluate] → [promote]. */
export function buildTrainingWorkflow(config: TrainingConfig): ArgoWorkflow {
  const templates: ArgoContainerTemplate[] = [
    {
      name: "collect-traces",
      container: {
        image: TRAINING_IMAGE,
        command: ["clawql", "training", "collect"],
        args: [
          "--bucket",
          config.dataSource.bucket,
          "--filter",
          JSON.stringify(config.dataSource.filter),
          "--output",
          "/data/traces.jsonl",
        ],
        volumeMounts: [{ name: "data", mountPath: "/data" }],
      },
    },
    {
      name: "format-dataset",
      container: {
        image: TRAINING_IMAGE,
        command: ["clawql", "training", "format"],
        args: [
          "--method",
          config.method.type,
          "--variant",
          config.method.type === "dpo" ? config.method.variant : "standard",
          "--input",
          "/data/traces.jsonl",
          "--output",
          "/data/dataset",
        ],
        volumeMounts: [{ name: "data", mountPath: "/data" }],
      },
    },
    {
      name: "train",
      container: {
        image: UNSLOTH_IMAGE,
        command: ["python", "-m", "clawql_training.train"],
        args: [
          "--config",
          JSON.stringify({
            runId: config.runId,
            method: config.method.type,
            baseModel: config.baseModel,
            adapterMethod: config.adapterMethod,
          }),
          "--dataset",
          "/data/dataset",
          "--output",
          "/data/adapter",
        ],
        resources: {
          requests: { "nvidia.com/gpu": String(config.gpuConfig.gpuCount) },
          limits: { "nvidia.com/gpu": String(config.gpuConfig.gpuCount) },
        },
        volumeMounts: [{ name: "data", mountPath: "/data" }],
      },
      nodeSelector: { "nvidia.com/gpu": "true" },
    },
  ];

  const dagTasks: ArgoWorkflow["spec"]["dag"]["tasks"] = [
    { name: "collect", template: "collect-traces" },
    { name: "format", template: "format-dataset", dependencies: ["collect"] },
    { name: "train", template: "train", dependencies: ["format"] },
  ];

  if (config.evalAfterTraining) {
    templates.push({
      name: "evaluate",
      container: {
        image: TRAINING_IMAGE,
        command: ["clawql", "training", "eval"],
        args: [
          "--adapter",
          "/data/adapter",
          "--benchmark",
          config.evalBenchmark,
          "--threshold",
          String(config.evalPassThreshold),
          "--output",
          "/data/eval-results.json",
        ],
        volumeMounts: [{ name: "data", mountPath: "/data" }],
      },
    });
    dagTasks.push({ name: "evaluate", template: "evaluate", dependencies: ["train"] });

    if (config.autoPromote) {
      templates.push({
        name: "promote",
        container: {
          image: TRAINING_IMAGE,
          command: ["clawql", "training", "promote"],
          args: [
            "--adapter",
            "/data/adapter",
            "--eval-results",
            "/data/eval-results.json",
            "--domain",
            config.domain,
            "--version",
            config.adapterVersion,
          ],
          volumeMounts: [{ name: "data", mountPath: "/data" }],
        },
      });
      dagTasks.push({ name: "promote", template: "promote", dependencies: ["evaluate"] });
    }
  }

  return {
    metadata: {
      name: `clawql-training-${config.runId}`,
      labels: { "clawql.io/training-run": config.runId },
    },
    spec: {
      templates,
      volumes: [{ name: "data", emptyDir: { sizeLimit: "50Gi" } }],
      dag: { tasks: dagTasks },
    },
  };
}

/**
 * Submit training workflow to Argo.
 * Scaffold: returns a local run id when Argo client is not configured.
 */
export async function scheduleTrainingRun(config: TrainingConfig): Promise<string> {
  const workflow = buildTrainingWorkflow(config);
  const endpoint = process.env.CLAWQL_ARGO_ENDPOINT?.trim();
  if (!endpoint) {
    return workflow.metadata.name;
  }
  throw new Error(
    `Argo submit not implemented yet (endpoint=${endpoint}). Use buildTrainingWorkflow() to inspect the DAG.`
  );
}
