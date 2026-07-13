import { NextRequest, NextResponse } from 'next/server'

import {
  buildX402PaymentRequired,
  encodePaymentRequiredHeader,
} from '@/lib/commerce-discovery'

export function GET(request: NextRequest) {
  const requestUrl = request.nextUrl.origin + request.nextUrl.pathname
  const paymentRequired = buildX402PaymentRequired(requestUrl)
  const paymentHeader = encodePaymentRequiredHeader(paymentRequired)
  const accepts = paymentRequired.accepts as Array<{
    amount?: string
    network?: string
  }>
  const firstAccept = accepts[0]

  return new NextResponse(
    JSON.stringify({
      protocol: 'x402',
      error: 'payment_required',
      message:
        'ClawQL docs commerce discovery probe — retry with PAYMENT-SIGNATURE after settling x402 payment.',
      x402Probe: {
        tier: 'discovery',
        amountUsd: '0.001',
        amountAtomic: firstAccept?.amount ?? '1000',
        network: firstAccept?.network,
        documentation: `${request.nextUrl.origin}/payments/clawql-payments`,
      },
    }),
    {
      status: 402,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'WWW-Authenticate': 'x402',
        'PAYMENT-REQUIRED': paymentHeader,
        'Access-Control-Expose-Headers':
          'PAYMENT-REQUIRED, PAYMENT-RESPONSE, WWW-Authenticate',
      },
    },
  )
}

export function HEAD(request: NextRequest) {
  const requestUrl = request.nextUrl.origin + request.nextUrl.pathname
  const paymentRequired = buildX402PaymentRequired(requestUrl)
  const paymentHeader = encodePaymentRequiredHeader(paymentRequired)

  return new NextResponse(null, {
    status: 402,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'WWW-Authenticate': 'x402',
      'PAYMENT-REQUIRED': paymentHeader,
    },
  })
}
