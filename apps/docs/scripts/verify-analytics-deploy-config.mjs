#!/usr/bin/env node
/**
 * Fail deploy loudly when analytics is enabled but misconfigured.
 * Prevents shipping a client that POSTs pageviews into a dead collector (503)
 * with no operator-visible signal.
 */
const truthy = (value) => value?.trim() === '1'

const clientEnabled = truthy(process.env.NEXT_PUBLIC_CLAWQL_ANALYTICS_ENABLED)
const serverEnabled = truthy(process.env.CLAWQL_ANALYTICS_ENABLED)
const analyticsEnabled = clientEnabled || serverEnabled

const apiKey =
  process.env.CLAWQL_ANALYTICS_POSTHOG_API_KEY?.trim() ??
  process.env.POSTHOG_API_KEY?.trim() ??
  ''

const fail = (message) => {
  console.error(`::error::${message}`)
  process.exit(1)
}

if (!analyticsEnabled) {
  console.log('analytics deploy config: disabled (OK)')
  process.exit(0)
}

if (clientEnabled && !serverEnabled) {
  fail(
    'Analytics client enabled (NEXT_PUBLIC_CLAWQL_ANALYTICS_ENABLED=1) but server flag CLAWQL_ANALYTICS_ENABLED is not 1 — docs collector will return 503 for every pageview.',
  )
}

if (!apiKey) {
  fail(
    'Analytics enabled but CLAWQL_ANALYTICS_POSTHOG_API_KEY (or POSTHOG_API_KEY) is missing — configure the GitHub secret before enabling CLAWQL_ANALYTICS_ENABLED.',
  )
}

if (apiKey.length < 8) {
  fail('Analytics PostHog API key looks malformed (too short).')
}

console.log('analytics deploy config: enabled with PostHog key present (OK)')
