/**
 * Structured recall for legal.Client / Attorney / Document (Layer 1).
 */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runOntologyRecall } from "./ontology-query.js";

describe("runOntologyRecall legal.Client", () => {
  let vault: string;
  const prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;

  beforeEach(async () => {
    vault = await mkdtemp(join(tmpdir(), "clawql-legal-client-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vault;
    await mkdir(join(vault, "Memory"), { recursive: true });
    await writeFile(
      join(vault, "Memory", "CLT-0017.md"),
      [
        "# Meridian Capital",
        "",
        "CLAWQL_CLIENT_ID=CLT-0017",
        "CLAWQL_CLIENT_NAME=Meridian Capital",
        "CLAWQL_TIER=Platinum",
        "",
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(vault, "Memory", "CLT-0042.md"),
      [
        "# Apex Harbor",
        "",
        "CLAWQL_CLIENT_ID=CLT-0042",
        "CLAWQL_CLIENT_NAME=Apex Harbor Partners",
        "CLAWQL_TIER=Gold",
        "",
      ].join("\n"),
      "utf8"
    );
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    await rm(vault, { recursive: true, force: true });
  });

  it("filters clients by tier", async () => {
    const result = await runOntologyRecall(vault, {
      query: "platinum clients",
      schema: "legal.Client",
      filters: { tier: { eq: "Platinum" } },
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filteredEntities).toBe(1);
    expect(result.hits[0]?.entityId).toBe("CLT-0017");
    expect(result.hits[0]?.fields.name).toBe("Meridian Capital");
  });
});

describe("runOntologyRecall legal.Document", () => {
  let vault: string;
  const prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;

  beforeEach(async () => {
    vault = await mkdtemp(join(tmpdir(), "clawql-legal-doc-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vault;
    await mkdir(join(vault, "Memory"), { recursive: true });
    await writeFile(
      join(vault, "Memory", "DOC-1001.md"),
      [
        "# Purchase agreement",
        "",
        "CLAWQL_DOCUMENT_ID=DOC-1001",
        "CLAWQL_DOCUMENT_TITLE=Purchase Agreement",
        "CLAWQL_MATTER_ID=MAT-2401",
        "CLAWQL_DOCUMENT_TYPE=Agreement",
        "CLAWQL_DOCUMENT_STATUS=Executed",
        "",
      ].join("\n"),
      "utf8"
    );
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    await rm(vault, { recursive: true, force: true });
  });

  it("filters documents by matter and status", async () => {
    const result = await runOntologyRecall(vault, {
      query: "executed agreements for matter",
      schema: "legal.Document",
      filters: {
        matterId: { eq: "MAT-2401" },
        status: { eq: "Executed" },
      },
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filteredEntities).toBe(1);
    expect(result.hits[0]?.entityId).toBe("DOC-1001");
    expect(result.hits[0]?.fields.documentType).toBe("Agreement");
  });
});
