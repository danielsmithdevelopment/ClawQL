import { WaitlistSignupForm } from '@/components/elements/waitlist-signup-form'
import { SelfServeCheckoutForm } from '@/components/elements/self-serve-checkout-form'
import { isSelfServeCheckoutConfigured } from '@/lib/self-serve-checkout'

/** Signup CTA: Stripe Checkout when env-gated; otherwise FormSubmit waitlist. */
export function SignupCtaForm({ className }: { className?: string }) {
  if (isSelfServeCheckoutConfigured()) {
    return <SelfServeCheckoutForm className={className} />
  }
  return <WaitlistSignupForm className={className} />
}
