/**
 * Thin wrapper over the Artifacts Workers binding, with REST fallback.
 * All Artifacts calls in this repo go through here so a beta API change touches one package.
 */

export type ArtifactsToken = {
  plaintext: string;
  expiresAt: string;
  scope: "read" | "write";
};

export type ArtifactsRepoMeta = {
  name: string;
  remote: string;
  defaultBranch: string;
  token?: string;
};

/** Minimal binding surface we rely on (Wrangler-generated types may be wider). */
export type ArtifactsBinding = {
  create(name: string, opts?: { description?: string; setDefaultBranch?: string }): Promise<ArtifactsRepoMeta>;
  get(name: string): Promise<ArtifactsRepoHandle>;
  list(opts?: { limit?: number }): Promise<{ repos: Array<{ name: string; status: string }>; cursor?: string }>;
  import(params: {
    source: { url: string; branch?: string; depth?: number };
    target: { name: string };
  }): Promise<ArtifactsRepoMeta>;
  delete(name: string): Promise<void>;
};

export type ArtifactsRepoHandle = {
  info(): Promise<ArtifactsRepoMeta>;
  createToken(scope?: "read" | "write", ttl?: number): Promise<ArtifactsToken>;
  fork(name: string, opts?: { description?: string; defaultBranchOnly?: boolean; readOnly?: boolean }): Promise<ArtifactsRepoMeta>;
  readFile(args: { ref: string; path: string }): Promise<Blob | null>;
  log(opts?: { ref?: string; limit?: number }): Promise<Array<{ hash: string; message: string }>>;
  [Symbol.dispose]?: () => void;
};

export type RestConfig = {
  accountId: string;
  apiToken: string;
  namespace: string;
  baseUrl?: string;
};

export type ArtifactsClient = {
  create(name: string, opts?: { description?: string }): Promise<ArtifactsRepoMeta>;
  fork(source: string, name: string, opts?: { description?: string }): Promise<ArtifactsRepoMeta>;
  createToken(repo: string, scope: "read" | "write", ttlSeconds: number): Promise<ArtifactsToken>;
  list(): Promise<string[]>;
  getRemote(repo: string): Promise<string>;
};

async function withRepo<T>(
  artifacts: ArtifactsBinding,
  name: string,
  fn: (repo: ArtifactsRepoHandle) => Promise<T>
): Promise<T> {
  const repo = await artifacts.get(name);
  try {
    return await fn(repo);
  } finally {
    repo[Symbol.dispose]?.();
  }
}

export function createBindingClient(artifacts: ArtifactsBinding): ArtifactsClient {
  return {
    async create(name, opts) {
      return artifacts.create(name, { setDefaultBranch: "main", ...opts });
    },
    async fork(source, name, opts) {
      return withRepo(artifacts, source, (repo) =>
        repo.fork(name, { defaultBranchOnly: true, ...opts })
      );
    },
    async createToken(repoName, scope, ttlSeconds) {
      return withRepo(artifacts, repoName, (repo) => repo.createToken(scope, ttlSeconds));
    },
    async list() {
      const page = await artifacts.list({ limit: 100 });
      return page.repos.map((r) => r.name);
    },
    async getRemote(repoName) {
      return withRepo(artifacts, repoName, async (repo) => (await repo.info()).remote);
    },
  };
}

/** REST fallback when the Workers binding is unavailable (CI / Node tooling). */
export function createRestClient(cfg: RestConfig): ArtifactsClient {
  const base = (cfg.baseUrl ?? "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
  const ns = encodeURIComponent(cfg.namespace);

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json()) as { success: boolean; result?: T; errors?: Array<{ message: string }> };
    if (!res.ok || !json.success) {
      const msg = json.errors?.map((e) => e.message).join("; ") || res.statusText;
      throw new Error(`Artifacts REST ${method} ${path}: ${msg}`);
    }
    return json.result as T;
  }

  return {
    async create(name, opts) {
      return api<ArtifactsRepoMeta>(
        "POST",
        `/accounts/${cfg.accountId}/artifacts/namespaces/${ns}/repos`,
        { name, description: opts?.description, default_branch: "main" }
      );
    },
    async fork(source, name, opts) {
      return api<ArtifactsRepoMeta>(
        "POST",
        `/accounts/${cfg.accountId}/artifacts/namespaces/${ns}/repos/${encodeURIComponent(source)}/forks`,
        { name, description: opts?.description, default_branch_only: true }
      );
    },
    async createToken(repo, scope, ttlSeconds) {
      return api<ArtifactsToken>(
        "POST",
        `/accounts/${cfg.accountId}/artifacts/namespaces/${ns}/repos/${encodeURIComponent(repo)}/tokens`,
        { scope, ttl: ttlSeconds }
      );
    },
    async list() {
      const result = await api<{ repos: Array<{ name: string }> }>(
        "GET",
        `/accounts/${cfg.accountId}/artifacts/namespaces/${ns}/repos`
      );
      return result.repos.map((r) => r.name);
    },
    async getRemote(repo) {
      const info = await api<ArtifactsRepoMeta>(
        "GET",
        `/accounts/${cfg.accountId}/artifacts/namespaces/${ns}/repos/${encodeURIComponent(repo)}`
      );
      return info.remote;
    },
  };
}

/** In-memory fake for unit tests — never used as an e2e witness. */
export function createMemoryClient(): ArtifactsClient & { forks: Map<string, string>; tokens: Map<string, ArtifactsToken> } {
  const forks = new Map<string, string>();
  const tokens = new Map<string, ArtifactsToken>();
  return {
    forks,
    tokens,
    async create(name) {
      forks.set(name, name);
      return { name, remote: `memory://${name}.git`, defaultBranch: "main", token: "mem_write" };
    },
    async fork(source, name) {
      if (!forks.has(source) && source !== "seed") {
        // allow forking a logical seed
      }
      forks.set(name, source);
      return { name, remote: `memory://${name}.git`, defaultBranch: "main", token: "mem_write" };
    },
    async createToken(repo, scope, ttlSeconds) {
      const t: ArtifactsToken = {
        plaintext: `mem_${repo}_${scope}`,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        scope,
      };
      tokens.set(`${repo}:${scope}`, t);
      return t;
    },
    async list() {
      return [...forks.keys()];
    },
    async getRemote(repo) {
      return `memory://${repo}.git`;
    },
  };
}
