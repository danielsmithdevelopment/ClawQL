import { postRegisterVerify, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Arrange: finish WebAuthn registration; Pass-when via /audit + Profile UI. */
export async function POST(req: Request) {
  return runWitnessHandler(postRegisterVerify, req);
}
