/**
 * List workflow output artifact refs (no secret material or binary download).
 */

import type { ArgoWorkflowNodeStatus, ArgoWorkflowObject } from "./k8s-client.js";

export type WorkflowArtifactRef = {
  node_id: string;
  node_name: string;
  artifact_name: string;
  path?: string;
  mode?: string;
  archive_location?: {
    kind: "s3" | "gcs" | "http" | "artifactory" | "hdfs" | "azure" | "oss" | "raw" | "unknown";
    bucket?: string;
    key?: string;
    endpoint?: string;
  };
};

type RawArtifact = {
  name?: string;
  path?: string;
  mode?: string;
  s3?: { bucket?: string; key?: string; endpoint?: string };
  gcs?: { bucket?: string; key?: string };
  http?: { url?: string };
  artifactory?: { url?: string };
  hdfs?: { path?: string };
  azure?: { container?: string; blob?: string; endpoint?: string };
  oss?: { bucket?: string; key?: string; endpoint?: string };
  raw?: { data?: string };
};

function archiveLocation(
  artifact: RawArtifact
): WorkflowArtifactRef["archive_location"] | undefined {
  if (artifact.s3) {
    return {
      kind: "s3",
      bucket: artifact.s3.bucket,
      key: artifact.s3.key,
      endpoint: artifact.s3.endpoint,
    };
  }
  if (artifact.gcs) {
    return { kind: "gcs", bucket: artifact.gcs.bucket, key: artifact.gcs.key };
  }
  if (artifact.http) {
    return { kind: "http", endpoint: artifact.http.url };
  }
  if (artifact.artifactory) {
    return { kind: "artifactory", endpoint: artifact.artifactory.url };
  }
  if (artifact.hdfs) {
    return { kind: "hdfs", key: artifact.hdfs.path };
  }
  if (artifact.azure) {
    return {
      kind: "azure",
      bucket: artifact.azure.container,
      key: artifact.azure.blob,
      endpoint: artifact.azure.endpoint,
    };
  }
  if (artifact.oss) {
    return {
      kind: "oss",
      bucket: artifact.oss.bucket,
      key: artifact.oss.key,
      endpoint: artifact.oss.endpoint,
    };
  }
  if (artifact.raw) {
    return { kind: "raw" };
  }
  return undefined;
}

function nodeMatchesFilter(node: ArgoWorkflowNodeStatus, nodeId: string, filter?: string): boolean {
  if (!filter?.trim()) return true;
  const f = filter.trim();
  return node.displayName === f || node.name === f || node.podName === f || nodeId === f;
}

export function listWorkflowArtifacts(
  workflow: ArgoWorkflowObject,
  nodeNameFilter?: string
): WorkflowArtifactRef[] {
  const out: WorkflowArtifactRef[] = [];
  for (const [nodeId, node] of Object.entries(workflow.status?.nodes ?? {})) {
    if (!nodeMatchesFilter(node, nodeId, nodeNameFilter)) continue;
    const artifacts = (node as ArgoWorkflowNodeStatus & { outputs?: { artifacts?: RawArtifact[] } })
      .outputs?.artifacts;
    if (!artifacts?.length) continue;
    const display = node.displayName ?? node.name ?? nodeId;
    for (const artifact of artifacts) {
      if (!artifact.name) continue;
      out.push({
        node_id: nodeId,
        node_name: display,
        artifact_name: artifact.name,
        path: artifact.path,
        mode: artifact.mode,
        archive_location: archiveLocation(artifact),
      });
    }
  }
  return out;
}
