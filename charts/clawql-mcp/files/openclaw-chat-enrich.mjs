/**
 * Map OpenClaw session tool audit → ClawQL dashboard chat JSON (steps, attachments, citations).
 * Used by openclaw-chat-bridge.mjs (local + Helm chart copy).
 */

import fs from 'node:fs'

const CLAWQL_TOOL_PREFIX = 'clawql__'

const IDP_STAGE_BY_PROVIDER = [
  { re: /^tika::/i, stage: 'tika' },
  { re: /^gotenberg::/i, stage: 'gotenberg' },
  { re: /^stirling::/i, stage: 'stirling' },
  { re: /^paperless::/i, stage: 'paperless' },
  { re: /^onyx::/i, stage: 'onyx' },
  { re: /^nextcloud::/i, stage: 'nextcloud' },
  { re: /^coneshare::/i, stage: 'coneshare' },
]

/** @typedef {{ label: string; state: 'done' | 'active' | 'pending' }} ChatToolStep */
/** @typedef {Record<string, unknown>} ChatAttachment */

/**
 * @param {unknown} content
 * @returns {string}
 */
function textFromToolContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      if (block && typeof block === 'object' && typeof block.text === 'string') return block.text
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * @param {string} text
 * @returns {unknown | null}
 */
function tryParseJson(text) {
  if (!text || typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

/**
 * @param {string} reply
 * @returns {Record<string, unknown> | null}
 */
export function parseEmbeddedDashboardJson(reply) {
  if (typeof reply !== 'string' || !reply.trim()) return null

  const fence = reply.match(/```(?:json)?\s*\n([\s\S]*?)```/i)
  if (fence?.[1]) {
    const parsed = tryParseJson(fence[1])
    if (parsed && typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return /** @type {Record<string, unknown>} */ (parsed)
    }
  }

  const parsed = tryParseJson(reply)
  if (parsed && typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    if ('attachments' in parsed || 'steps' in parsed || 'citations' in parsed || 'pipelineStatus' in parsed) {
      return /** @type {Record<string, unknown>} */ (parsed)
    }
  }
  return null
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 * @returns {string}
 */
function stepLabelForTool(toolName, args) {
  const bare = toolName.startsWith(CLAWQL_TOOL_PREFIX) ? toolName.slice(CLAWQL_TOOL_PREFIX.length) : toolName
  if (bare === 'execute') {
    const op =
      (typeof args.operationId === 'string' && args.operationId) ||
      (typeof args.operation_id === 'string' && args.operation_id) ||
      (typeof args.tool === 'string' && args.tool) ||
      ''
    return op ? `execute ${op}` : 'execute'
  }
  if (bare === 'search') {
    const q = typeof args.query === 'string' ? args.query.slice(0, 80) : ''
    return q ? `search "${q}"` : 'search'
  }
  if (bare === 'knowledge_search_onyx') {
    const q = typeof args.query === 'string' ? args.query.slice(0, 80) : ''
    return q ? `knowledge_search_onyx "${q}"` : 'knowledge_search_onyx'
  }
  return bare
}

/**
 * @param {string} operationId
 * @returns {string | null}
 */
function idpStageFromOperationId(operationId) {
  for (const { re, stage } of IDP_STAGE_BY_PROVIDER) {
    if (re.test(operationId)) return stage
  }
  return null
}

/**
 * @param {string} id
 * @param {unknown} parsed
 * @param {ChatAttachment[]} attachments
 * @param {ChatAttachment[]} citations
 */
function mapExecuteResult(operationId, parsed, attachments, citations) {
  if (!parsed || typeof parsed !== 'object') return
  const row = /** @type {Record<string, unknown>} */ (parsed)

  const merkleRoot =
    (typeof row.merkleRoot === 'string' && row.merkleRoot) ||
    (typeof row.merkle_root === 'string' && row.merkle_root) ||
    (row.audit && typeof row.audit === 'object' && typeof /** @type {Record<string, unknown>} */ (row.audit).merkleRoot === 'string'
      ? /** @type {Record<string, unknown>} */ (row.audit).merkleRoot
      : null)

  const stage = idpStageFromOperationId(operationId)
  if (stage && (merkleRoot || /stirling|redact/i.test(operationId))) {
    attachments.push({
      kind: 'pipeline',
      id: `pipe-${stage}-${attachments.length}`,
      stage,
      status: 'done',
      ...(merkleRoot ? { merkleRoot: String(merkleRoot) } : {}),
    })
  }

  const docId =
    row.id ??
    row.document_id ??
    row.documentId ??
    (row.result && typeof row.result === 'object'
      ? /** @type {Record<string, unknown>} */ (row.result).id
      : undefined)

  if (/paperless/i.test(operationId) && docId != null) {
    const title =
      (typeof row.title === 'string' && row.title) ||
      (typeof row.original_file_name === 'string' && row.original_file_name) ||
      `Paperless document ${docId}`
    attachments.push({
      kind: 'document',
      id: `paperless-${docId}`,
      title,
      provider: 'paperless',
      paperlessId: Number(docId),
    })
  }

  if (/nextcloud/i.test(operationId)) {
    const filePath =
      (typeof row.filePath === 'string' && row.filePath) ||
      (typeof row.path === 'string' && row.path) ||
      undefined
    const title =
      (typeof row.title === 'string' && row.title) ||
      (filePath ? filePath.split('/').pop() : undefined) ||
      'Nextcloud file'
    attachments.push({
      kind: 'document',
      id: `nextcloud-${attachments.length}`,
      title,
      provider: 'nextcloud',
      url: typeof row.url === 'string' ? row.url : undefined,
    })
  }

  if (/coneshare/i.test(operationId)) {
    const roomUrl =
      (typeof row.public_url === 'string' && row.public_url) ||
      (typeof row.room_url === 'string' && row.room_url) ||
      (typeof row.roomUrl === 'string' && row.roomUrl) ||
      undefined
    const title =
      (typeof row.title === 'string' && row.title) ||
      (typeof row.name === 'string' && row.name) ||
      'Coneshare link'
    attachments.push({
      kind: 'coneshare',
      id: `coneshare-${attachments.length}`,
      title,
      roomUrl,
      linkId: typeof row.id === 'string' ? row.id : undefined,
    })
  }

  if (/onyx/i.test(operationId) && Array.isArray(row.results)) {
    for (const hit of row.results.slice(0, 5)) {
      if (!hit || typeof hit !== 'object') continue
      const h = /** @type {Record<string, unknown>} */ (hit)
      citations.push({
        kind: 'onyx_citation',
        id: `onyx-${citations.length}`,
        title: String(h.title ?? h.document_id ?? h.path ?? 'Onyx result'),
        snippet: typeof h.snippet === 'string' ? h.snippet.slice(0, 240) : undefined,
        score: typeof h.score === 'number' ? h.score : undefined,
        documentId: typeof h.document_id === 'string' ? h.document_id : undefined,
      })
    }
  }
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 * @param {string} resultText
 * @param {boolean} isError
 * @param {ChatAttachment[]} attachments
 * @param {ChatAttachment[]} citations
 */
function mapToolResult(toolName, args, resultText, isError, attachments, citations) {
  const bare = toolName.startsWith(CLAWQL_TOOL_PREFIX) ? toolName.slice(CLAWQL_TOOL_PREFIX.length) : toolName
  const parsed = tryParseJson(resultText)

  if (bare === 'memory_recall' && parsed && typeof parsed === 'object') {
    const row = /** @type {Record<string, unknown>} */ (parsed)
    if (Array.isArray(row.results)) {
      for (const hit of row.results.slice(0, 5)) {
        if (!hit || typeof hit !== 'object') continue
        const h = /** @type {Record<string, unknown>} */ (hit)
        citations.push({
          kind: 'onyx_citation',
          id: `vault-${citations.length}`,
          title: String(h.path ?? h.title ?? 'Vault note'),
          snippet: typeof h.snippet === 'string' ? h.snippet.slice(0, 240) : undefined,
          score: typeof h.score === 'number' ? h.score : undefined,
        })
      }
    }
  }

  if (bare === 'knowledge_search_onyx' && parsed && typeof parsed === 'object') {
    const row = /** @type {Record<string, unknown>} */ (parsed)
    const hits = row.results ?? row.citations ?? row.documents
    if (Array.isArray(hits)) {
      for (const hit of hits.slice(0, 5)) {
        if (!hit || typeof hit !== 'object') continue
        const h = /** @type {Record<string, unknown>} */ (hit)
        citations.push({
          kind: 'onyx_citation',
          id: `onyx-${citations.length}`,
          title: String(h.title ?? h.document_id ?? 'Onyx citation'),
          snippet: typeof h.snippet === 'string' ? h.snippet.slice(0, 240) : undefined,
          score: typeof h.score === 'number' ? h.score : undefined,
          documentId: typeof h.document_id === 'string' ? h.document_id : undefined,
        })
      }
    }
  }

  if (bare === 'execute' && !isError) {
    const op =
      (typeof args.operationId === 'string' && args.operationId) ||
      (typeof args.operation_id === 'string' && args.operation_id) ||
      ''
    if (op) mapExecuteResult(op, parsed ?? rowFromExecuteText(resultText), attachments, citations)
  }
}

/**
 * @param {string} text
 * @returns {Record<string, unknown> | null}
 */
function rowFromExecuteText(text) {
  const parsed = tryParseJson(text)
  if (parsed && typeof parsed === 'object') return /** @type {Record<string, unknown>} */ (parsed)
  const idMatch = text.match(/"id"\s*:\s*(\d+)/)
  if (idMatch) return { id: Number(idMatch[1]) }
  return null
}

/**
 * @param {string} sessionFilePath
 * @returns {{ calls: Array<{ id: string; name: string; args: Record<string, unknown> }>; results: Map<string, { toolName: string; text: string; isError: boolean }> }}
 */
export function extractToolAuditFromSessionFile(sessionFilePath) {
  const empty = { calls: [], results: new Map() }
  if (!sessionFilePath || !fs.existsSync(sessionFilePath)) return empty

  const lines = fs.readFileSync(sessionFilePath, 'utf8').split('\n')
  let lastUserLineIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const row = tryParseJson(lines[i])
    if (!row || row.type !== 'message') continue
    const msg = row.message
    if (msg && msg.role === 'user') lastUserLineIdx = i
  }

  const startIdx = lastUserLineIdx >= 0 ? lastUserLineIdx : 0
  /** @type {Array<{ id: string; name: string; args: Record<string, unknown> }>} */
  const calls = []
  /** @type {Map<string, { toolName: string; text: string; isError: boolean }>} */
  const results = new Map()

  for (let i = startIdx; i < lines.length; i++) {
    const row = tryParseJson(lines[i])
    if (!row || row.type !== 'message') continue
    const msg = row.message
    if (!msg || typeof msg !== 'object') continue

    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (!block || block.type !== 'toolCall') continue
        if (typeof block.name !== 'string' || !block.name.startsWith(CLAWQL_TOOL_PREFIX)) continue
        calls.push({
          id: String(block.id ?? `call-${calls.length}`),
          name: block.name,
          args:
            block.arguments && typeof block.arguments === 'object'
              ? /** @type {Record<string, unknown>} */ (block.arguments)
              : {},
        })
      }
    }

    if (msg.role === 'toolResult' && typeof msg.toolCallId === 'string') {
      const toolName = typeof msg.toolName === 'string' ? msg.toolName : ''
      if (!toolName.startsWith(CLAWQL_TOOL_PREFIX)) continue
      results.set(msg.toolCallId, {
        toolName,
        text: textFromToolContent(msg.content),
        isError: msg.isError === true,
      })
    }
  }

  return { calls, results }
}

/**
 * @param {{ calls: Array<{ id: string; name: string; args: Record<string, unknown> }>; results: Map<string, { toolName: string; text: string; isError: boolean }> }} audit
 */
export function enrichFromToolAudit(audit) {
  /** @type {ChatToolStep[]} */
  const steps = []
  /** @type {ChatAttachment[]} */
  const attachments = []
  /** @type {ChatAttachment[]} */
  const citations = []
  /** @type {Array<{ name: string; args?: unknown; resultPreview?: string }>} */
  const toolCalls = []
  /** @type {string[]} */
  const phases = []

  for (const call of audit.calls) {
    const result = audit.results.get(call.id)
    const isError = result?.isError === true
    const state = isError ? 'pending' : 'done'
    steps.push({ label: stepLabelForTool(call.name, call.args), state })

    if (call.name.endsWith('__execute')) {
      const op =
        (typeof call.args.operationId === 'string' && call.args.operationId) ||
        (typeof call.args.operation_id === 'string' && call.args.operation_id) ||
        ''
      const stage = op ? idpStageFromOperationId(op) : null
      if (stage && !phases.includes(stage)) phases.push(stage)
    }

    toolCalls.push({
      name: call.name,
      args: call.args,
      resultPreview: result?.text ? result.text.slice(0, 280) : undefined,
    })

    if (result) {
      mapToolResult(call.name, call.args, result.text, isError, attachments, citations)
    }
  }

  /** @type {Record<string, unknown>} */
  const out = {}
  if (steps.length) out.steps = steps
  if (attachments.length) out.attachments = attachments
  if (citations.length) out.citations = citations
  if (toolCalls.length) out.toolCalls = toolCalls
  if (phases.length) out.pipelineStatus = { phases }
  return out
}

/**
 * @param {unknown} parsedAgentJson
 * @param {string} reply
 * @returns {Record<string, unknown>}
 */
export function enrichDashboardResponse(parsedAgentJson, reply) {
  /** @type {Record<string, unknown>} */
  const merged = {}

  const sessionFile =
    parsedAgentJson &&
    typeof parsedAgentJson === 'object' &&
    parsedAgentJson.meta &&
    typeof parsedAgentJson.meta === 'object' &&
    parsedAgentJson.meta.agentMeta &&
    typeof parsedAgentJson.meta.agentMeta === 'object' &&
    typeof parsedAgentJson.meta.agentMeta.sessionFile === 'string'
      ? parsedAgentJson.meta.agentMeta.sessionFile
      : null

  if (sessionFile) {
    const audit = extractToolAuditFromSessionFile(sessionFile)
    Object.assign(merged, enrichFromToolAudit(audit))
  }

  const embedded = parseEmbeddedDashboardJson(reply)
  if (embedded) {
    if (Array.isArray(embedded.steps)) merged.steps = embedded.steps
    if (Array.isArray(embedded.attachments)) merged.attachments = embedded.attachments
    if (Array.isArray(embedded.citations)) merged.citations = embedded.citations
    if (Array.isArray(embedded.toolCalls)) merged.toolCalls = embedded.toolCalls
    if (embedded.pipelineStatus && typeof embedded.pipelineStatus === 'object') {
      merged.pipelineStatus = embedded.pipelineStatus
    }
    if (typeof embedded.reply === 'string' && embedded.reply.trim()) {
      merged.reply = embedded.reply.trim()
    }
  }

  return merged
}

/**
 * @param {unknown} parsedAgentJson
 * @param {string} reply
 * @returns {Record<string, unknown>}
 */
export function buildChatResponseBody(parsedAgentJson, reply) {
  const base = { reply: reply ?? '(empty response)' }
  if (process.env.CLAWQL_DASHBOARD_CHAT_ENRICH === '0') return base
  const enriched = enrichDashboardResponse(parsedAgentJson, reply ?? '')
  return { ...base, ...enriched, reply: enriched.reply ?? base.reply }
}
