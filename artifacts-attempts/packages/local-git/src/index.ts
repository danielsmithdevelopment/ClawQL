export { createLocalGitClient, type LocalGitClient } from "./client.js";
export {
  assertPathUnderRoot,
  assertSafeName,
  ensureDir,
  gitClone,
  headCommit,
  runGit,
  sanitizeGitArgs,
} from "./git.js";
export {
  fetchAndReadNote,
  readEvidenceNote,
  writeEvidenceNote,
  writeNotesJsonl,
} from "./notes-store.js";
