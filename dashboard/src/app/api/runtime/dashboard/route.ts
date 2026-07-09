import { NextResponse } from 'next/server'

import { chatStreamEnabled, openclawChatUrl } from '@/lib/agent-chat-upstream.server'
import { isDesktopMode } from '@/lib/desktop-mode'
import { getLocalProvidersVaultFilePath } from '@/lib/local-providers-vault.server'
import { getObsidianVaultRoot } from '@/lib/vault-path.server'

export const runtime = 'nodejs'

export function GET() {
  const desktopMode = isDesktopMode()
  const url = openclawChatUrl()
  return NextResponse.json({
    desktopMode,
    vaultRoot: getObsidianVaultRoot(),
    providersVaultPath: desktopMode ? getLocalProvidersVaultFilePath() : null,
    providersLoadUrl: desktopMode ? '/api/local/providers' : '/api/k8s/secret-env',
    providersSaveUrl: desktopMode ? '/api/local/providers' : '/api/k8s/sync-secret',
    openclawConfigured: Boolean(url && url.length > 0),
    chatStream: chatStreamEnabled(),
  })
}
