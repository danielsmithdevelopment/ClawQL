/** Build-time / runtime flags for www self-serve Stripe Checkout CTA. */

export function isSelfServeCheckoutConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.NEXT_PUBLIC_CLAWQL_SELF_SERVE_CHECKOUT === '1' &&
    Boolean(env.NEXT_PUBLIC_CLAWQL_CHECKOUT_API?.trim())
  )
}

export function selfServeCheckoutApiUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.NEXT_PUBLIC_CLAWQL_CHECKOUT_API?.trim() || undefined
}
