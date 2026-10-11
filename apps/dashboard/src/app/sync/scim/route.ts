import { postScimDirectorySync, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** SCIM PatchOp directory sync (Keycloak / Okta SCIM → Acme groups). */
export async function POST(req: Request) {
  return runWitnessHandler(postScimDirectorySync, req);
}
