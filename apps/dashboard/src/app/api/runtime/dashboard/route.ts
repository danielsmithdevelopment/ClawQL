import { NextResponse } from "next/server";

import { chatStreamEnabled, openclawChatUrl } from "@/lib/agent-chat-upstream.server";
import { isDesktopMode } from "@/lib/desktop-mode";
import { CONSOLE_UI_KIT, readConsoleSurface } from "@/lib/console-surface";
import { getLocalProvidersVaultFilePath } from "@/lib/local-providers-vault.server";
import { getLocalSourcesFilePath } from "@/lib/local-sources-vault.server";
import { getObsidianVaultRoot } from "@/lib/vault-path.server";

export const runtime = "nodejs";

export function GET() {
  const desktopMode = isDesktopMode();
  const consoleSurface = readConsoleSurface();
  const url = openclawChatUrl();
  return NextResponse.json({
    desktopMode,
    consoleSurface,
    uiKit: CONSOLE_UI_KIT,
    vaultRoot: getObsidianVaultRoot(),
    providersVaultPath: desktopMode ? getLocalProvidersVaultFilePath() : null,
    sourcesFilePath: desktopMode ? getLocalSourcesFilePath() : null,
    providersLoadUrl: desktopMode ? "/api/local/providers" : "/api/k8s/secret-env",
    providersSaveUrl: desktopMode ? "/api/local/providers" : "/api/k8s/sync-secret",
    sourcesApiUrl: "/api/local/sources",
    openclawConfigured: Boolean(url && url.length > 0),
    chatStream: chatStreamEnabled(),
  });
}
