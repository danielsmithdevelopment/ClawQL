/**
 * Workflow: bundle, manifest, Merkle root, Arweave (Turbo) or local dry-run, gradual deploy %.
 * Shared prepareRelease lives in @artifacts-attempts/pipeline.
 */

export {
  prepareRelease,
  type ReleaseInput,
  type ReleaseOutput,
} from "@artifacts-attempts/pipeline";

export default {
  async fetch(): Promise<Response> {
    return new Response("release workflow", { status: 501 });
  },
};
