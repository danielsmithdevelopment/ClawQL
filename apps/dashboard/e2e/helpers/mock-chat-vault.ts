import type { Page } from '@playwright/test'

type MockThread = { id: string; title: string; updatedAt: number }

/** In-memory vault stub so Agent Chat e2e works without Obsidian vault I/O. */
export async function mockChatVaultApi(page: Page): Promise<void> {
  let threads: MockThread[] = []
  const messagesByThread: Record<string, unknown[]> = {}

  await page.route(/\/api\/agent\/chats(\/|$)/, async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    const threadId = url.pathname.match(/\/api\/agent\/chats\/([^/]+)$/)?.[1]

    if (!threadId) {
      if (method === 'GET') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            vaultRoot: '/tmp/clawql-vault-e2e',
            chatsRoot: '/tmp/clawql-vault-e2e/Dashboard/chats',
            writable: true,
            threads,
          }),
        })
      }
      if (method === 'POST') {
        const body = (route.request().postDataJSON() ?? {}) as { title?: string }
        const thread: MockThread = {
          id: `thread-${Date.now()}`,
          title: body.title?.trim() || 'New chat',
          updatedAt: Date.now(),
        }
        threads = [thread, ...threads]
        messagesByThread[thread.id] = []
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ thread }) })
      }
      if (method === 'PUT') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ imported: 0, vaultRoot: '/tmp/clawql-vault-e2e', threads }),
        })
      }
      return route.continue()
    }

    const decodedId = decodeURIComponent(threadId)
    if (method === 'GET') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ threadId: decodedId, messages: messagesByThread[decodedId] ?? [] }),
      })
    }
    if (method === 'PUT') {
      const body = (route.request().postDataJSON() ?? {}) as { messages?: unknown[] }
      messagesByThread[decodedId] = body.messages ?? []
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, count: messagesByThread[decodedId].length }),
      })
    }
    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as { title?: string; updatedAt?: number }
      threads = threads.map((t) =>
        t.id === decodedId
          ? {
              ...t,
              ...(body.title !== undefined ? { title: body.title } : {}),
              ...(body.updatedAt !== undefined ? { updatedAt: body.updatedAt } : {}),
            }
          : t,
      )
      const thread = threads.find((t) => t.id === decodedId)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ thread }) })
    }
    return route.continue()
  })
}

export async function mockAgentConfig(
  page: Page,
  opts: { openclawConfigured?: boolean; chatStream?: boolean },
): Promise<void> {
  await page.route('**/api/agent/config', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        openclawConfigured: opts.openclawConfigured ?? true,
        chatStream: opts.chatStream !== false,
      }),
    })
  })
}
