import { postDirectorySync, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped IdP directory sync (SCIM / Keycloak; Okta-shaped flags still accepted). */
export async function POST(req: Request) {
  return runWitnessHandler(postDirectorySync, req);
}
