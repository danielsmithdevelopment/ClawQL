"use client";

import { useEffect, useState } from "react";

import { CONSOLE_UI_KIT, type ConsoleSurface } from "./console-surface";

export type DashboardRuntime = {
  desktopMode: boolean;
  consoleSurface: ConsoleSurface;
  uiKit: typeof CONSOLE_UI_KIT;
  vaultRoot: string;
  providersVaultPath: string | null;
  sourcesFilePath: string | null;
  providersLoadUrl: string;
  providersSaveUrl: string;
  sourcesApiUrl: string;
  openclawConfigured: boolean;
  chatStream: boolean;
};

export function useDashboardRuntime(): DashboardRuntime | null {
  const [runtime, setRuntime] = useState<DashboardRuntime | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runtime/dashboard")
      .then((r) => r.json())
      .then((body: DashboardRuntime) => {
        if (!cancelled) setRuntime(body);
      })
      .catch(() => {
        if (!cancelled) setRuntime(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return runtime;
}
