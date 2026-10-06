import { postIssueOptions, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Arrange: begin WebAuthn step-up before API key issue (KEY-07). */
export async function POST(req: Request) {
  return runWitnessHandler(postIssueOptions, req);
}
