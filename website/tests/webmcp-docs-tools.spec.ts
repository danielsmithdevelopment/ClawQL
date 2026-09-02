import { expect, test } from '@playwright/test'

/**
 * Injects a WebMCP stub and asserts docs tools register + execute.
 * Real Chrome WebMCP is origin-trial / flag gated; this covers our registration surface.
 */
test.describe('WebMCP docs tools', () => {
  test('registers sitewide tools and executes search / sections / markdown', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.addInitScript(() => {
      const tools = new Map<
        string,
        {
          name: string
          description: string
          execute: (input: object, client?: { signal?: AbortSignal }) => Promise<unknown>
        }
      >()
      const modelContext = {
        async registerTool(tool: {
          name: string
          description: string
          execute: (input: object, client?: { signal?: AbortSignal }) => Promise<unknown>
        }, options?: { signal?: AbortSignal }) {
          tools.set(tool.name, tool)
          options?.signal?.addEventListener('abort', () => {
            tools.delete(tool.name)
          })
        },
        async getTools() {
          return [...tools.values()].map((t) => ({
            name: t.name,
            description: t.description,
          }))
        },
        async executeTool(name: string, input: object) {
          const tool = tools.get(name)
          if (!tool) throw new Error(`missing tool ${name}`)
          return tool.execute(input, {})
        },
        __tools: tools,
      }
      Object.defineProperty(document, 'modelContext', {
        configurable: true,
        get: () => modelContext,
      })
      Object.defineProperty(navigator, 'modelContext', {
        configurable: true,
        get: () => modelContext,
      })
      ;(window as unknown as { __webmcpStub: typeof modelContext }).__webmcpStub =
        modelContext
    })

    await page.goto('/', { waitUntil: 'load' })
    await page.waitForFunction(() => {
      const stub = (window as unknown as { __webmcpStub?: { __tools: Map<string, unknown> } })
        .__webmcpStub
      return stub && stub.__tools.has('clawql.docs.search')
    })

    const names = await page.evaluate(async () => {
      const stub = (window as unknown as {
        __webmcpStub: { getTools: () => Promise<Array<{ name: string }>> }
      }).__webmcpStub
      const tools = await stub.getTools()
      return tools.map((t) => t.name).sort()
    })

    expect(names).toEqual(
      expect.arrayContaining([
        'clawql.docs.search',
        'clawql.docs.list_routes',
        'clawql.docs.list_sections',
        'clawql.docs.get_page_markdown',
        'clawql.docs.navigate',
        'clawql.docs.page_context',
        'clawql.docs.scroll_to_section',
        'clawql.docs.reveal_agent_lab',
        'clawql.docs.claim_starter_pack',
      ]),
    )
    expect(names).not.toContain('clawql.docs.filter_plugin_registry')

    await expect(page.locator('#clawql-agent-lab')).toHaveCount(0)

    const lab = await page.evaluate(async () => {
      const stub = (window as unknown as {
        __webmcpStub: {
          executeTool: (name: string, input: object) => Promise<unknown>
        }
      }).__webmcpStub
      return stub.executeTool('clawql.docs.reveal_agent_lab', {})
    })
    expect(lab).toMatchObject({ ok: true, unlocked: true })
    await expect(page.locator('#clawql-agent-lab')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'ClawQL Agent Lab' })).toBeVisible()

    const pack = await page.evaluate(async () => {
      const stub = (window as unknown as {
        __webmcpStub: {
          executeTool: (name: string, input: object) => Promise<unknown>
        }
      }).__webmcpStub
      return stub.executeTool('clawql.docs.claim_starter_pack', {})
    })
    expect(pack).toMatchObject({ ok: true })
    expect(String((pack as { mcpJson?: string }).mcpJson ?? '')).toContain(
      'clawql-mcp',
    )
    await expect(page.getByText(/Starter pack claimed/i)).toBeVisible()

    const search = await page.evaluate(async () => {
      const stub = (window as unknown as {
        __webmcpStub: {
          executeTool: (name: string, input: object) => Promise<unknown>
        }
      }).__webmcpStub
      return stub.executeTool('clawql.docs.search', {
        query: 'memory',
        limit: 5,
      })
    })
    expect(search).toMatchObject({ ok: true })
    expect((search as { count: number }).count).toBeGreaterThan(0)

    const routes = await page.evaluate(async () => {
      const stub = (window as unknown as {
        __webmcpStub: {
          executeTool: (name: string, input: object) => Promise<unknown>
        }
      }).__webmcpStub
      return stub.executeTool('clawql.docs.list_routes', {})
    })
    expect(routes).toMatchObject({ ok: true })
    expect((routes as { count: number }).count).toBeGreaterThan(5)

    const md = await page.evaluate(async () => {
      const stub = (window as unknown as {
        __webmcpStub: {
          executeTool: (name: string, input: object) => Promise<unknown>
        }
      }).__webmcpStub
      return stub.executeTool('clawql.docs.get_page_markdown', {
        path: '/quickstart',
      })
    })
    expect(md).toMatchObject({ ok: true, path: '/quickstart' })
    expect(String((md as { markdown?: string }).markdown ?? '')).toMatch(/quickstart/i)

    await page.goto('/plugins', { waitUntil: 'load' })
    await page.waitForFunction(() => {
      const stub = (window as unknown as { __webmcpStub?: { __tools: Map<string, unknown> } })
        .__webmcpStub
      return stub && stub.__tools.has('clawql.docs.filter_plugin_registry')
    })

    const filter = await page.evaluate(async () => {
      const stub = (window as unknown as {
        __webmcpStub: {
          executeTool: (name: string, input: object) => Promise<unknown>
        }
      }).__webmcpStub
      return stub.executeTool('clawql.docs.filter_plugin_registry', {
        kind: 'horizontal',
        query: 'memory',
      })
    })
    expect(filter).toMatchObject({ ok: true })
    expect((filter as { matchCount: number }).matchCount).toBeGreaterThan(0)
    await page.waitForURL(/\/plugins\?.*q=memory/)
    await page.waitForFunction(() => {
      const stub = (
        window as unknown as {
          __webmcpStub?: { __tools: Map<string, unknown> }
        }
      ).__webmcpStub
      return stub && stub.__tools.has('clawql.docs.open_plugin')
    })

    const opened = await page.evaluate(async () => {
      const stub = (window as unknown as {
        __webmcpStub: {
          executeTool: (name: string, input: object) => Promise<unknown>
        }
      }).__webmcpStub
      return stub.executeTool('clawql.docs.open_plugin', { plugin: 'memory' })
    })
    expect(opened).toMatchObject({
      ok: true,
      href: '/plugins/memory',
    })
    await page.waitForURL(/\/plugins\/memory/, { timeout: 30_000 })
  })
})
