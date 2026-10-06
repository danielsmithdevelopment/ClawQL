'use client'

import { useEffect, useMemo, useState } from 'react'

import { CreateKeyModal } from '@/components/managed/CreateKeyModal'
import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { Button } from '@/components/ui/button'
import { fetchManagedKeys } from '@/lib/managed/client'
import { API_KEYS, CONNECTIONS, type ApiKeyItem, type ConnectionItem } from '@/lib/managed/fixtures'
import { KEY_GROUP_COLUMNS, KEY_GROUP_MATRIX } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Tab = 'connections' | 'keys' | 'groups'

function statusTone(status: ConnectionItem['status']): 'ok' | 'warn' | 'danger' {
  if (status === 'connected') return 'ok'
  if (status === 'waiting-review') return 'warn'
  return 'danger'
}

export function ConnectionsPage() {
  const [tab, setTab] = useState<Tab>('connections')
  const [selectedId, setSelectedId] = useState(CONNECTIONS[0]!.id)
  const [createOpen, setCreateOpen] = useState(false)
  const [keys, setKeys] = useState<ApiKeyItem[]>(() => [...API_KEYS])
  const [keysSource, setKeysSource] = useState<'live' | 'fixture'>('fixture')
  const selected = useMemo(
    () => CONNECTIONS.find((c) => c.id === selectedId) ?? CONNECTIONS[0]!,
    [selectedId],
  )

  useEffect(() => {
    let cancelled = false
    void fetchManagedKeys()
      .then((res) => {
        if (cancelled) return
        setKeys(res.keys)
        setKeysSource(res.source)
      })
      .catch(() => {
        /* keep fixture seed */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <PageChrome
        crumbs={
          tab === 'keys'
            ? ['Connections & keys', 'Keys']
            : tab === 'groups'
              ? ['Connections & keys', 'Key groups']
              : ['Connections & keys']
        }
        title="Connections & keys"
        description={
          tab === 'groups'
            ? 'A key group decides what its keys can reach. Give each team only what its agents need.'
            : 'The services your agents can reach, and the keys that let clients reach ClawQL. Agents get capabilities, never the credentials.'
        }
        actions={
          tab === 'keys' ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Create a key
            </Button>
          ) : tab === 'groups' ? (
            <Button type="button">New key group</Button>
          ) : (
            <Button type="button">Add connection</Button>
          )
        }
      >
        {tab === 'keys' ? (
          <p className="mb-3 text-xs text-slate-500" data-testid="keys-data-source">
            Keys source: {keysSource === 'live' ? 'IssuedApiKeyStore ($CLAWQL_HOME)' : 'Acme fixture'}
          </p>
        ) : null}

        <div className="mb-5 flex gap-4 border-b border-slate-200 text-sm">
          {(
            [
              ['connections', `Connections ${CONNECTIONS.length}`],
              ['keys', `Keys ${keys.length}`],
              ['groups', `Key groups ${KEY_GROUP_COLUMNS.length}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'border-b-2 px-0.5 pb-2 font-medium transition-colors',
                tab === id
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
              data-testid={`connections-tab-${id}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'connections' ? (
          <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
            <ul className="space-y-2">
              {CONNECTIONS.map((c) => {
                const active = c.id === selected.id
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                        active
                          ? 'border-amber-200 bg-amber-50/70'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                      data-testid={`connection-${c.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.summary}</p>
                          <p className="mt-1 text-[11px] text-slate-400">Last used {c.lastUsed}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                          <StatusDot tone={statusTone(c.status)} />
                          {c.statusLabel}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selected.detailTitle}</h2>
                  <p className="text-sm text-slate-500">{selected.detailSubtitle}</p>
                </div>
                <Button type="button" variant="outline" size="sm">
                  Add account
                </Button>
              </div>

              {selected.accounts.length > 0 ? (
                <div className="mt-5 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Accounts</h3>
                  {selected.accounts.map((account) => (
                    <div
                      key={account.id}
                      className={cn(
                        'rounded-lg border px-3 py-3',
                        account.alert ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-slate-50/50',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{account.handle}</p>
                          <span className="mt-1 inline-block rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
                            {account.ownershipLabel}
                          </span>
                        </div>
                        <Button type="button" size="sm" variant={account.action === 'reconnect' ? 'default' : 'outline'}>
                          {account.action === 'reconnect' ? 'Reconnect' : 'Manage'}
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">{account.detail}</p>
                    </div>
                  ))}
                  <p className="text-xs text-slate-500">
                    Personal account results stay private — they never enter org memory, shared audit content, or
                    training.
                  </p>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  {selected.status === 'waiting-review'
                    ? 'This connection is waiting in Review before agents can use it.'
                    : 'Connected. Open Overrides to change operation defaults.'}
                </p>
              )}

              <div className="mt-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">What agents can do</h3>
                  <button type="button" className="text-xs text-sky-700 hover:underline">
                    Override an operation
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    <p className="text-xs font-medium">Reads, allowed</p>
                    <p className="text-lg font-semibold">{selected.ops.readsAllowed}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="text-xs font-medium">Writes, need a mandate</p>
                    <p className="text-lg font-semibold">{selected.ops.writesMandate}</p>
                  </div>
                  <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
                    <p className="text-xs font-medium">Deletes, blocked</p>
                    <p className="text-lg font-semibold">{selected.ops.deletesBlocked}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Set automatically from the API spec. Overrides are recorded in the audit trail.
                </p>
              </div>

              {selected.usedBy.length > 0 ? (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-slate-900">Used by</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.usedBy.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
                Tokens are kept in Vault and injected at call time. No agent ever sees them.
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'keys' ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Key group</th>
                  <th className="px-4 py-3 font-medium">Can use</th>
                  <th className="px-4 py-3 font-medium">Daily cap</th>
                  <th className="px-4 py-3 font-medium">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.map((key) => (
                  <tr key={key.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">{key.name}</td>
                    <td className="px-4 py-3 text-slate-600">{key.keyGroup}</td>
                    <td className="px-4 py-3 text-slate-600">{key.canUse}</td>
                    <td className="px-4 py-3 text-slate-600">{key.dailyCap}</td>
                    <td className="px-4 py-3 text-slate-600">{key.expiresLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'groups' ? <KeyGroupsMatrix /> : null}
      </PageChrome>

      <CreateKeyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(key) => setKeys((prev) => [key, ...prev])}
      />
    </>
  )
}

function permBadge(kind: 'none' | 'read' | 'read-write' | 'tag' | 'skills', label: string) {
  if (kind === 'none') {
    return <span className="text-xs text-slate-400">None</span>
  }
  if (kind === 'read') {
    return (
      <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        {label}
      </span>
    )
  }
  if (kind === 'read-write') {
    return (
      <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
        {label}
      </span>
    )
  }
  return (
    <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 font-mono text-xs font-medium text-emerald-800">
      {label}
    </span>
  )
}

function KeyGroupsMatrix() {
  return (
    <div className="space-y-3" data-testid="key-groups-matrix">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">Read</span>
          allowed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
            Read and write
          </span>
          writes need a mandate every time
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-slate-400">None</span>
          can&apos;t reach it
        </span>
        <span className="text-slate-500">Deletes stay blocked for every group.</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Reaches</th>
              {KEY_GROUP_COLUMNS.map((col) => (
                <th key={col.id} className="px-4 py-3 font-medium">
                  <button type="button" className="text-left text-sky-700 underline-offset-2 hover:underline">
                    {col.name}
                  </button>
                  <span className="mt-0.5 block font-normal normal-case text-slate-400">
                    {col.keys} keys
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {KEY_GROUP_MATRIX.map((row) => (
              <tr key={row.reaches}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.reaches}</td>
                {row.cells.map((cell, i) => (
                  <td key={`${row.reaches}-${KEY_GROUP_COLUMNS[i]!.id}`} className="px-4 py-3">
                    {permBadge(cell.kind, cell.label)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        A personal account is never part of a key group. Its results stay with the person who connected it.
      </p>
    </div>
  )
}
