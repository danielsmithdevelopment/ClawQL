'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { Button } from '@/components/ui/button'
import { useManagedSession } from '@/components/managed/ManagedSessionProvider'

type ProfileKey = {
  name: string
  badge: string
  detail: string
  ok: boolean
}

type ProfileSession = {
  id: string
  device: string
  path: string
  ended: boolean
}

const FIXTURE_KEYS: ProfileKey[] = [
  {
    name: 'YubiKey 5 NFC',
    badge: 'Can approve',
    detail: 'Your everyday key. Added Mar 3, last used today at 09:12.',
    ok: true,
  },
  {
    name: 'YubiKey 5C, backup',
    badge: 'Can approve',
    detail: 'Kept somewhere safe. Added Mar 3, last used Aug 21.',
    ok: true,
  },
  {
    name: 'iCloud Keychain passkey',
    badge: 'Sign-in only',
    detail: "Syncs across your Apple devices, so it can't approve. Last used today at 08:40.",
    ok: false,
  },
]

export function ProfilePage() {
  const session = useManagedSession()
  const [keys, setKeys] = useState<ProfileKey[]>(FIXTURE_KEYS)
  const [signedIn, setSignedIn] = useState(true)
  const [returnPath, setReturnPath] = useState('/home')
  const [sessions, setSessions] = useState<ProfileSession[]>([])
  const [endOthersBusy, setEndOthersBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/e2e/keys', { cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as {
          people?: {
            name: string
            keys: { label: string; status: string; kind: string; revoked?: boolean }[]
          }[]
        }
        const person = body.people?.find((p) => p.name === session.displayName) ?? body.people?.[0]
        if (!person || cancelled) return
        const mapped = person.keys
          .filter((k) => !k.revoked)
          .map((k) => ({
            name: k.label,
            badge: k.status,
            detail:
              k.kind === 'synced'
                ? "Syncs across devices, so it can't approve."
                : k.kind === 'totp'
                  ? 'Authenticator app — sign-in only.'
                  : 'Device-bound security key.',
            ok: k.status === 'Can approve',
          }))
        if (mapped.length > 0) setKeys(mapped)
      } catch {
        /* keep fixtures */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session.displayName])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/session/enforce', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ person: session.displayName || 'Dana Reyes' }),
        })
        if (!res.ok || cancelled) return
        const body = (await res.json()) as {
          signedIn?: boolean
          returnPath?: string
          sessions?: ProfileSession[]
        }
        if (cancelled) return
        setSignedIn(body.signedIn !== false)
        setReturnPath(body.returnPath ?? '/home')
        if (body.sessions) setSessions(body.sessions)
      } catch {
        /* leave defaults */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session.displayName])

  return (
    <PageChrome crumbs={['Your profile']} title={session.displayName} description="">
      {!signedIn ? (
        <div
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-testid="profile-signed-out"
          data-return-path={returnPath}
        >
          Signed out. After you sign in again you&apos;ll return to{' '}
          <span className="font-mono" data-testid="profile-return-path">
            {returnPath}
          </span>
          .
        </div>
      ) : null}
      <div className="-mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white">
            {session.initials}
          </span>
          <div>
            <p className="text-sm text-slate-600">
              {session.email}, {session.role} in Engineering and Legal
            </p>
            <p className="text-xs text-slate-500">Name and email come from Okta and update there.</p>
          </div>
        </div>
        <Button type="button" variant="outline" data-testid="profile-sign-out">
          Sign out
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Your security keys</h2>
              <Button type="button" size="sm" data-testid="profile-add-key">
                Add a key
              </Button>
            </div>
            <p className="mt-1 text-sm text-slate-500">You meet the org rule: two keys that can approve.</p>
            <ul className="mt-4 space-y-3" data-testid="profile-security-keys">
              {keys.map((key) => (
                <li
                  key={key.name}
                  className="rounded-lg border border-slate-200 px-3 py-3"
                  data-testid="profile-security-key"
                  data-key-label={key.name}
                  data-key-badge={key.badge}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{key.name}</p>
                      <span
                        className={
                          key.ok
                            ? 'mt-1 inline-block rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800'
                            : 'mt-1 inline-block rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700'
                        }
                      >
                        {key.badge}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">{key.detail}</p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button type="button" className="text-sky-700 hover:underline">
                        Rename
                      </button>
                      <button type="button" className="text-slate-500 hover:underline">
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Recovery codes</h3>
                <Button type="button" variant="outline" size="sm">
                  Make new codes
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">8 of 10 left. Each works once if you lose both keys.</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">When something needs you</h2>
            <p className="mt-1 text-sm text-slate-500">How approval requests and alerts reach you.</p>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                ['Push to the ClawQL app', 'Approve from your phone by tapping your YubiKey to it.', true],
                ['Slack direct message', 'A link to the request. Approving still happens with your key.', true],
                ['Email', 'For requests still waiting after 30 minutes.', false],
                ['Morning digest', "What your agents did overnight, at 8:00 in your time zone.", true],
              ].map(([label, help, on]) => (
                <label key={String(label)} className="flex items-start gap-2">
                  <input type="checkbox" defaultChecked={Boolean(on)} className="mt-1" />
                  <span>
                    <strong className="text-slate-800">{label}</strong>
                    <span className="mt-0.5 block text-xs text-slate-500">{help}</span>
                  </span>
                </label>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Where you&apos;re signed in</h2>
            <ul className="mt-3 space-y-2 text-sm" data-testid="profile-sessions">
              {(sessions.length > 0
                ? sessions
                : [
                    { id: 'fixture-1', device: 'MacBook Pro, Chrome', path: '/home', ended: false },
                    { id: 'fixture-2', device: 'iPhone, ClawQL app', path: '/review', ended: false },
                  ]
              ).map((s, i) => (
                <li
                  key={s.id}
                  className="flex justify-between gap-2"
                  data-testid="profile-session"
                  data-session-ended={s.ended ? 'true' : 'false'}
                  data-session-device={s.device}
                >
                  <span className={s.ended ? 'text-slate-400 line-through' : undefined}>{s.device}</span>
                  {i === 0 && !s.ended ? (
                    <span className="text-xs text-slate-500">This device</span>
                  ) : s.ended ? (
                    <span className="text-xs text-slate-500">Signed out</span>
                  ) : (
                    <button type="button" className="text-xs text-sky-700 hover:underline">
                      Sign out
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              size="sm"
              data-testid="profile-sign-out-everywhere-else"
              disabled={endOthersBusy || !signedIn}
              onClick={() => {
                setEndOthersBusy(true)
                void (async () => {
                  try {
                    const res = await fetch('/session/end-others', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ person: session.displayName || 'Dana Reyes' }),
                    })
                    if (!res.ok) return
                    const body = (await res.json()) as {
                      signedIn?: boolean
                      sessions?: ProfileSession[]
                    }
                    setSignedIn(body.signedIn !== false)
                    if (body.sessions) setSessions(body.sessions)
                  } finally {
                    setEndOthersBusy(false)
                  }
                })()
              }}
            >
              Sign out everywhere else
            </Button>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Your personal accounts</h2>
            <p className="mt-2 text-sm text-slate-700">
              GitHub, danareyes{' '}
              <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                Private to you
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Only you see results from personal accounts. They stay out of org memory and shared audit content.
            </p>
            <Link href="/connections" className="mt-2 inline-block text-xs text-sky-700 hover:underline">
              Manage in Connections & keys
            </Link>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Preferences</h2>
            <label className="mt-3 block text-sm">
              <span className="text-slate-700">Time zone</span>
              <select className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2">
                <option>Pacific Time (Los Angeles)</option>
              </select>
            </label>
            <p className="mt-3 text-sm text-slate-700">Appearance</p>
            <div className="mt-1.5 flex rounded-lg border border-slate-200 p-0.5 text-xs">
              {['System', 'Light', 'Dark'].map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  className={
                    i === 0
                      ? 'flex-1 rounded-md bg-slate-900 px-2 py-1.5 text-white'
                      : 'flex-1 rounded-md px-2 py-1.5 text-slate-600'
                  }
                >
                  {opt}
                </button>
              ))}
            </div>
            <Link href="/audit" className="mt-3 inline-block text-xs text-sky-700 hover:underline">
              Your activity in the audit log
            </Link>
          </section>
        </div>
      </div>
    </PageChrome>
  )
}
