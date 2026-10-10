export { createLocalGitClient, type LocalGitClient } from "./client.js";
export {
  assertPathUnderRoot,
  assertSafeName,
  ensureDir,
  gitClone,
  headCommit,
  runGit,
} from "./git.js";
export {
  fetchAndReadNote,
  readEvidenceNote,
  writeEvidenceNote,
  writeNotesJsonl,
} from "./notes-store.js";
