import assert from 'node:assert/strict'
import { describe, it, after } from 'node:test'

import {
  buildChatResponseBody,
  enrichDashboardResponse,
  enrichFromToolAudit,
  extractToolAuditFromSessionFile,
  parseEmbeddedDashboardJson,
} from './openclaw-chat-enrich.mjs'
import { replyFromAgentJson } from './openclaw-reply-from-json.mjs'

const fixture = new URL('./fixtures/enrich-session.jsonl', import.meta.url).pathname
const multiturn = new URL('./fixtures/enrich-session-multiturn.jsonl', import.meta.url).pathname

describe('parseEmbeddedDashboardJson', () => {
  it('parses fenced JSON with attachments', () => {
    const reply = 'Done.\n\n```json\n{"reply":"Done.","attachments":[{"kind":"document","id":"d1","title":"x.pdf","provider":"paperless","paperlessId":7}]}\n```'
    const parsed = parseEmbeddedDashboardJson(reply)
    assert.ok(parsed)
    assert.equal(Array.isArray(parsed.attachments), true)
  })

  it('parses bare JSON when structured keys present', () => {
    const parsed = parseEmbeddedDashboardJson('{"steps":[{"label":"x","state":"done"}]}')
    assert.ok(parsed?.steps)
  })
})

describe('enrichFromToolAudit', () => {
  it('maps execute paperless and memory_recall', () => {
    const audit = {
      calls: [
        {
          id: 'c1',
          name: 'clawql__execute',
          args: { operationId: 'paperless::documents_create' },
        },
        { id: 'c2', name: 'clawql__memory_recall', args: { query: 'invoice' } },
      ],
      results: new Map([
        ['c1', { toolName: 'clawql__execute', text: '{"id":42,"title":"invoice.pdf"}', isError: false }],
        [
          'c2',
          {
            toolName: 'clawql__memory_recall',
            text: '{"ok":true,"results":[{"path":"Memory/foo.md","score":2,"snippet":"bar"}]}',
            isError: false,
          },
        ],
      ]),
    }
    const out = enrichFromToolAudit(audit)
    assert.equal(out.steps?.length, 2)
    assert.equal(out.attachments?.length, 1)
    assert.equal(out.citations?.length, 1)
    assert.deepEqual(out.pipelineStatus, { phases: ['paperless'] })
  })

  it('maps stirling execute with merkle root to pipeline attachment', () => {
    const audit = {
      calls: [{ id: 'c1', name: 'clawql__execute', args: { operationId: 'stirling::redact' } }],
      results: new Map([
        ['c1', { toolName: 'clawql__execute', text: '{"merkleRoot":"deadbeef"}', isError: false }],
      ]),
    }
    const out = enrichFromToolAudit(audit)
    assert.equal(out.attachments?.length, 1)
    assert.equal(out.attachments?.[0].kind, 'pipeline')
    assert.equal(out.attachments?.[0].merkleRoot, 'deadbeef')
    assert.deepEqual(out.pipelineStatus, { phases: ['stirling'] })
  })

  it('maps coneshare share link execute to coneshare attachment', () => {
    const audit = {
      calls: [{ id: 'c1', name: 'clawql__execute', args: { operationId: 'coneshare::coneshare_share_links_create' } }],
      results: new Map([
        [
          'c1',
          {
            toolName: 'clawql__execute',
            text: '{"id":"sl-1","title":"Q1 room","public_url":"https://share.example/r/abc"}',
            isError: false,
          },
        ],
      ]),
    }
    const out = enrichFromToolAudit(audit)
    assert.equal(out.attachments?.length, 1)
    assert.equal(out.attachments?.[0].kind, 'coneshare')
    assert.equal(out.attachments?.[0].roomUrl, 'https://share.example/r/abc')
  })

  it('maps knowledge_search_onyx citations', () => {
    const audit = {
      calls: [{ id: 'c1', name: 'clawql__knowledge_search_onyx', args: { query: 'policy' } }],
      results: new Map([
        [
          'c1',
          {
            toolName: 'clawql__knowledge_search_onyx',
            text: '{"results":[{"title":"HR policy","snippet":"vacation","score":0.9,"document_id":"doc-1"}]}',
            isError: false,
          },
        ],
      ]),
    }
    const out = enrichFromToolAudit(audit)
    assert.equal(out.citations?.length, 1)
    assert.equal(out.citations?.[0].title, 'HR policy')
  })

  it('marks errored tools as pending steps', () => {
    const audit = {
      calls: [{ id: 'c1', name: 'clawql__execute', args: { operationId: 'paperless::x' } }],
      results: new Map([['c1', { toolName: 'clawql__execute', text: 'fail', isError: true }]]),
    }
    const out = enrichFromToolAudit(audit)
    assert.equal(out.steps?.[0].state, 'pending')
    assert.equal(out.attachments?.length ?? 0, 0)
  })
})

describe('extractToolAuditFromSessionFile', () => {
  it('reads fixture session and scopes to last user turn', () => {
    const audit = extractToolAuditFromSessionFile(fixture)
    assert.equal(audit.calls.length, 1)
    assert.equal(audit.calls[0].name, 'clawql__execute')
    const out = enrichFromToolAudit(audit)
    assert.equal(out.attachments?.length, 1)
    assert.equal(out.attachments?.[0].paperlessId, 99)
  })

  it('ignores tool calls from prior turns in same session file', () => {
    const audit = extractToolAuditFromSessionFile(multiturn)
    assert.equal(audit.calls.length, 1)
    assert.equal(audit.calls[0].name, 'clawql__execute')
    assert.match(audit.calls[0].args.operationId, /stirling/)
  })

  it('returns empty audit for missing file', () => {
    const audit = extractToolAuditFromSessionFile('/does/not/exist.jsonl')
    assert.equal(audit.calls.length, 0)
  })
})

describe('enrichDashboardResponse', () => {
  it('embedded JSON overrides session-derived steps', () => {
    const merged = enrichDashboardResponse(
      { meta: { agentMeta: { sessionFile: fixture } } },
      '```json\n{"steps":[{"label":"override","state":"done"}]}\n```',
    )
    assert.equal(merged.steps?.[0].label, 'override')
  })
})

describe('buildChatResponseBody', () => {
  const prev = process.env.CLAWQL_DASHBOARD_CHAT_ENRICH

  after(() => {
    if (prev === undefined) delete process.env.CLAWQL_DASHBOARD_CHAT_ENRICH
    else process.env.CLAWQL_DASHBOARD_CHAT_ENRICH = prev
  })

  it('merges session enrichment with reply', () => {
    const body = buildChatResponseBody(
      { meta: { agentMeta: { sessionFile: '/nonexistent/session.jsonl' } } },
      'hello',
    )
    assert.equal(body.reply, 'hello')
  })

  it('skips enrichment when CLAWQL_DASHBOARD_CHAT_ENRICH=0', () => {
    process.env.CLAWQL_DASHBOARD_CHAT_ENRICH = '0'
    const body = buildChatResponseBody(
      { meta: { agentMeta: { sessionFile: fixture } } },
      'hello',
    )
    assert.equal(body.reply, 'hello')
    assert.equal(body.steps, undefined)
  })

  it('end-to-end: openclaw stdout JSON + session file → rich body', () => {
    delete process.env.CLAWQL_DASHBOARD_CHAT_ENRICH
    const agentStdout = {
      payloads: [{ text: 'Uploaded invoice to Paperless.' }],
      meta: { agentMeta: { sessionFile: fixture } },
    }
    const reply = replyFromAgentJson(agentStdout)
    const body = buildChatResponseBody(agentStdout, reply ?? '')
    assert.match(String(body.reply), /Paperless/)
    assert.ok(Array.isArray(body.steps))
    assert.ok(Array.isArray(body.attachments))
  })
})
