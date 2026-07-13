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

function x402PaymentInfo(description: string): Record<string, unknown> {
  return {
    description,
    authMode: 'paid',
    protocols: [
      {
        x402: {
          scheme: 'exact',
          network: getX402Network(),
          asset: getX402Asset(),
          payTo: getX402PayTo(),
        },
      },
    ],
    price: {
      mode: 'fixed',
      currency: 'USD',
      amount: '0.001',
      min: '0.001',
      max: '0.001',
    },
    network: getX402Network(),
    asset: getX402Asset(),
    payTo: getX402PayTo(),
    retryHeader: 'PAYMENT-SIGNATURE',
    recommendedClient: '@x402/fetch',
  }
}

/** OpenAPI 3.1 with MPP `x-payment-info` extensions for agent commerce scanners. */
export function getCommerceOpenApi(): Record<string, unknown> {
  const origin = getCommerceOrigin()

  return {
    openapi: '3.1.0',
    info: {
      title: 'ClawQL Commerce Discovery API',
      version: '1.0.0',
      description:
        'Discovery-only commerce surface for docs.clawql.com. Paid routes demonstrate x402 v2; production settlement runs on self-hosted ClawQL MCP and inference gateways.',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/v1': {
        get: {
          operationId: 'commerceProbe',
          summary: 'x402 commerce discovery probe',
          description:
            'Returns HTTP 402 with PAYMENT-REQUIRED (x402 v2) for agent readiness scanners.',
          'x-payment-info': x402PaymentInfo(
            'Low-cost x402 gateway probe priced at $0.001 USDC on Base Sepolia.',
          ),
          responses: {
            '402': {
              description: 'Payment required (x402 v2)',
            },
          },
        },
      },
      '/api/commerce/checkout': {
        post: {
          operationId: 'createCheckout',
          summary: 'Create agentic checkout session',
          description:
            'UCP/ACP-aligned checkout stub for commerce discovery. Configure live checkout on self-hosted ClawQL.',
          'x-payment-info': x402PaymentInfo(
            'Agentic checkout for ClawQL Pro/Team plans via x402 or Stripe.',
          ),
          responses: {
            '402': { description: 'Payment required' },
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
