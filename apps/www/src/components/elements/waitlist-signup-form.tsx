import { clsx } from 'clsx/lite'
import type { ComponentProps } from 'react'
import { Button } from './button'
import { WaitlistFormFields } from './waitlist-form-fields'
import { waitlistFormAction } from '@/lib/waitlist'

export function WaitlistSignupForm({ className, ...props }: ComponentProps<'form'>) {
  return (
    <form
      action={waitlistFormAction}
      method="POST"
      className={clsx(
        'flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 text-left inset-ring-1 inset-ring-black/10 dark:bg-white/10 dark:inset-ring-white/10',
        className,
      )}
      {...props}
    >
      <WaitlistFormFields source="signup-page" />
      <label className="flex flex-col gap-1.5 text-sm/7">
        <span className="font-medium text-mist-950 dark:text-white">Name</span>
        <input
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Jane Smith"
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
          placeholder="you@company.com"
          className="rounded-lg border border-mist-950/15 bg-transparent px-3 py-2 text-mist-950 placeholder:text-mist-600 focus:border-mist-950 focus:outline-hidden dark:border-white/20 dark:text-white dark:placeholder:text-mist-400 dark:focus:border-white"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm/7">
        <span className="font-medium text-mist-950 dark:text-white">Company</span>
        <input
          type="text"
          name="company"
          autoComplete="organization"
          placeholder="Acme Corp"
          className="rounded-lg border border-mist-950/15 bg-transparent px-3 py-2 text-mist-950 placeholder:text-mist-600 focus:border-mist-950 focus:outline-hidden dark:border-white/20 dark:text-white dark:placeholder:text-mist-400 dark:focus:border-white"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm/7">
        <span className="font-medium text-mist-950 dark:text-white">What are you hoping to run?</span>
        <textarea
          name="message"
          rows={3}
          placeholder="Real estate demo, transaction coordination, IDP pipeline, CRM stack…"
          className="resize-y rounded-lg border border-mist-950/15 bg-transparent px-3 py-2 text-mist-950 placeholder:text-mist-600 focus:border-mist-950 focus:outline-hidden dark:border-white/20 dark:text-white dark:placeholder:text-mist-400 dark:focus:border-white"
        />
      </label>
      <Button type="submit" color="dark/light" className="self-start">
        Request demo
      </Button>
    </form>
  )
}
