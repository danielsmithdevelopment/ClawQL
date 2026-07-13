import { Context, Effect, Layer } from "effect";
import { ConfigError, X402Error } from "../errors/payment-errors.js";
import { CLAWQL_PLANS } from "../plans/tiers.js";
import { X402GateService } from "../x402/x402-gate-service.js";
import { X402RuntimeConfigService } from "../x402/x402-runtime-config-service.js";
import type { X402Gate } from "../x402/gate.js";
import { buildOffersForGate, paymentInfoFromOffers } from "./offers.js";
import type { MppPaymentInfo, MppServiceInfo } from "./types.js";

export type BuildMppOpenApiOptions = {
  env?: NodeJS.ProcessEnv;
  origin?: string;
  serverName?: string;
  documentationUrl?: string;
  apiVersion?: string;
  serviceInfo?: MppServiceInfo;
};

function httpMethodForPath(path: string): "get" | "post" {
  return path.includes("completions") || path.includes("checkout") ? "post" : "get";
}

function openApiPathForGate(gate: X402Gate): string {
  if (gate.tool?.trim()) {
    return `/mcp/tools/${encodeURIComponent(gate.tool.trim())}`;
  }
  return gate.resource.startsWith("/") ? gate.resource : `/${gate.resource}`;
}

function paidOperation(
  summary: string,
  paymentInfo: MppPaymentInfo,
  method: "get" | "post"
): Record<string, unknown> {
  return {
    [method]: {
      summary,
      "x-payment-info": paymentInfo,
      responses: {
        "200": { description: "Successful response" },
        "402": { description: "Payment Required" },
      },
    },
  };
}

export function composeMppOpenApiDocument(input: {
  origin: string;
  serverName: string;
  documentationUrl: string;
  apiVersion: string;
  gates: X402Gate[];
  x402Config: {
    walletAddress?: string;
    usdcAsset: string;
    network: string;
  };
  stripeEnabled: boolean;
  stripeMetered: boolean;
  serviceInfo?: MppServiceInfo;
}): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const gate of input.gates) {
    const offers = buildOffersForGate({
      gate,
      config: {
        network: input.x402Config.network,
        scheme: "exact",
        usdcAsset: input.x402Config.usdcAsset,
        walletAddress: input.x402Config.walletAddress,
        maxTimeoutSeconds: 300,
      },
      stripeEnabled: input.stripeEnabled,
      stripeMetered: input.stripeMetered,
    });
    const paymentInfo = paymentInfoFromOffers(offers);
    if (!paymentInfo) continue;

    const path = openApiPathForGate(gate);
    const method = httpMethodForPath(path);
    paths[path] = paidOperation(
      gate.tool ? `MCP tool: ${gate.tool}` : `Paid HTTP resource ${gate.resource}`,
      paymentInfo,
      method
    );
  }

  if (input.x402Config.walletAddress?.trim()) {
    paths["/api/v1"] = paidOperation(
      "MPP/x402 commerce discovery probe",
      paymentInfoFromOffers([
        {
          intent: "charge",
          method: "x402",
          amount: "1000",
          currency: input.x402Config.usdcAsset,
          description: "Low-cost x402 gateway probe ($0.001 USDC).",
        },
        ...(input.stripeEnabled
          ? [
              {
                intent: "charge" as const,
                method: "stripe" as const,
                amount: null,
                currency: "usd",
                description: "Stripe metered or subscription billing.",
              },
            ]
          : []),
      ])!,
      "get"
    );
  }

  const origin = input.origin.replace(/\/$/, "");

  return {
    openapi: "3.1.0",
    info: {
      title: input.serverName,
      version: input.apiVersion,
      description:
        "ClawQL MPP discovery document — paid routes for x402 and Stripe. Runtime 402 challenges are authoritative.",
    },
    servers: [{ url: origin }],
    "x-service-info": input.serviceInfo ?? {
      categories: ["developer-tools", "ai", "payments"],
      docs: {
        homepage: origin,
        apiReference: `${origin}/tools`,
        llms: `${origin}/llms.txt`,
      },
    },
    paths,
    "x-clawql-payments": {
      paymentsDiscovery: `${origin}/.well-known/payments.json`,
      documentation: input.documentationUrl,
      rails: ["x402", ...(input.stripeEnabled ? ["stripe"] : [])],
      plans: Object.keys(CLAWQL_PLANS),
    },
  };
}

/** Effect service for `GET /openapi.json` (MPP discovery). */
export class MppOpenApiService extends Context.Tag("clawql/MppOpenApiService")<
  MppOpenApiService,
  {
    readonly buildDocument: (
      options?: BuildMppOpenApiOptions
    ) => Effect.Effect<Record<string, unknown>, ConfigError | X402Error>;
    readonly renderJson: (
      options?: BuildMppOpenApiOptions
    ) => Effect.Effect<string, ConfigError | X402Error>;
  }
>() {}

export function mppOpenApiLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<MppOpenApiService, never, X402RuntimeConfigService | X402GateService> {
  return Layer.effect(
    MppOpenApiService,
    Effect.gen(function* () {
      const runtimeConfig = yield* X402RuntimeConfigService;
      const gates = yield* X402GateService;

      const buildDocument = (options: BuildMppOpenApiOptions = {}) =>
        Effect.gen(function* () {
          const runEnv = options.env ?? env;
          const gateList = yield* gates.list();
          const x402Config = yield* runtimeConfig.load();
          const origin =
            options.origin?.replace(/\/$/, "") ??
            runEnv.CLAWQL_MPP_ORIGIN?.trim() ??
            "http://localhost:8080";
          const stripeEnabled = Boolean(runEnv.STRIPE_SECRET_KEY?.trim());
          const stripeMetered = Boolean(runEnv.STRIPE_METER_EVENT_NAME?.trim());

          return composeMppOpenApiDocument({
            origin,
            serverName: options.serverName?.trim() || "ClawQL",
            documentationUrl:
              options.documentationUrl?.trim() ||
              "https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/payments/clawql-payments.md",
            apiVersion: options.apiVersion?.trim() || "1.0.0",
            gates: gateList,
            x402Config: {
              walletAddress: x402Config.walletAddress,
              usdcAsset: x402Config.usdcAsset,
              network: x402Config.network,
            },
            stripeEnabled,
            stripeMetered,
            serviceInfo: options.serviceInfo,
          });
        });

      return MppOpenApiService.of({
        buildDocument,
        renderJson: (options) =>
          buildDocument(options).pipe(Effect.map((doc) => `${JSON.stringify(doc, null, 2)}\n`)),
      });
    })
  );
}
