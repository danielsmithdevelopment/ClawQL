import { notFound } from "next/navigation";

import { isManagedConsole } from "@/lib/console-surface";

/** Guard for managed-only App Router pages. */
export function requireManagedConsole(): void {
  if (!isManagedConsole()) notFound();
}
