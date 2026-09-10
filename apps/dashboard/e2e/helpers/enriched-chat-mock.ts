/** Build SSE blocks matching dashboard stream consumer + bridge format. */
export function sseBlock(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export const enrichedChatDonePayload = {
  reply: 'Archived invoice.pdf to Paperless.',
  steps: [{ label: 'execute paperless::documents_create', state: 'done' as const }],
  attachments: [
    {
      kind: 'document' as const,
      id: 'paperless-42',
      title: 'invoice.pdf',
      provider: 'paperless' as const,
      paperlessId: 42,
    },
  ],
  citations: [
    {
      kind: 'onyx_citation' as const,
      id: 'vault-0',
      title: 'Memory/policy.md',
      snippet: 'vacation policy excerpt',
    },
  ],
  pipelineStatus: { phases: ['paperless'] },
}

export function enrichedChatStreamBody(): string {
  let body = ''
  for (const chunk of ['Archived ', 'invoice.pdf ', 'to Paperless.']) {
    body += sseBlock('delta', { type: 'delta', text: chunk })
  }
  body += sseBlock('done', { type: 'done', ...enrichedChatDonePayload })
  return body
}
