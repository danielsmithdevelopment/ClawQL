/**
 * ClawQL immutable release manifest — MVP schema v0.1 (GitHub + GHCR anchor; Arweave deferred).
 */

export const MANIFEST_SCHEMA_VERSION = "0.1" as const;

export type ArtifactRecord = {
  /** Relative path inside the release bundle directory when materialized locally. */
  path?: string;
  sha256: string;
  format?: string;
  sizeBytes?: number;
  url?: string;
};

export type ImageRecord = {
  ref: string;
  digest: string;
};

export type ReleaseManifestV01 = {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  version: string;
  tag: string;
  publishedAt: string;
  repository: {
    url?: string;
    commit: string;
    dirty: boolean;
  };
  buildEnvironment: {
    type: "git-worktree" | "ci";
    node?: string;
    platform?: string;
    ci?: string;
    workflow?: string;
  };
  artifacts: Record<string, ArtifactRecord>;
  images: Record<string, ImageRecord>;
  signatures: {
    cosign?: {
      note: string;
      identityRegexp?: string;
      oidcIssuerRegexp?: string;
    };
    npmProvenance?: boolean;
  };
  merkleRoot: string;
  leafCount: number;
  /**
   * Optional pin of the enterprise Ontology schema tree (SHA-256 over sorted entity file digests).
   * Present when `.clawql/ontology/entities` or `examples/ontology/entities` exists at collect time.
   */
  ontologySchema?: {
    sha256: string;
    path: string;
    entityCount: number;
  };
  policy: {
    compatiblePolicyVersion: string;
    requireSignatures?: string[];
    notes?: string;
  };
};

export type ReleaseConfigV1 = {
  version: 1;
  outputDir: string;
  repository?: string;
  images?: Record<string, string>;
};

export type CollectOptions = {
  rootDir: string;
  tag?: string;
  version?: string;
  sbomPath?: string;
  npmTarballPath?: string;
  imageDigests?: Record<string, string>;
  ci?: string;
  workflow?: string;
};

export type PublishOptions = CollectOptions & {
  outDir?: string;
  copyArtifacts?: boolean;
  githubRelease?: boolean;
};

export type VerifyResult = {
  ok: boolean;
  errors: string[];
  manifest: ReleaseManifestV01;
};
