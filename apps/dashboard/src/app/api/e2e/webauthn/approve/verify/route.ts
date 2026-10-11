import { postApproveVerify, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Arrange: finish approve assertion; counter regression audits security_key.clone. */
export async function POST(req: Request) {
  return runWitnessHandler(postApproveVerify, req);
}
