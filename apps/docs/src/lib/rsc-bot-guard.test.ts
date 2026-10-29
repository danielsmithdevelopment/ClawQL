import { describe, expect, it } from 'vitest'

import {
  decideRscBotGuard,
  hasLegitimateRscHeader,
  hasRscFlightQuery,
  stripRscFlightQuery,
} from './rsc-bot-guard'

describe('rsc-bot-guard', () => {
  it('detects _rsc and rsc query keys', () => {
    expect(hasRscFlightQuery(new URLSearchParams('_rsc=abc'))).toBe(true)
    expect(hasRscFlightQuery(new URLSearchParams('rsc=xyz'))).toBe(true)
    expect(hasRscFlightQuery(new URLSearchParams('utm_source=x'))).toBe(false)
  })

  it('requires RSC: 1 for legitimate flights', () => {
    expect(hasLegitimateRscHeader(new Headers({ rsc: '1' }))).toBe(true)
    expect(hasLegitimateRscHeader(new Headers({ RSC: '1' }))).toBe(true)
    expect(hasLegitimateRscHeader(new Headers())).toBe(false)
    expect(hasLegitimateRscHeader(new Headers({ rsc: '0' }))).toBe(false)
  })

  it('allows normal document requests', () => {
    expect(
      decideRscBotGuard({
        searchParams: new URLSearchParams(),
        headers: new Headers(),
      }),
    ).toEqual({ action: 'allow' })
  })

  it('allows real RSC flights with header + query', () => {
    expect(
      decideRscBotGuard({
        searchParams: new URLSearchParams('_rsc=deadbeef'),
        headers: new Headers({ rsc: '1' }),
      }),
    ).toEqual({ action: 'allow' })
  })

  it('rejects flight query without RSC header', () => {
    expect(
      decideRscBotGuard({
        searchParams: new URLSearchParams('_rsc=deadbeef'),
        headers: new Headers({ 'user-agent': 'SomeBot/1.0' }),
      }),
    ).toEqual({
      action: 'reject',
      reason: 'rsc_query_without_rsc_header',
    })
    expect(
      decideRscBotGuard({
        searchParams: new URLSearchParams('rsc=abc&utm_source=x'),
        headers: new Headers(),
      }),
    ).toEqual({
      action: 'reject',
      reason: 'rsc_query_without_rsc_header',
    })
  })

  it('strips only RSC flight params', () => {
    const cleaned = stripRscFlightQuery(
      new URL('https://docs.clawql.com/learn?_rsc=abc&utm_source=x&rsc=old'),
    )
    expect(cleaned.searchParams.has('_rsc')).toBe(false)
    expect(cleaned.searchParams.has('rsc')).toBe(false)
    expect(cleaned.searchParams.get('utm_source')).toBe('x')
    expect(cleaned.pathname).toBe('/learn')
  })
})
