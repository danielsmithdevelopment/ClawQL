import { postIssueVerify, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Arrange: finish issue step-up; UV false refuses with no key created. */
export async function POST(req: Request) {
  return runWitnessHandler(postIssueVerify, req);
}
