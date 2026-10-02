import { clsx } from 'clsx/lite'
import type { ComponentProps, ReactNode } from 'react'
import { waitlistFormAction, type WaitlistSource } from '@/lib/waitlist'
import { Button } from './button'
import { WaitlistFormFields } from './waitlist-form-fields'

export function EmailSignupForm({
  label = 'Email address',
  placeholder = 'Enter your email',
  cta,
  variant = 'normal',
  source = 'homepage',
  className,
  ...props
}: {
  label?: string
  placeholder?: string
  cta: ReactNode
  variant?: 'normal' | 'overlay'
  source?: WaitlistSource
} & Omit<ComponentProps<'form'>, 'action' | 'method'>) {
  return (
    <form
      action={waitlistFormAction}
      method="POST"
      className={clsx(
        'flex rounded-full p-1 inset-ring-1 dark:bg-white/10 dark:inset-ring-white/10',
        variant === 'normal' && 'bg-white inset-ring-black/10',
        variant === 'overlay' && 'bg-white/15 inset-ring-white/10',
        className,
      )}
      {...props}
    >
      <WaitlistFormFields source={source} />
      <input
        className={clsx(
          'min-w-0 flex-1 px-3 text-sm/7 focus:outline-hidden dark:text-white',
          variant === 'normal' && 'text-mist-950',
          variant === 'overlay' && 'text-white placeholder:text-white/60',
        )}
        type="email"
        name="email"
        required
        autoComplete="email"
        aria-label={label}
        placeholder={placeholder}
      />
      <Button color={variant === 'normal' ? 'dark/light' : 'light'} type="submit">
        {cta}
      </Button>
    </form>
  )
}
