import { CONSOLE_UI_KIT, type ConsoleSurface } from "./console-surface";

/** True when ClawQL Desktop (Electron) or explicit desktop env is active. */
export function isDesktopMode(): boolean {
  return (
    process.env.CLAWQL_DESKTOP_MODE?.trim() === "1" ||
    process.env.NEXT_PUBLIC_CLAWQL_DESKTOP_MODE?.trim() === "1"
  );
}

export type DashboardRuntimeConfig = {
  desktopMode: boolean;
  consoleSurface: ConsoleSurface;
  uiKit: typeof CONSOLE_UI_KIT;
  vaultRoot: string;
  providersVaultPath: string;
  sourcesFilePath: string;
  providersLoadUrl: string;
  providersSaveUrl: string;
  sourcesApiUrl: string;
  openclawConfigured: boolean;
  chatStream: boolean;
};
