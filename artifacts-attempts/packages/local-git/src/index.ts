export { createLocalGitClient, type LocalGitClient } from "./client.js";
export { ensureDir, headCommit, runGit } from "./git.js";
export {
  fetchAndReadNote,
  readEvidenceNote,
  writeEvidenceNote,
  writeNotesJsonl,
} from "./notes-store.js";
