'use client'

import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { cn } from '@/lib/utils'

type Section = 'signin' | 'privacy' | 'network' | 'advanced'

export function SettingsPage() {
  const [section, setSection] = useState<Section>('signin')

  return (
    <PageChrome
      crumbs={['Settings', 'Sign-in & security']}
      title="Settings"
      description="Org-wide rules for Acme Robotics. Every change here is recorded in the audit log."
    >
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav className="space-y-1">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">General</p>
          {(
            [
              ['signin', 'Sign-in & security'],
              ['privacy', 'Data & privacy'],
              ['network', 'Network'],
              ['advanced', 'Advanced'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                'block w-full rounded-lg px-3 py-2 text-left text-sm',
                section === id ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/60',
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        {section !== 'signin' ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Fixture shell for this settings section.
          </div>
        ) : (
          <div className="space-y-4">
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
                  <input
                    type="number"
                    defaultValue={2}
                    className="mt-1.5 h-9 w-20 rounded-lg border border-slate-200 px-3"
                  />
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
                These actions need a fresh key touch. The key signs the exact action, so the approval can&apos;t be
                reused.
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
        )}
      </div>
    </PageChrome>
  )
}
