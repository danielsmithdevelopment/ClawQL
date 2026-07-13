import { NextRequest, NextResponse } from 'next/server'

import {
  buildCommerce402Headers,
  buildX402PaymentRequired,
} from '@/lib/commerce-discovery'

export function GET(request: NextRequest) {
  const requestUrl = request.nextUrl.origin + request.nextUrl.pathname
  const paymentRequired = buildX402PaymentRequired(requestUrl)
  const accepts = paymentRequired.accepts as Array<{
    amount?: string
    network?: string
  }>
  const firstAccept = accepts[0]

  return new NextResponse(
    JSON.stringify({
      type: 'https://paymentauth.org/problems/payment-required',
      title: 'Payment Required',
      status: 402,
      detail: 'Payment is required.',
      protocol: 'x402',
      error: 'payment_required',
      message:
        'ClawQL docs commerce discovery probe — retry with PAYMENT-SIGNATURE or Authorization: Payment after settling.',
      x402Probe: {
        tier: 'discovery',
        amountUsd: '0.001',
        amountAtomic: firstAccept?.amount ?? '1000',
        network: firstAccept?.network,
        documentation: `${request.nextUrl.origin}/payments/clawql-payments`,
      },
      x402: paymentRequired,
    }),
    {
      status: 402,
      headers: buildCommerce402Headers({
        requestUrl,
        origin: request.nextUrl.origin,
      }),
    },
  )
}

export function HEAD(request: NextRequest) {
  const requestUrl = request.nextUrl.origin + request.nextUrl.pathname

  return new NextResponse(null, {
    status: 402,
    headers: buildCommerce402Headers({
      requestUrl,
      origin: request.nextUrl.origin,
    }),
  })
}
