/**
 * ClawQL immutable release manifest — schema v0.2
 * (Layer 0: workspaces, signatures, Radicle/GitHub, IPFS staging, Lit, Arweave/ar.io, x402)
 */

export const MANIFEST_SCHEMA_VERSION = "0.2" as const;
export const MANIFEST_SCHEMA_VERSION_LEGACY = "0.1" as const;

export type ManifestSchemaVersion =
  typeof MANIFEST_SCHEMA_VERSION | typeof MANIFEST_SCHEMA_VERSION_LEGACY;

export type ArtifactRecord = {
  /** Relative path inside the release bundle directory when materialized locally. */
  path?: string;
  sha256: string;
  format?: string;
  sizeBytes?: number;
  url?: string;
  /** Content ID when staged on IPFS (or local content-addressed staging). */
  cid?: string;
  /** Detached signature over the artifact bytes (hex or base64). */
  signature?: string;
  /** Public key id / fingerprint that produced `signature`. */
  signer?: string;
};

export type ImageRecord = {
  ref: string;
  digest: string;
  signatureRef?: string;
  attestationRef?: string;
};

export type BuildEnvironmentRecord = {
  type: "git-worktree" | "rift" | "ci" | "cloudflare" | "ebs";
  node?: string;
  platform?: string;
  ci?: string;
  workflow?: string;
  snapshotId?: string;
  parentSnapshotId?: string;
  createdAt?: string;
  workspacePath?: string;
};

export type CollaborationRecord = {
  primary: "radicle" | "github";
  radicle?: {
    rid?: string;
    remote?: string;
    identity?: string;
  };
  githubMirror?: {
    url?: string;
    bannerUpdated?: boolean;
    arweaveTxId?: string;
  };
};

export type StagingRecord = {
  ipfs?: {
    cid: string;
    gateway?: string;
    stagedAt: string;
    mode: "ipfs" | "local-content-addressed";
  };
};

export type PermanenceRecord = {
  arweave?: {
    txId: string;
    gateway: string;
    uploadedAt: string;
    mode: "ar.io" | "local-dry-run";
    encrypted: boolean;
  };
};

export type AccessRecord = {
  public?: boolean;
  paymentRequired?: boolean;
  price?: string;
  wallet?: string;
  asset?: string;
  network?: string;
  decryptCondition?: LitDecryptCondition;
  encryption?: {
    algorithm: "chacha20-poly1305";
    nonceHex: string;
    ciphertextPath?: string;
    wrappedKeyHint?: string;
  };
};

export type LitDecryptCondition = {
  protocol: "lit";
  conditionType: "payment-receipt" | "wallet-ownership" | "custom";
  description?: string;
  /** Opaque Lit access-control condition JSON (or local dry-run equivalent). */
  condition?: Record<string, unknown>;
};

export type SignatureRecord = {
  cosign?: {
    note: string;
    identityRegexp?: string;
    oidcIssuerRegexp?: string;
  };
  npmProvenance?: boolean;
  /** Ed25519 (or configured) signatures over release artifacts / manifest. */
  release?: {
    algorithm: "ed25519";
    publicKeyHex: string;
    manifestSignatureHex: string;
    signedAt: string;
  };
  gitCommits?: {
    requireSigned: boolean;
    signingFormat?: "openpgp" | "ssh" | "x509";
  };
};

export type ReleaseManifestV01 = {
  schemaVersion: ManifestSchemaVersion;
  version: string;
  tag: string;
  publishedAt: string;
  repository: {
    url?: string;
    commit: string;
    dirty: boolean;
  };
  buildEnvironment: BuildEnvironmentRecord;
  artifacts: Record<string, ArtifactRecord>;
  images: Record<string, ImageRecord>;
  signatures: SignatureRecord;
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
    canaryPercent?: number;
    blastRadiusCap?: string;
    rollback?: {
      previousRelease?: string;
      trigger?: string;
    };
    notes?: string;
  };
  collaboration?: CollaborationRecord;
  staging?: StagingRecord;
  permanence?: PermanenceRecord;
  access?: AccessRecord;
};

/** Alias — current schema is v0.2 with optional Layer 0 permanence fields. */
export type ReleaseManifestV02 = ReleaseManifestV01;

export type WorkspaceBackend = "git-worktree" | "rift" | "cloudflare" | "ebs";

export type ReleaseConfigV1 = {
  version: 1;
  outputDir: string;
  repository?: string;
  images?: Record<string, string>;
  /** Prefer signed git commits locally (default true). */
  requireSignedCommits?: boolean;
  /** Preferred immutable-volume backend. */
  workspaceBackend?: WorkspaceBackend;
  collaboration?: {
    primary?: "radicle" | "github";
    radicleRid?: string;
    githubMirrorUrl?: string;
  };
  permanence?: {
    arweaveGateway?: string;
    ipfsApiUrl?: string;
    dryRun?: boolean;
  };
  access?: {
    defaultPrice?: string;
    wallet?: string;
    asset?: string;
    network?: string;
  };
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
  buildEnvironment?: Partial<BuildEnvironmentRecord>;
  signArtifacts?: boolean;
};

export type PublishOptions = CollectOptions & {
  outDir?: string;
  copyArtifacts?: boolean;
  githubRelease?: boolean;
  /** Stage bundle on IPFS (or local content-addressed store) before permanence. */
  stageIpfs?: boolean;
  /** Encrypt bundle (ChaCha20-Poly1305) and attach Lit/x402 access metadata. */
  encrypt?: boolean;
  /** Upload permanent release via ar.io (or local dry-run). */
  permanent?: boolean;
  /** Force dry-run for network backends (IPFS / Arweave / Lit / Radicle). */
  dryRun?: boolean;
  /** Price string for paid releases, e.g. "0.50 USDC". */
  price?: string;
  /** Sync collaboration remotes (Radicle primary + GitHub mirror). */
  syncCollaboration?: boolean;
};

export type VerifyResult = {
  ok: boolean;
  errors: string[];
  warnings?: string[];
  manifest: ReleaseManifestV01;
};

export type SnapshotOptions = {
  rootDir: string;
  backend: WorkspaceBackend;
  name: string;
  branch?: string;
  parentSnapshotId?: string;
};

export type WorkspaceSnapshot = {
  backend: WorkspaceBackend;
  snapshotId: string;
  parentSnapshotId?: string;
  name: string;
  path: string;
  createdAt: string;
  commit?: string;
};
