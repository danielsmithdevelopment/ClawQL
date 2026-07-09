/** True when ClawQL Desktop (Electron) or explicit desktop env is active. */
export function isDesktopMode(): boolean {
  return (
    process.env.CLAWQL_DESKTOP_MODE?.trim() === '1' ||
    process.env.NEXT_PUBLIC_CLAWQL_DESKTOP_MODE?.trim() === '1'
  )
}

export type DashboardRuntimeConfig = {
  desktopMode: boolean
  vaultRoot: string
  providersVaultPath: string
  providersLoadUrl: string
  providersSaveUrl: string
  openclawConfigured: boolean
  chatStream: boolean
}
