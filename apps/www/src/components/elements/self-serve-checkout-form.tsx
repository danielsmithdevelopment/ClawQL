'use client'

import { clsx } from 'clsx/lite'
import { useState, type ComponentProps, type FormEvent } from 'react'
import { Button } from './button'
import { pricing } from '@/lib/pricing'
import { selfServeCheckoutApiUrl } from '@/lib/self-serve-checkout'
import { site } from '@/lib/site'

/** Pro self-serve Checkout form — POSTs to CPC `POST …/checkout/session` and redirects to Stripe. */
export function SelfServeCheckoutForm({ className, ...props }: ComponentProps<'form'>) {
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const api = selfServeCheckoutApiUrl()
    if (!api) {
      setError('Checkout API is not configured.')
      return
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://clawql.com'
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
    const successUrl = `${origin}${basePath}${site.urls.signup}/thanks/`
    const cancelUrl = `${origin}${basePath}${site.urls.signup}/`
    setPending(true)
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          plan: 'pro',
          orgName: orgName.trim(),
          ownerEmail: email.trim(),
          successUrl,
          cancelUrl,
          billingMode: 'stripe_checkout',
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !body.url) {
        setError(body.error || `Checkout failed (${res.status})`)
        return
      }
      window.location.assign(body.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error starting Checkout')
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
        Start Pro ({pricing.developer.monthlyPrice}
        {pricing.developer.period}) with Stripe Checkout. Org provisions after payment via webhook.
      </p>
      <label className="flex flex-col gap-1.5 text-sm/7">
        <span className="font-medium text-mist-950 dark:text-white">
          Organization name <span className="text-mist-600">(required)</span>
        </span>
        <input
          type="text"
          name="orgName"
          required
          autoComplete="organization"
          value={orgName}
          onChange={(ev) => setOrgName(ev.target.value)}
          placeholder="Acme Corp"
          className="rounded-lg border border-mist-950/15 bg-transparent px-3 py-2 text-mist-950 placeholder:text-mist-600 focus:border-mist-950 focus:outline-hidden dark:border-white/20 dark:text-white dark:placeholder:text-mist-400 dark:focus:border-white"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm/7">
        <span className="font-medium text-mist-950 dark:text-white">
          Work email <span className="text-mist-600">(required)</span>
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          placeholder="you@company.com"
          className="rounded-lg border border-mist-950/15 bg-transparent px-3 py-2 text-mist-950 placeholder:text-mist-600 focus:border-mist-950 focus:outline-hidden dark:border-white/20 dark:text-white dark:placeholder:text-mist-400 dark:focus:border-white"
        />
      </label>
      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" color="dark/light" className="self-start" disabled={pending}>
        {pending ? 'Redirecting…' : `Subscribe to Pro · ${pricing.developer.monthlyPrice}/mo`}
      </Button>
    </form>
  )
}
