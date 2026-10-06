'use client'

import Link from 'next/link'
import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import { TEAM_APPROVERS, TEAM_PEOPLE } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Tab = 'people' | 'groups' | 'roles'

export function TeamPage() {
  const [tab, setTab] = useState<Tab>('people')

  return (
    <PageChrome
      crumbs={['Team']}
      title="Team"
      description="Who's in Acme Robotics, what they can do, and who can approve what agents ask for."
      actions={<Button type="button">Invite people</Button>}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
        <p>
          Everyone signs in through Okta. Approvals need a security key, and each person must register at least two.
        </p>
        <Link href="/settings" className="font-medium text-sky-700 hover:underline">
          Sign-in settings
        </Link>
      </div>

      <TabBar
        testIdPrefix="team-tab"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'people', label: 'People', count: TEAM_PEOPLE.length },
          { id: 'groups', label: 'Groups', count: 4 },
          { id: 'roles', label: 'Roles', count: 5 },
        ]}
      />

      {tab !== 'people' ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {tab === 'groups' ? 'Groups fixture — Engineering, Legal, Support, Finance.' : 'Roles fixture coming next.'}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Groups</th>
                  <th className="px-4 py-3 font-medium">Can approve</th>
                  <th className="px-4 py-3 font-medium">Security keys</th>
                  <th className="px-4 py-3 font-medium">Last active</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TEAM_PEOPLE.map((person) => (
                  <tr key={person.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{person.name}</p>
                      <p className="text-xs text-slate-500">{person.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{person.role}</td>
                    <td className="px-4 py-3 text-slate-600">{person.groups}</td>
                    <td className="px-4 py-3 text-slate-600">{person.canApprove}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                          person.keysTone === 'ok' && 'bg-emerald-100 text-emerald-800',
                          person.keysTone === 'warn' && 'bg-amber-100 text-amber-900',
                          person.keysTone === 'neutral' && 'bg-slate-200 text-slate-700',
                        )}
                      >
                        {person.keys}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{person.lastActive}</td>
                    <td className="px-4 py-3">
                      <button type="button" className="text-sky-700 hover:underline">
                        {person.action}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Approvers</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Who can approve what agents ask for. The rules themselves live in Review, Approval policies.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm">
                Edit approvers
              </Button>
            </div>
            <ul className="mt-4 space-y-3">
              {TEAM_APPROVERS.map((rule) => (
                <li key={rule.id} className="rounded-lg border border-slate-200 px-3 py-3">
                  <p className="text-sm font-semibold text-slate-900">{rule.title}</p>
                  <p className="text-xs text-slate-500">{rule.summary}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Approvers: {rule.people}. {rule.rule}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-4 text-xs text-slate-500">
            Agents aren&apos;t team members. Their access comes from keys in{' '}
            <Link href="/connections" className="text-sky-700 hover:underline">
              Connections & keys
            </Link>
            .
          </p>
        </>
      )}
    </PageChrome>
  )
}
