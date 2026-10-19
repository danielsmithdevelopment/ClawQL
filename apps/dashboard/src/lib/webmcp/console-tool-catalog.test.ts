import { describe, expect, it } from 'vitest'
import {
  CONSOLE_WEBMCP_TOOLS,
  CONSOLE_WEBMCP_TOOL_NAMES,
  WEBMCP_OUTPUT_CHAR_BUDGET,
  auditConsoleWebMcpCatalog,
  draftApprovalRule,
  executeConsoleWebMcpTool,
  getRequestDetail,
  isForbiddenApproveToolName,
  listPendingRequests,
} from './console-tool-catalog'

describe('console WebMCP catalog', () => {
  it('passes approval-integrity audit (no approve tool; required reads present)', () => {
    const audit = auditConsoleWebMcpCatalog()
    expect(audit.ok).toBe(true)
    expect(audit.forbidden_hits).toEqual([])
    expect(audit.missing_required).toEqual([])
    expect(audit.tool_count).toBe(CONSOLE_WEBMCP_TOOL_NAMES.length)
  })

  it('rejects forbidden approve-shaped names', () => {
    expect(isForbiddenApproveToolName('approve_request')).toBe(true)
    expect(isForbiddenApproveToolName('decline_change')).toBe(true)
    expect(isForbiddenApproveToolName('confirm_approval')).toBe(true)
    expect(isForbiddenApproveToolName('list_pending_requests')).toBe(false)
  })

  it('keeps Chrome name/description budgets', () => {
    for (const tool of CONSOLE_WEBMCP_TOOLS) {
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(30)
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(500)
      if (tool.annotations) {
        for (const [k, v] of Object.entries(tool.annotations)) {
          expect(v, `${tool.name}.${k}`).toBe(true)
        }
      }
    }
  })

  it('lists pending requests and surfaces exact change without approving', () => {
    const list = listPendingRequests({})
    expect(list.ok).toBe(true)
    expect(list.total_count).toBeGreaterThan(0)
    expect(list.note).toMatch(/no WebMCP approve tool/i)

    const detail = getRequestDetail({ request_id: 'rev_change' })
    expect(detail).toMatchObject({
      ok: true,
      approval: { can_approve_via_webmcp: false },
    })
    if ('exact_change' in detail && detail.exact_change) {
      expect(detail.exact_change.digest).toContain('4e7c')
    }
  })

  it('draft_approval_rule never persists', () => {
    const draft = draftApprovalRule({
      when: 'Writes to payroll',
      who: 'Finance approvers',
      require_security_key: true,
    })
    expect(draft).toMatchObject({ ok: true, persisted: false, status: 'draft_only' })
  })

  it('execute path returns JSON under output budget', async () => {
    const raw = await executeConsoleWebMcpTool('list_pending_requests', {})
    expect(raw.length).toBeLessThanOrEqual(WEBMCP_OUTPUT_CHAR_BUDGET)
    const parsed = JSON.parse(raw) as { ok: boolean }
    expect(parsed.ok).toBe(true)
  })

  it('agent looking for an approve tool finds none (integrity cell)', () => {
    const approveLike = CONSOLE_WEBMCP_TOOL_NAMES.filter(isForbiddenApproveToolName)
    expect(approveLike).toEqual([])
    expect(CONSOLE_WEBMCP_TOOL_NAMES.includes('approve_request')).toBe(false)
  })
})
