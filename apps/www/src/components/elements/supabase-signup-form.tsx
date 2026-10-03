'use client'

import { clsx } from 'clsx/lite'
import { useState, type ComponentProps, type FormEvent } from 'react'
import { Button } from './button'
import { pricing } from '@/lib/pricing'
import { isSelfServeCheckoutConfigured, selfServeCheckoutApiUrl } from '@/lib/self-serve-checkout'
import { site } from '@/lib/site'
import { supabaseSignUpWithPassword } from '@/lib/supabase-auth'

/** Managed account signup via Supabase Auth; optional Stripe Checkout handoff. */
export function SupabaseSignupForm({ className, ...props }: ComponentProps<'form'>) {
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [createdMessage, setCreatedMessage] = useState<string | null>(null)
  const checkoutReady = isSelfServeCheckoutConfigured()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setCreatedMessage(null)
    setPending(true)
    try {
      const session = await supabaseSignUpWithPassword({
        email: email.trim(),
        password,
      })

      if (!checkoutReady) {
        setCreatedMessage(
          'Account created. We will email you when managed Checkout is available for your org.',
        )
        return
      }

      const api = selfServeCheckoutApiUrl()
      if (!api) {
        setError('Checkout API is not configured.')
        return
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://clawql.com'
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
      const successUrl = `${origin}${basePath}${site.urls.signup}/thanks/`
      const cancelUrl = `${origin}${basePath}${site.urls.signup}/`
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          plan: 'pro',
          orgName: orgName.trim(),
          ownerEmail: (session.email ?? email).trim(),
          successUrl,
          cancelUrl,
          billingMode: 'stripe_checkout',
          supabaseUserId: session.userId,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !body.url) {
        setError(body.error || `Checkout failed (${res.status})`)
        return
      }
      window.location.assign(body.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={clsx(
        'flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 text-left inset-ring-1 inset-ring-black/10 dark:bg-white/10 dark:inset-ring-white/10',
        className,
      )}
      {...props}
    >
      <p className="text-sm/7 text-mist-700 dark:text-mist-300">
        Create your ClawQL account
        {checkoutReady
          ? ` — then start Pro (${pricing.developer.monthlyPrice}${pricing.developer.period}) with Stripe Checkout.`
          : ' — managed hosting waitlist Checkout will attach after you sign up.'}
      </p>
      <label className="flex flex-col gap-1.5 text-sm/7">
        <span className="font-medium text-mist-950 dark:text-white">Organization name</span>
        <input
          type="text"
          name="orgName"
          required
          autoComplete="organization"
          value={orgName}
          onChange={(ev) => setOrgName(ev.target.value)}
          placeholder="Acme Corp"
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-mist-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm/7">
        <span className="font-medium text-mist-950 dark:text-white">Work email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          placeholder="you@company.com"
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-mist-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm/7">
        <span className="font-medium text-mist-950 dark:text-white">Password</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-mist-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
        />
      </label>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {createdMessage ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{createdMessage}</p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating account…' : checkoutReady ? 'Create account & checkout' : 'Create account'}
      </Button>
    </form>
  )
}
