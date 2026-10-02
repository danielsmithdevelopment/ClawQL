import { NextResponse } from 'next/server'

import { k8sSyncAllowed } from '@/lib/k8s-dashboard-auth'
import { kubectlVersionOk } from '@/lib/k8s-sync'

export const runtime = 'nodejs'

export async function GET() {
  const kubectl = await kubectlVersionOk()
  return NextResponse.json({
    kubectl,
    syncAllowed: k8sSyncAllowed(),
  })
}
