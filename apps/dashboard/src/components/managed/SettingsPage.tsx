'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { Button } from '@/components/ui/button'
import {
  SETTINGS_NETWORK,
  SETTINGS_ORG,
  SETTINGS_PRIVACY,
} from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Section = 'general' | 'signin' | 'privacy' | 'network' | 'advanced'

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'signin', label: 'Sign-in & security' },
  { id: 'privacy', label: 'Data & privacy' },
  { id: 'network', label: 'Network' },
  { id: 'advanced', label: 'Advanced' },
]

const CRUMB: Record<Section, string> = {
  general: 'General',
  signin: 'Sign-in & security',
  privacy: 'Data & privacy',
  network: 'Network',
  advanced: 'Advanced',
}

export function SettingsPage() {
  const [section, setSection] = useState<Section>('general')
  const searchParams = useSearchParams()
  const e2eRole = searchParams.get('e2eRole')
  const memberReadOnly = e2eRole === 'member'

  return (
    <PageChrome
      crumbs={['Settings', CRUMB[section]]}
      title="Settings"
      description="Org-wide rules for Acme Robotics. Every change here is recorded in the audit log."
    >
      {memberReadOnly ? (
        <div
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-testid="settings-member-readonly"
        >
          Members cannot edit settings — this view is read-only.
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav className="space-y-1" data-testid="settings-nav">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                'block w-full rounded-lg px-3 py-2 text-left text-sm',
                section === id
                  ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:bg-white/60',
              )}
              data-testid={`settings-nav-${id}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {section === 'general' ? <GeneralSection readOnly={memberReadOnly} /> : null}
        {section === 'signin' ? <SignInSection /> : null}
        {section === 'privacy' ? <PrivacySection /> : null}
        {section === 'network' ? <NetworkSection /> : null}
        {section === 'advanced' ? <AdvancedSection readOnly={memberReadOnly} /> : null}
      </div>
    </PageChrome>
  )
}

function GeneralSection({ readOnly = false }: { readOnly?: boolean }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="settings-general">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</p>
      <div className="mt-4 space-y-5">
        <label className="block text-sm">
          <span className="font-medium text-slate-800">Name</span>
          <span className="mt-0.5 block text-xs text-slate-500">Shown in the console and on invoices</span>
          <input
            type="text"
            defaultValue={SETTINGS_ORG.name}
            disabled={readOnly}
            readOnly={readOnly}
            className="mt-1.5 h-9 w-full max-w-md rounded-lg border border-slate-200 px-3 disabled:bg-slate-50"
          />
        </label>
        <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
          <div>
            <p className="font-medium text-slate-800">Console and gateway address</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Set when the org was created. Changing it would break every connected client.
            </p>
          </div>
          <p className="font-mono text-sm text-slate-700">{SETTINGS_ORG.consoleAddress}</p>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
          <div>
            <p className="font-medium text-slate-800">Data region</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Where your memory, documents and audit log are stored. Fixed at creation.
            </p>
          </div>
          <p className="text-sm text-slate-700">{SETTINGS_ORG.dataRegion}</p>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">Default time zone</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            For schedules and digests. People can set their own in their profile.
          </span>
          <select className="mt-1.5 h-9 w-full max-w-md rounded-lg border border-slate-200 px-2">
            <option>{SETTINGS_ORG.timeZone}</option>
            <option>Eastern Time (New York)</option>
            <option>UTC</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">Security contact</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Alerted first if the audit chain fails to verify
          </span>
          <input
            type="email"
            defaultValue={SETTINGS_ORG.securityContact}
            className="mt-1.5 h-9 w-full max-w-md rounded-lg border border-slate-200 px-3"
          />
        </label>
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="button">Save changes</Button>
      </div>
    </section>
  )
}

function SignInSection() {
  return (
    <div className="space-y-4" data-testid="settings-signin">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Single sign-on</h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <StatusDot tone="ok" /> Okta connected
          </span>
        </div>
        <button type="button" className="mt-1 text-xs text-sky-700 hover:underline">
          Edit connection
        </button>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" defaultChecked className="mt-1" />
          <span>
            <strong>Require single sign-on</strong>
            <span className="mt-0.5 block text-xs text-slate-500">
              Everyone at acme.example signs in through Okta. Password sign-in is off.
            </span>
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" defaultChecked className="mt-1" />
          <span>
            <strong>Sync people and groups</strong>
            <span className="mt-0.5 block text-xs text-slate-500">
              Joiners and leavers update automatically from Okta. Last sync 6 minutes ago.
            </span>
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Security keys and passkeys</h2>
        <div className="mt-4 space-y-4 text-sm">
          <label className="block">
            <span className="font-medium text-slate-800">Keys each person must register</span>
            <input type="number" defaultValue={2} className="mt-1.5 h-9 w-20 rounded-lg border border-slate-200 px-3" />
            <span className="mt-1 block text-xs text-slate-500">
              A second key means a lost one never locks anyone out. 1 person is short.
            </span>
          </label>
          <label className="block">
            <span className="font-medium text-slate-800">Which keys count for approvals</span>
            <select className="mt-1.5 h-9 w-full max-w-md rounded-lg border border-slate-200 px-2">
              <option>Device-bound keys only</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Synced passkeys can sign in. Approvals need a key tied to one device.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" defaultChecked className="mt-1" />
            <span>
              <strong>Recovery codes</strong>
              <span className="mt-0.5 block text-xs text-slate-500">
                Required. Each person saves a set when they register their first key.
              </span>
            </span>
          </label>
          <label className="block">
            <span className="font-medium text-slate-800">Authenticator app codes</span>
            <select className="mt-1.5 h-9 w-full max-w-md rounded-lg border border-slate-200 px-2">
              <option>Sign-in backup only</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Never accepted for approvals, because codes can be phished.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Confirm high-risk actions with a key</h2>
        <p className="mt-1 text-sm text-slate-500">
          These actions need a fresh key touch. The key signs the exact action, so the approval can&apos;t be reused.
        </p>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-2 font-medium">Action</th>
              <th className="pb-2 font-medium">Requires</th>
              <th className="pb-2 font-medium">Also</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[
              ['Approve a change an agent asked for', 'Device-bound key', 'Never the requester'],
              ['Approve a new source', 'Device-bound key', 'Never the proposer'],
              ['Issue an API key', 'Device-bound key', 'Admins only'],
              ['Erase memory', 'Device-bound key', 'Removes it from every store'],
              ['Delete the organization', 'Device-bound key', 'Signed in within the last 5 minutes'],
            ].map(([action, requires, also]) => (
              <tr key={action}>
                <td className="py-2 text-slate-800">{action}</td>
                <td className="py-2 text-slate-600">{requires}</td>
                <td className="py-2 text-slate-600">{also}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Console sessions</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Sign people out after</span>
            <select className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 px-2">
              <option>30 minutes</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">Of inactivity in the console.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Longest session</span>
            <select className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 px-2">
              <option>12 hours</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Everyone signs in again after this, even if active.
            </span>
          </label>
        </div>
      </section>
    </div>
  )
}

function PrivacySection() {
  return (
    <div className="space-y-4" data-testid="settings-privacy">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">How long data is kept</h2>
        <ul className="mt-4 space-y-4">
          {SETTINGS_PRIVACY.retention.map((row) => (
            <li key={row.label} className="flex flex-wrap items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-slate-800">{row.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{row.help}</p>
              </div>
              {'locked' in row && row.locked ? (
                <p className="text-sm font-medium text-slate-700">{row.value}</p>
              ) : (
                <select className="h-9 rounded-lg border border-slate-200 px-2" defaultValue={row.value}>
                  <option>{row.value}</option>
                </select>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Personal data redaction</h2>
        <p className="mt-1 text-sm text-slate-500">
          Removed before storage, logs, events, and any prompt sent to an outside model provider.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {SETTINGS_PRIVACY.redaction.map((item) => (
            <li key={item.label}>
              <label
                className={cn(
                  'flex items-start gap-2 text-sm text-slate-700',
                  'locked' in item && item.locked && 'opacity-70',
                )}
              >
                <input
                  type="checkbox"
                  defaultChecked={item.checked}
                  disabled={'locked' in item && item.locked}
                  className="mt-1"
                />
                <span>
                  {item.label}
                  {'note' in item && item.note ? (
                    <span className="mt-0.5 block text-xs text-slate-500">{item.note}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Proof you hold yourself</h2>
        <p className="mt-1 text-sm text-slate-500">
          Send hourly audit roots to your storage — a copy ClawQL can&apos;t write to, so you can check the audit
          chain without trusting us.
        </p>
        <p className="mt-3 font-mono text-sm text-slate-800">{SETTINGS_PRIVACY.auditRoots.path}</p>
        <p className="mt-1 text-xs text-emerald-800">{SETTINGS_PRIVACY.auditRoots.status}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Exports and erasure</h2>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 text-sm">
          <div>
            <p className="font-medium text-slate-800">Training exports</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Let admins export redacted data to fine-tune your own models. Erased data is always excluded.
            </p>
          </div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" defaultChecked={SETTINGS_PRIVACY.trainingExportsOn} />
            <span className="font-medium text-slate-700">On</span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 text-sm">
          <div>
            <p className="font-medium text-slate-800">Erasure requests</p>
            <p className="mt-0.5 text-xs text-slate-500">{SETTINGS_PRIVACY.erasureSummary}</p>
          </div>
          <button type="button" className="font-medium text-sky-700 hover:underline">
            See requests
          </button>
        </div>
      </section>
    </div>
  )
}

function AdvancedSection({ readOnly = false }: { readOnly?: boolean }) {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="space-y-4" data-testid="settings-advanced">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Delete the organization</h2>
        <p className="mt-1 text-sm text-slate-500">
          Archives memory, documents, skills, settings, and audit. Requires a device-bound key and a
          sign-in within the last 5 minutes — before the key prompt.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={readOnly || busy}
            data-testid="settings-delete-org"
            onClick={() => {
              setBusy(true)
              setMessage(null)
              void (async () => {
                try {
                  const res = await fetch('/org/delete', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ person: 'Dana Reyes' }),
                  })
                  const body = (await res.json().catch(() => ({}))) as { error?: string }
                  if (!res.ok) {
                    setMessage(body.error ?? `Delete refused (${res.status})`)
                    return
                  }
                  setMessage('Deletion complete')
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : 'Delete failed')
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            Delete organization
          </Button>
          {message ? (
            <p className="text-sm text-slate-700" data-testid="settings-delete-org-message">
              {message}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function NetworkSection() {
  return (
    <div className="space-y-4" data-testid="settings-network">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Where events can be delivered</h2>
        <p className="mt-1 text-sm text-slate-500">
          Webhooks only go to these hosts. Private and internal addresses are always refused.
        </p>
        <ul className="mt-4 divide-y divide-slate-100">
          {SETTINGS_NETWORK.webhookHosts.map((row) => (
            <li key={row.host} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-mono text-slate-900">{row.host}</span>
                <span className="ml-2 text-slate-500">
                  ({row.subscriptions} subscription{row.subscriptions === 1 ? '' : 's'})
                </span>
              </span>
              <button type="button" className="text-sky-700 hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="hooks.example.com"
            className="h-9 min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 text-sm"
          />
          <Button type="button" variant="outline">
            Add host
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Where agents&apos; calls can go</h2>
        <p className="mt-1 text-sm text-slate-500">
          Added automatically when you connect a service. Everything else is blocked at the egress gateway.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SETTINGS_NETWORK.egressDomains.map((host) => (
            <span
              key={host}
              className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800"
            >
              {host}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Blocked attempts show up in the audit log as blocked calls.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Who can reach the console and gateway</h2>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 text-sm">
          <div>
            <p className="font-medium text-slate-800">Limit to IP ranges</p>
            <p className="mt-0.5 text-xs text-slate-500">Off: any network, with sign-in and keys required.</p>
          </div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" defaultChecked={!SETTINGS_NETWORK.ipLimitOff} />
            <span className="text-slate-600">Off</span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 text-sm">
          <div>
            <p className="font-medium text-slate-800">Private connection</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Reach your gateway without the public internet, on a plan with private networking.
            </p>
          </div>
          <button type="button" className="font-medium text-sky-700 hover:underline">
            Learn more
          </button>
        </div>
      </section>
    </div>
  )
}
