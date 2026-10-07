import { postDirectorySync, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped IdP directory sync (Okta-shaped until Keycloak Compose). */
export async function POST(req: Request) {
  return runWitnessHandler(postDirectorySync, req);
}
