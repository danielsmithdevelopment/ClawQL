'use client'

import Link from 'next/link'
import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import {
  TEAM_APPROVERS,
  TEAM_GROUPS,
  TEAM_PEOPLE,
  TEAM_ROLES,
} from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Tab = 'people' | 'groups' | 'roles'

export function TeamPage() {
  const [tab, setTab] = useState<Tab>('people')

  const description =
    tab === 'groups'
      ? 'Groups come from Okta. Use them to grant roles and to say who answers or approves what.'
      : tab === 'roles'
        ? 'Roles decide what people can do in the console. Approval areas sit on top, set per rule in Review.'
        : "Who's in Acme Robotics, what they can do, and who can approve what agents ask for."

  return (
    <PageChrome
      crumbs={tab === 'people' ? ['Team'] : ['Team', tab === 'groups' ? 'Groups' : 'Roles']}
      title="Team"
      description={description}
      actions={tab === 'people' ? <Button type="button">Invite people</Button> : undefined}
    >
      {tab === 'people' ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
          <p>
            Everyone signs in through Okta. Approvals need a security key, and each person must register at least
            two.
          </p>
          <Link href="/settings" className="font-medium text-sky-700 hover:underline">
            Sign-in settings
          </Link>
        </div>
      ) : null}

      <TabBar
        testIdPrefix="team-tab"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'people', label: 'People', count: TEAM_PEOPLE.length },
          { id: 'groups', label: 'Groups', count: TEAM_GROUPS.length },
          { id: 'roles', label: 'Roles', count: TEAM_ROLES.length },
        ]}
      />

      {tab === 'groups' ? <GroupsPanel /> : null}
      {tab === 'roles' ? <RolesPanel /> : null}

      {tab === 'people' ? (
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
      ) : null}
    </PageChrome>
  )
}

function GroupsPanel() {
  return (
    <div className="space-y-4" data-testid="team-groups">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <p className="inline-flex items-center gap-2 text-slate-700">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            <StatusDot tone="ok" /> Synced
          </span>
          Last synced from Okta 6 minutes ago. Edit membership in Okta; it lands here on the next sync.
        </p>
        <button type="button" className="font-medium text-sky-700 hover:underline">
          Sync now
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 font-medium">People</th>
              <th className="px-4 py-3 font-medium">Grants role</th>
              <th className="px-4 py-3 font-medium">Used in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {TEAM_GROUPS.map((g) => (
              <tr key={g.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{g.name}</td>
                <td className="px-4 py-3 text-slate-600">{g.people}</td>
                <td className="px-4 py-3 text-slate-700">{g.role}</td>
                <td className="px-4 py-3 text-slate-600">{g.usedIn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        People groups are separate from key groups. Key groups decide what agents&apos; keys can reach, in{' '}
        <Link href="/connections" className="text-sky-700 hover:underline">
          Connections & keys
        </Link>
        .
      </p>
    </div>
  )
}

function RolesPanel() {
  const cell = (value: string) => (
    <span className={cn(value === 'No' ? 'text-slate-400' : 'text-slate-800')}>{value}</span>
  )

  return (
    <div className="space-y-4" data-testid="team-roles">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Use the console</th>
              <th className="px-4 py-3 font-medium">Manage connections and keys</th>
              <th className="px-4 py-3 font-medium">Edit approval policies</th>
              <th className="px-4 py-3 font-medium">Manage people</th>
              <th className="px-4 py-3 font-medium">Export audit</th>
              <th className="px-4 py-3 font-medium">Billing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {TEAM_ROLES.map((role) => (
              <tr key={role.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{role.name}</p>
                  <p className="text-xs text-slate-500">{role.people}</p>
                </td>
                <td className="px-4 py-3">{cell(role.console)}</td>
                <td className="px-4 py-3">{cell(role.connections)}</td>
                <td className="px-4 py-3">{cell(role.policies)}</td>
                <td className="px-4 py-3">{cell(role.peopleManage)}</td>
                <td className="px-4 py-3">{cell(role.exportAudit)}</td>
                <td className="px-4 py-3">{cell(role.billing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Rules every role follows</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            Approving needs an approval area, set per rule in{' '}
            <Link href="/review" className="text-sky-700 hover:underline">
              Review, Approval policies
            </Link>
            . A role alone isn&apos;t enough.
          </li>
          <li>Nobody approves their own request, whatever their role.</li>
          <li>Changing anyone&apos;s role needs a security key and is recorded in the audit log.</li>
          <li>Roles map from Okta groups, so changes made in Okta land here on the next sync.</li>
        </ul>
      </section>
    </div>
  )
}
