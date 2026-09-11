/**
 * A2A Agent Card for `/.well-known/agent-card.json`.
 * @see https://a2a-protocol.org/latest/specification/#5-agent-discovery-the-agent-card
 */

import { AP2_EXTENSION_URI } from '@/lib/commerce-discovery'
import { getMcpServerCard } from '@/lib/mcp-server-card'
import { getSiteOrigin } from '@/lib/site-url'

function envString(key: string): string | undefined {
  const v = process.env[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

function streamableHttpUrl(origin: string): string {
  return (
    envString('NEXT_PUBLIC_MCP_STREAMABLE_HTTP_URL') ??
    envString('MCP_SERVER_CARD_STREAMABLE_HTTP_URL') ??
    `${origin}/mcp`
  )
}

function a2aJsonRpcUrl(origin: string): string {
  return envString('A2A_JSONRPC_URL') ?? `${origin}/a2a`
}

export function getAgentCard(): Record<string, unknown> {
  const origin = getSiteOrigin().origin.replace(/\/$/, '')
  const mcp = getMcpServerCard()
  const version = String(mcp.version ?? '0.0.0')
  const mcpUrl = streamableHttpUrl(origin)
  const a2aUrl = a2aJsonRpcUrl(origin)

  return {
    name: 'ClawQL',
    description:
      'Agentic Gateway — Foundational Platform for Auditable Production AI. Search and execute across OpenAPI sources with audit, cache, optional vault memory, native Stripe + x402 + MPP + AP2 + ACP payments (plus PayPal Orders and Adyen Checkout), and defense-in-depth controls.',
    version,
    url: a2aUrl,
    provider: {
      organization: 'ClawQL',
      url: origin,
    },
    documentationUrl: `${origin}/agent-setup`,
    iconUrl: `${origin}/ClawQL-logo.jpeg`,
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    supported_interfaces: [
      {
        url: a2aUrl,
        protocol_binding: 'JSONRPC',
        protocol_version: '1.0',
      },
      {
        url: mcpUrl,
        protocol_binding: 'HTTP',
        protocol_version: '2025-11-25',
      },
      {
        url: `${origin}/openapi.json`,
        protocol_binding: 'REST',
        protocol_version: '3.1',
      },
      {
        url: origin,
        protocol_binding: 'HTTPS',
        protocol_version: '1.1',
      },
    ],
    supportedInterfaces: [
      {
        url: a2aUrl,
        protocol_binding: 'JSONRPC',
        protocol_version: '1.0',
      },
      {
        url: mcpUrl,
        protocol_binding: 'HTTP',
        protocol_version: '2025-11-25',
      },
      {
        url: `${origin}/openapi.json`,
        protocol_binding: 'REST',
        protocol_version: '3.1',
      },
      {
        url: origin,
        protocol_binding: 'HTTPS',
        protocol_version: '1.1',
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [
        {
          uri: AP2_EXTENSION_URI,
          description:
            'ClawQL docs commerce discovery — merchant role for x402, UCP, and ACP agentic checkout.',
          params: {
            roles: ['merchant'],
          },
        },
      ],
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'OAuth 2.0 access token from agent registration (auth.md).',
      },
      x402PaymentSignature: {
        type: 'apiKey',
        in: 'header',
        name: 'PAYMENT-SIGNATURE',
        description:
          'x402 v2 payment proof built from the latest PAYMENT-REQUIRED challenge.',
      },
    },
    security: [{ bearerAuth: [] }, { x402PaymentSignature: [] }],
    skills: [
      {
        id: 'search_execute',
        name: 'Search and execute APIs',
        description:
          'Discover operationIds via search, then execute OpenAPI operations through the ClawQL Agentic Gateway with audit and policy enforcement.',
        tags: ['mcp', 'openapi', 'search', 'execute'],
        examples: [
          'Search GitHub API for list repository issues',
          'Execute kubernetes list pods in the default namespace',
        ],
      },
      {
        id: 'commerce_checkout',
        name: 'Agentic commerce checkout',
        description:
          'Commerce discovery for native Stripe + x402 + MPP + AP2 + ACP rails, PayPal Orders, and Adyen Checkout. Live adapters run on self-hosted ClawQL with clawql-payments env flags; docs.clawql.com remains discovery-oriented.',
        tags: ['commerce', 'stripe', 'x402', 'mpp', 'payments'],
        examples: [
          'Probe x402 payment on /api/v1',
          'Read MPP OpenAPI at /openapi.json',
          'Read payments discovery at /.well-known/payments.json',
        ],
      },
      {
        id: 'vault_memory',
        name: 'Vault memory recall and ingest',
        description:
          'Persist and recall Obsidian vault context across agent sessions when memory tools are enabled.',
        tags: ['memory', 'vault', 'obsidian'],
        examples: [
          'Recall prior decisions about Kubernetes deployment',
          'Ingest debugging conclusion with wikilinks',
        ],
      },
    ],
    openApiUrl: `${origin}/openapi.json`,
    skillsUrl: `${origin}/.well-known/agent-skills/index.json`,
    metadata: {
      mcpServerCard: `${origin}/.well-known/mcp/server-card.json`,
      payments: `${origin}/.well-known/payments.json`,
      authMd: `${origin}/auth.md`,
    },
  }
}
