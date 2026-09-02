import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { Effect } from "effect";

import { NetworkCommandError } from "../errors.js";
import { commandAvailable, spawnCollect } from "../internal/subprocess.js";
import { headscaleConfigPath, headscaleDir } from "../internal/paths.js";

export type HeadscaleBootstrapConfig = {
  readonly controlPlaneHost: string;
  readonly derpMapPath?: string;
  readonly namespace?: string;
  readonly loginServerUrl?: string;
};

export type HeadscaleBootstrapResult = {
  readonly controlPlaneHost: string;
  readonly configPath: string;
  readonly namespace: string;
  readonly loginServerUrl: string;
  readonly bootstrapped: boolean;
};

const isLocalControlPlane = (host: string): boolean => {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("localhost:")
  );
};

const defaultLoginServerUrl = (host: string): string => {
  if (host.startsWith("http://") || host.startsWith("https://")) return host;
  return `https://${host}`;
};

const writeHeadscaleConfigTemplate = (
  config: HeadscaleBootstrapConfig,
  loginServerUrl: string
): Effect.Effect<string, never> =>
  Effect.tryPromise({
    try: async () => {
      const dir = headscaleDir();
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const path = headscaleConfigPath();
      if (!existsSync(path)) {
        const lines = [
          "# ClawQL-managed Headscale config template (operator may customize)",
          `server_url: ${loginServerUrl}`,
          "listen_addr: 0.0.0.0:8080",
          "metrics_listen_addr: 127.0.0.1:9090",
          "grpc_listen_addr: 0.0.0.0:50443",
          "noise:",
          "  private_key_path: noise_private.key",
          "prefixes:",
          "  v4: 100.64.0.0/10",
          "  v6: fd7a:115c:a1e0::/48",
          "dns_config:",
          "  magic_dns: true",
          "  base_domain: clawql.local",
          ...(config.derpMapPath ? ["derp:", "  urls:", `    - file://${config.derpMapPath}`] : []),
          "",
        ];
        await writeFile(path, lines.join("\n"), { encoding: "utf8", mode: 0o600 });
      }
      return path;
    },
    catch: () => headscaleConfigPath(),
  }).pipe(Effect.catchAll(() => Effect.succeed(headscaleConfigPath())));

/** Stand up or record Headscale control-plane settings (spec §4). */
export const bootstrapHeadscale = (
  config: HeadscaleBootstrapConfig
): Effect.Effect<HeadscaleBootstrapResult, NetworkCommandError> =>
  Effect.gen(function* () {
    const namespace = config.namespace ?? "clawql";
    const loginServerUrl = config.loginServerUrl ?? defaultLoginServerUrl(config.controlPlaneHost);
    const configPath = yield* writeHeadscaleConfigTemplate(config, loginServerUrl);

    let bootstrapped = false;
    const headscaleCli = yield* commandAvailable("headscale");
    if (headscaleCli && isLocalControlPlane(config.controlPlaneHost)) {
      yield* spawnCollect("headscale", ["namespaces", "create", namespace], {
        timeoutMs: 30_000,
      }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
      bootstrapped = true;
    }

    return {
      controlPlaneHost: config.controlPlaneHost,
      configPath,
      namespace,
      loginServerUrl,
      bootstrapped,
    };
  });
