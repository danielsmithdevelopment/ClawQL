/**
 * Environment bootstrap for ClawQL self-hosted ID-JAG issuer (EMA IdP).
 * Effect-primary — no Promise domain API.
 */

import { spawn } from "node:child_process";
import { Effect } from "effect";

import type { AuthEventSink } from "../audit/auth-events.js";
import { createAuthEventSinkFromEnv } from "../audit/auth-worm-sink.js";
import { warnIfIdJagIssuerSharesMcpOAuthKey } from "../audit/mcp-oauth-startup-warnings.js";
import type { SecretStore } from "../stores/index.js";
import {
  createSecretStoreEmaConnectorRegistry,
  type EmaConnectorRegistry,
} from "./ema-connector-registry.js";
import {
  createIdJagIssuerService,
  fixedOrgMaterialResolver,
  type IdJagIssuerOrgMaterial,
  type IdJagIssuerService,
} from "./id-jag-issuer.js";
import {
  createLocalIdJagAssertionSigner,
  createTeeIdJagAssertionSigner,
  type IdJagAssertionSigner,
  type IdJagSignRequest,
} from "./id-jag-tee-signer.js";
import {
  loadMcpOAuthSigningMaterialEffect,
  type McpOAuthSigningError,
  type McpOAuthSigningMaterial,
} from "./mcp-oauth-signing.js";

export type IdJagIssuerRuntime = {
  service: IdJagIssuerService["Type"];
  connectors: EmaConnectorRegistry;
  material: IdJagIssuerOrgMaterial;
  /** Layer C signer when TEE env flags / host inject `assertionSigner`. */
  assertionSigner?: IdJagAssertionSigner;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseCmdLine(cmd: string): { bin: string; args: string[] } | null {
  const parts = cmd.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return { bin: parts[0]!, args: parts.slice(1) };
}

/** Spawn external TEE/HSM signer: JSON `{claims,header}` on stdin → compact JWS on stdout. */
export function createExternalCmdIdJagAssertionSigner(cmdLine: string): IdJagAssertionSigner {
  const parsed = parseCmdLine(cmdLine);
  if (!parsed) {
    return createTeeIdJagAssertionSigner({
      teeSign: () => Effect.fail(new Error("empty_tee_sign_cmd")),
    });
  }
  return createTeeIdJagAssertionSigner({
    teeSign: (request: IdJagSignRequest) =>
      Effect.tryPromise({
        try: () =>
          new Promise<string>((resolve, reject) => {
            const child = spawn(parsed.bin, parsed.args, {
              stdio: ["pipe", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            const timer = setTimeout(() => {
              child.kill("SIGKILL");
              reject(new Error("tee_sign_cmd_timeout"));
            }, 30_000);
            child.stdout.on("data", (chunk: Buffer) => {
              stdout += chunk.toString("utf8");
            });
            child.stderr.on("data", (chunk: Buffer) => {
              stderr += chunk.toString("utf8");
            });
            child.on("error", (err) => {
              clearTimeout(timer);
              reject(err);
            });
            child.on("close", (code) => {
              clearTimeout(timer);
              if (code !== 0) {
                reject(
                  new Error(`tee_sign_cmd_exit_${code}${stderr ? `: ${stderr.slice(0, 200)}` : ""}`)
                );
                return;
              }
              const jwt = stdout.trim();
              if (!jwt || jwt.split(".").length !== 3) {
                reject(new Error("tee_sign_cmd_invalid_jwt"));
                return;
              }
              resolve(jwt);
            });
            child.stdin.write(JSON.stringify({ claims: request.claims, header: request.header }));
            child.stdin.end();
          }),
        catch: (cause) => cause,
      }),
  });
}

function resolveAssertionSignerFromEnv(
  env: NodeJS.ProcessEnv,
  signing: McpOAuthSigningMaterial,
  injected?: IdJagAssertionSigner
): IdJagAssertionSigner | undefined {
  if (injected) return injected;
  const signCmd = env.CLAWQL_ID_JAG_TEE_SIGN_CMD?.trim();
  if (signCmd) {
    return createExternalCmdIdJagAssertionSigner(signCmd);
  }
  if (envFlag("CLAWQL_ID_JAG_TEE_SIGNER", env)) {
    const local = createLocalIdJagAssertionSigner(signing);
    return createTeeIdJagAssertionSigner({
      teeSign: (request) => local.sign(request),
    });
  }
  return undefined;
}

export function isIdJagIssuerEnabled(env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> {
  return Effect.sync(
    () =>
      envFlag("CLAWQL_ID_JAG_ISSUER_ENABLED", env) ||
      Boolean(
        env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM?.trim() ||
        env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH?.trim() ||
        env.CLAWQL_ID_JAG_ISSUER_SIGNING_SECRET?.trim()
      )
  );
}

/**
 * Build a single-org ID-JAG issuer from env when enabled.
 * Prefers dedicated issuer key material; falls back to MCP OAuth RS256/HS256 keys.
 *
 * Layer C:
 * - `CLAWQL_ID_JAG_TEE_SIGN_CMD` — external attested signer (stdin JSON → stdout JWS)
 * - `CLAWQL_ID_JAG_TEE_SIGNER=1` — wrap local jose as TEE-shaped (`kind: "tee"`)
 * - `assertionSigner` option — host inject (`clawql-tee` / HSM)
 */
export function createIdJagIssuerFromEnv(options: {
  env?: NodeJS.ProcessEnv;
  secretStore: SecretStore;
  eventSink?: AuthEventSink;
  /** Public origin used to derive jwksUri when unset. */
  publicOrigin?: string;
  /**
   * Host-injected Layer C signer (e.g. `createDevTeeIdJagSigner` from `clawql-tee`).
   * When unset, see `CLAWQL_ID_JAG_TEE_SIGN_CMD` / `CLAWQL_ID_JAG_TEE_SIGNER`.
   */
  assertionSigner?: IdJagAssertionSigner;
}): Effect.Effect<IdJagIssuerRuntime | null, McpOAuthSigningError> {
  return Effect.gen(function* () {
    const env = options.env ?? process.env;
    if (!(yield* isIdJagIssuerEnabled(env))) return null;

    yield* warnIfIdJagIssuerSharesMcpOAuthKey(env);

    const orgId = env.CLAWQL_ID_JAG_ISSUER_ORG_ID?.trim() || env.CLAWQL_DEFAULT_ORG_ID?.trim();
    if (!orgId) {
      return yield* Effect.dieMessage(
        "CLAWQL_ID_JAG_ISSUER_ENABLED requires CLAWQL_ID_JAG_ISSUER_ORG_ID (or CLAWQL_DEFAULT_ORG_ID)"
      );
    }

    const signing: McpOAuthSigningMaterial = yield* loadMcpOAuthSigningMaterialEffect({
      signingSecret:
        env.CLAWQL_ID_JAG_ISSUER_SIGNING_SECRET?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_SECRET?.trim(),
      privateKeyPem:
        env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM?.trim(),
      privateKeyPemPath:
        env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH?.trim(),
      publicKeyPem:
        env.CLAWQL_ID_JAG_ISSUER_PUBLIC_KEY_PEM?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PUBLIC_KEY_PEM?.trim(),
      publicKeyPemPath:
        env.CLAWQL_ID_JAG_ISSUER_PUBLIC_KEY_PEM_PATH?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PUBLIC_KEY_PEM_PATH?.trim(),
      keyId:
        env.CLAWQL_ID_JAG_ISSUER_KEY_ID?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_KEY_ID?.trim() ||
        "clawql-id-jag-issuer",
    });

    const publicOrigin = (
      options.publicOrigin ||
      env.CLAWQL_ID_JAG_ISSUER_ORIGIN?.trim() ||
      env.CLAWQL_PUBLIC_ORIGIN?.trim() ||
      "https://clawql.local"
    ).replace(/\/$/, "");

    const issuer = env.CLAWQL_ID_JAG_ISSUER_URI?.trim() || `${publicOrigin}/oauth/id-jag/${orgId}`;
    const jwksUri =
      env.CLAWQL_ID_JAG_ISSUER_JWKS_URI?.trim() ||
      `${publicOrigin}/.well-known/id-jag-jwks.json?orgId=${encodeURIComponent(orgId)}`;

    const material: IdJagIssuerOrgMaterial = {
      orgId,
      issuer,
      jwksUri,
      signing,
    };

    const assertionSigner = resolveAssertionSignerFromEnv(env, signing, options.assertionSigner);

    const connectors = createSecretStoreEmaConnectorRegistry(options.secretStore);
    const service = createIdJagIssuerService({
      connectors,
      resolveOrgMaterial: fixedOrgMaterialResolver(material),
      eventSink: options.eventSink ?? createAuthEventSinkFromEnv(env),
      assertionSigner,
    });

    return { service, connectors, material, assertionSigner };
  });
}
