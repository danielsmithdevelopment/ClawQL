import { postRegisterOptions, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Arrange: begin WebAuthn registration for CDP virtual authenticator. */
export async function POST(req: Request) {
  return runWitnessHandler(postRegisterOptions, req);
}
