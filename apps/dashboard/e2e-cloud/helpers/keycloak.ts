/**
 * Live Keycloak Admin API arrange for SI-07/08.
 * When CLAWQL_E2E_KEYCLOAK_URL (default http://127.0.0.1:18089) is up,
 * mutates realm groups/users then syncs into the dashboard via SCIM.
 * Falls back to local SCIM PatchOp when Keycloak is unreachable.
 */
import { scimDirectorySync } from './harness'

const DEFAULT_URL = process.env.CLAWQL_E2E_KEYCLOAK_URL ?? 'http://127.0.0.1:18089'
const REALM = process.env.CLAWQL_E2E_KEYCLOAK_REALM ?? 'clawql-e2e'
const ADMIN_USER = process.env.CLAWQL_E2E_KEYCLOAK_ADMIN ?? 'admin'
const ADMIN_PASS = process.env.CLAWQL_E2E_KEYCLOAK_ADMIN_PASSWORD ?? 'admin'

export type KeycloakArrangeResult = {
  source: 'keycloak' | 'scim-local'
  ok: boolean
  status: number
  body: Record<string, unknown>
  detail?: string
}

async function keycloakBase(): Promise<string | null> {
  const base = DEFAULT_URL.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(2_000) })
    if (res.ok || res.status === 302 || res.status === 200) return base
  } catch {
    /* unreachable */
  }
  return null
}

async function adminToken(base: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: ADMIN_USER,
    password: ADMIN_PASS,
  })
  const res = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`keycloak token ${res.status}`)
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('keycloak token missing')
  return json.access_token
}

async function adminJson<T>(
  base: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let body = {} as T
  if (text) {
    try {
      body = JSON.parse(text) as T
    } catch {
      body = text as unknown as T
    }
  }
  return { status: res.status, body }
}

async function findUser(
  base: string,
  token: string,
  username: string,
): Promise<{ id: string; username: string; enabled: boolean } | null> {
  const { status, body } = await adminJson<
    Array<{ id: string; username: string; enabled: boolean }>
  >(base, token, `/admin/realms/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`)
  if (status >= 400 || !Array.isArray(body) || body.length === 0) return null
  return body[0]!
}

async function findGroup(
  base: string,
  token: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const { status, body } = await adminJson<Array<{ id: string; name: string }>>(
    base,
    token,
    `/admin/realms/${REALM}/groups?search=${encodeURIComponent(name)}`,
  )
  if (status >= 400 || !Array.isArray(body)) return null
  return body.find((g) => g.name === name) ?? null
}

/** Remove Jordan from Support in Keycloak, then SCIM-sync into dashboard. */
export async function arrangeKeycloakRemoveJordanFromSupport(): Promise<KeycloakArrangeResult> {
  const base = await keycloakBase()
  if (!base) {
    const sync = await scimDirectorySync({ removeJordanFromSupport: true })
    return {
      source: 'scim-local',
      ok: sync.status === 200,
      status: sync.status,
      body: sync.body,
      detail: 'Keycloak unreachable — SCIM-local arrange',
    }
  }

  const token = await adminToken(base)
  const jordan = await findUser(base, token, 'jordan.park')
  const support = await findGroup(base, token, 'Support')
  if (!jordan || !support) {
    const sync = await scimDirectorySync({ removeJordanFromSupport: true })
    return {
      source: 'scim-local',
      ok: sync.status === 200,
      status: sync.status,
      body: sync.body,
      detail: 'Keycloak user/group missing — SCIM-local arrange',
    }
  }

  const del = await adminJson(
    base,
    token,
    `/admin/realms/${REALM}/users/${jordan.id}/groups/${support.id}`,
    { method: 'DELETE' },
  )
  if (del.status >= 400 && del.status !== 404) {
    throw new Error(`keycloak remove group failed ${del.status}`)
  }

  const sync = await scimDirectorySync({
    Operations: [
      {
        op: 'Remove',
        path: 'groups[display eq "Support"]',
        value: { userName: 'jordan.park@acme.test', group: 'Support' },
      },
    ],
  })
  return {
    source: 'keycloak',
    ok: sync.status === 200,
    status: sync.status,
    body: { ...sync.body, keycloakUserId: jordan.id, keycloakGroupId: support.id },
    detail: 'Removed Jordan from Support in Keycloak; SCIM synced',
  }
}

/** Deactivate Priya in Keycloak, then SCIM-sync into dashboard. */
export async function arrangeKeycloakDeactivatePriya(): Promise<KeycloakArrangeResult> {
  const base = await keycloakBase()
  if (!base) {
    const sync = await scimDirectorySync({ deactivatePriya: true })
    return {
      source: 'scim-local',
      ok: sync.status === 200,
      status: sync.status,
      body: sync.body,
      detail: 'Keycloak unreachable — SCIM-local arrange',
    }
  }

  const token = await adminToken(base)
  const priya = await findUser(base, token, 'priya.shah')
  if (!priya) {
    const sync = await scimDirectorySync({ deactivatePriya: true })
    return {
      source: 'scim-local',
      ok: sync.status === 200,
      status: sync.status,
      body: sync.body,
      detail: 'Keycloak user missing — SCIM-local arrange',
    }
  }

  const put = await adminJson(base, token, `/admin/realms/${REALM}/users/${priya.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: priya.id,
      username: priya.username,
      enabled: false,
      email: 'priya.shah@acme.test',
      firstName: 'Priya',
      lastName: 'Shah',
    }),
  })
  if (put.status >= 400) {
    throw new Error(`keycloak deactivate failed ${put.status}`)
  }

  const sync = await scimDirectorySync({
    Operations: [
      {
        op: 'Replace',
        path: 'active',
        value: false,
        userName: 'priya.shah@acme.test',
      },
    ],
  })
  return {
    source: 'keycloak',
    ok: sync.status === 200,
    status: sync.status,
    body: { ...sync.body, keycloakUserId: priya.id, enabled: false },
    detail: 'Deactivated Priya in Keycloak; SCIM synced',
  }
}
