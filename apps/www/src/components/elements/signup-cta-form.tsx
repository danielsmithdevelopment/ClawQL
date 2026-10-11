import { WaitlistSignupForm } from '@/components/elements/waitlist-signup-form'
import { SelfServeCheckoutForm } from '@/components/elements/self-serve-checkout-form'
import { SupabaseSignupForm } from '@/components/elements/supabase-signup-form'
import { isSelfServeCheckoutConfigured } from '@/lib/self-serve-checkout'
import { isSupabaseAuthConfigured } from '@/lib/supabase-auth'

/**
 * Signup CTA priority:
 * 1. Supabase Auth account form when public Supabase env is set (optional Checkout handoff)
 * 2. Stripe Checkout-only form when self-serve is configured without Supabase
 * 3. FormSubmit waitlist
 */
export function SignupCtaForm({ className }: { className?: string }) {
  if (isSupabaseAuthConfigured()) {
    return <SupabaseSignupForm className={className} />
  }
  if (isSelfServeCheckoutConfigured()) {
    return <SelfServeCheckoutForm className={className} />
  }
  return <WaitlistSignupForm className={className} />
}
