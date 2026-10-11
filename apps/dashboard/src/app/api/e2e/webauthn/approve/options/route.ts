import { postApproveOptions, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Arrange: begin WebAuthn assertion for review approve (KEY-11). */
export async function POST(req: Request) {
  return runWitnessHandler(postApproveOptions, req);
}
