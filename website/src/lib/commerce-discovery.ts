/**
 * Agentic commerce discovery for docs.clawql.com (x402, MPP, UCP, ACP).
 * Static metadata for scanners and agents; live settlement runs on self-hosted ClawQL.
 */

import { getSiteOrigin } from '@/lib/site-url'

const AP2_EXTENSION_URI =
  'https://github.com/google-agentic-commerce/ap2/tree/v0.1'

function envString(key: string, fallback: string): string {
  const v = process.env[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback
}

export function getCommerceOrigin(): string {
  return getSiteOrigin().origin.replace(/\/$/, '')
}

export function getX402PayTo(): string {
  return envString(
    'DOCS_X402_PAY_TO',
    '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
  )
}

export function getX402Network(): string {
  return envString('DOCS_X402_NETWORK', 'eip155:84532')
}

export function getX402Asset(): string {
  return envString(
    'DOCS_X402_ASSET',
    '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  )
}

export function getX402ProbeAmountAtomic(): string {
  return envString('DOCS_X402_PROBE_AMOUNT', '1000')
}

/** x402 v2 PAYMENT-REQUIRED body for GET /api/v1 discovery probe. */
export function buildX402PaymentRequired(
  requestUrl: string,
): Record<string, unknown> {
  return {
    x402Version: 2,
    error: 'Payment required',
    resource: {
      url: requestUrl,
      description:
        'ClawQL docs commerce discovery probe — demonstrates x402 v2 PAYMENT-REQUIRED for agent scanners.',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: getX402Network(),
        amount: getX402ProbeAmountAtomic(),
        asset: getX402Asset(),
        payTo: getX402PayTo(),
        maxTimeoutSeconds: 300,
        extra: { name: 'USDC', version: '2' },
      },
    ],
  }
}

export function encodePaymentRequiredHeader(
  body: Record<string, unknown>,
): string {
  return Buffer.from(JSON.stringify(body), 'utf8').toString('base64')
}

function mppPaymentInfo(description: string): Record<string, unknown> {
  return {
    offers: [
      {
        intent: 'charge',
        method: 'x402',
        amount: getX402ProbeAmountAtomic(),
        currency: getX402Asset(),
        description,
      },
      {
        intent: 'charge',
        method: 'stripe',
        amount: null,
        currency: 'usd',
        description: 'Stripe subscription or metered billing for ClawQL plans.',
      },
    ],
  }
}

/** OpenAPI 3.1 with MPP `x-payment-info.offers[]` for agent commerce scanners. */
export function getCommerceOpenApi(): Record<string, unknown> {
  const origin = getCommerceOrigin()

  return {
    openapi: '3.1.0',
    info: {
      title: 'ClawQL Commerce Discovery API',
      version: '1.0.0',
      description:
        'MPP discovery surface for docs.clawql.com. Paid routes advertise x402 and Stripe offers; runtime 402 challenges are authoritative.',
    },
    servers: [{ url: origin }],
    'x-service-info': {
      categories: ['developer-tools', 'ai', 'payments'],
      docs: {
        homepage: origin,
        apiReference: `${origin}/tools`,
        llms: `${origin}/llms.txt`,
      },
    },
    paths: {
      '/api/v1': {
        get: {
          operationId: 'commerceProbe',
          summary: 'MPP/x402 commerce discovery probe',
          description:
            'Returns HTTP 402 with MPP Payment challenge and x402 v2 PAYMENT-REQUIRED.',
          'x-payment-info': mppPaymentInfo(
            'Low-cost x402 gateway probe priced at $0.001 USDC on Base Sepolia.',
          ),
          responses: {
            '200': { description: 'Successful response' },
            '402': { description: 'Payment Required' },
          },
        },
      },
      '/api/commerce/checkout': {
        post: {
          operationId: 'createCheckout',
          summary: 'Create agentic checkout session',
          description:
            'UCP/ACP-aligned checkout stub for commerce discovery. Configure live checkout on self-hosted ClawQL.',
          'x-payment-info': mppPaymentInfo(
            'Agentic checkout for ClawQL Pro/Team plans via x402 or Stripe.',
          ),
          responses: {
            '402': { description: 'Payment Required' },
            '200': { description: 'Checkout session created' },
          },
        },
      },
    },
    'x-clawql-commerce': {
      documentation: `${origin}/payments/clawql-payments`,
      paymentsDiscovery: `${origin}/.well-known/payments.json`,
      ucp: `${origin}/.well-known/ucp`,
      acp: `${origin}/.well-known/acp.json`,
      mpp: `${origin}/openapi.json`,
    },
  }
}

export function getUcpProfile(): Record<string, unknown> {
  const origin = getCommerceOrigin()

  return {
    ucp: {
      version: '2026-04-08',
      spec: 'https://ucp.dev/2026-04-08/specification/overview',
      services: {
        'dev.ucp.shopping': [
          {
            version: '2026-04-08',
            spec: 'https://ucp.dev/2026-04-08/specification/overview',
            transport: 'rest',
            endpoint: origin,
            schema:
              'https://ucp.dev/2026-04-08/services/shopping/rest.openapi.json',
          },
          {
            version: '2026-04-08',
            spec: 'https://ucp.dev/2026-04-08/specification/overview',
            transport: 'mcp',
            endpoint: `${origin}/mcp`,
            schema:
              'https://ucp.dev/2026-04-08/services/shopping/mcp.openrpc.json',
          },
          {
            version: '2026-04-08',
            spec: 'https://ucp.dev/2026-04-08/specification/overview',
            transport: 'a2a',
            endpoint: `${origin}/.well-known/agent-card.json`,
          },
        ],
      },
      capabilities: {
        'dev.ucp.shopping.checkout': [
          {
            version: '2026-04-08',
            spec: 'https://ucp.dev/2026-04-08/specification/checkout',
            schema: 'https://ucp.dev/2026-04-08/schemas/shopping/checkout.json',
          },
        ],
      },
      endpoints: {
        rest: origin,
        mcp: `${origin}/mcp`,
        agentCard: `${origin}/.well-known/agent-card.json`,
      },
    },
  }
}

export function getAcpDiscovery(): Record<string, unknown> {
  const origin = getCommerceOrigin()

  return {
    protocol: {
      name: 'acp',
      version: '2026-01-30',
      supported_versions: ['2026-01-30'],
      documentation_url: 'https://agenticcommerce.dev',
    },
    api_base_url: origin,
    transports: ['rest', 'mcp', 'a2a'],
    capabilities: {
      services: ['checkout', 'orders', 'delegate_payment'],
      extensions: [
        {
          name: 'fulfillment',
          spec: 'https://agenticcommerce.dev/specs/fulfillment',
          schema: 'https://agenticcommerce.dev/schemas/fulfillment.json',
        },
      ],
    },
  }
}

export function getPaymentsWellKnown(): Record<string, unknown> {
  const origin = getCommerceOrigin()

  return {
    version: '1',
    server_name: 'ClawQL Docs Commerce Discovery',
    documentation: `${origin}/payments/clawql-payments`,
    payment_methods: [
      {
        type: 'x402',
        enabled: true,
        x402_version: 2,
        scheme: 'exact',
        network: getX402Network(),
        asset: 'USDC',
        asset_contract: getX402Asset(),
        pay_to: getX402PayTo(),
        resources: [
          {
            kind: 'http',
            id: '/api/v1',
            description: 'x402 v2 commerce discovery probe',
          },
          {
            kind: 'mcp_tool',
            id: 'execute',
            description: 'Self-hosted ClawQL MCP execute (configure gates)',
          },
        ],
        facilitator: 'https://x402.org/facilitator',
        note: 'Discovery document for docs.clawql.com. Live x402 gates are served dynamically on self-hosted ClawQL deployments.',
      },
      {
        type: 'stripe',
        enabled: true,
        billing: 'subscription',
        plans: ['free', 'pro', 'team', 'enterprise'],
        documentation: `${origin}/payments/clawql-payments`,
      },
    ],
    default: 'x402',
    ap2_extension: AP2_EXTENSION_URI,
    issue: 'https://github.com/danielsmithdevelopment/ClawQL/issues/88',
  }
}

export { AP2_EXTENSION_URI }
