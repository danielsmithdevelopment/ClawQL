import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { generateOntologyReadTools } from "./generate.js";
import { defaultEntitySchemaPath, lintOntology } from "./lint.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const PKG_ROOT = join(import.meta.dirname, "..");

describe("defaultEntitySchemaPath", () => {
  it("resolves the schema shipped inside clawql-ontology", () => {
    const path = defaultEntitySchemaPath();
    expect(path).toContain(`${join("schemas", "ontology", "entity.schema.json")}`);
    const body = readFileSync(path, "utf8");
    expect(body).toContain("clawql.dev/ontology/v1alpha1");
  });

  it("packaged schema matches monorepo canonical", () => {
    const packaged = readFileSync(
      join(PKG_ROOT, "schemas", "ontology", "entity.schema.json"),
      "utf8"
    );
    const canonical = readFileSync(
      join(REPO_ROOT, "schemas", "ontology", "entity.schema.json"),
      "utf8"
    );
    expect(packaged).toBe(canonical);
  });
});

describe("lintOntology", () => {
  it("accepts examples/ontology/entities", async () => {
    const result = await lintOntology({
      rootDir: REPO_ROOT,
      paths: [join(REPO_ROOT, "examples", "ontology", "entities")],
      schemaPath: join(REPO_ROOT, "schemas", "ontology", "entity.schema.json"),
    });
    expect(result.ok).toBe(true);
    expect(result.entities).toEqual(expect.arrayContaining(["Contract", "Organization"]));
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("accepts .cqe extension (ADR 0010 dual-accept)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ont-cqe-"));
    try {
      await mkdir(join(dir, "entities"), { recursive: true });
      const body = await readFile(
        join(REPO_ROOT, "examples", "ontology", "entities", "Organization.cqe"),
        "utf8"
      );
      await writeFile(join(dir, "entities", "Organization.cqe"), body, "utf8");
      const result = await lintOntology({
        rootDir: dir,
        paths: [join(dir, "entities")],
        schemaPath: join(REPO_ROOT, "schemas", "ontology", "entity.schema.json"),
      });
      expect(result.ok).toBe(true);
      expect(result.entities).toContain("Organization");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects write action without kinetic", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ont-"));
    try {
      await mkdir(join(dir, "entities"), { recursive: true });
      await writeFile(
        join(dir, "entities", "Bad.yaml"),
        [
          "apiVersion: clawql.dev/ontology/v1alpha1",
          "kind: Entity",
          "metadata:",
          "  name: Bad",
          "spec:",
          "  description: bad",
          "  properties:",
          "    id: { type: string, required: true }",
          "  actions:",
          "    - name: update_bad",
          "      kind: write",
          "      kinetic: false",
          "",
        ].join("\n"),
        "utf8"
      );
      const result = await lintOntology({
        rootDir: dir,
        paths: [join(dir, "entities")],
        schemaPath: join(REPO_ROOT, "schemas", "ontology", "entity.schema.json"),
      });
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.message.includes("kinetic: true"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("generateOntologyReadTools", () => {
  let outDir: string;

  afterEach(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it("emits tools.json and stub for Contract/Organization", async () => {
    outDir = await mkdtemp(join(tmpdir(), "clawql-ont-gen-"));
    const { result, written, lint } = await generateOntologyReadTools({
      rootDir: REPO_ROOT,
      paths: [join(REPO_ROOT, "examples", "ontology", "entities")],
      schemaPath: join(REPO_ROOT, "schemas", "ontology", "entity.schema.json"),
      outDir,
    });
    expect(lint?.ok).toBe(true);
    expect(result.tools.some((t) => t.name === "search_contracts")).toBe(true);
    expect(result.tools.some((t) => t.name === "get_contract")).toBe(true);
    expect(result.tools.some((t) => t.name === "get_contract_parties")).toBe(true);
    expect(result.writeTools.some((t) => t.name === "update_contract_status")).toBe(true);
    expect(result.writeTools.every((t) => t.kinetic_level === "LOW" && t.executor === "NATIVE")).toBe(
      true
    );
    expect(result.deferredWriteActions.some((a) => a.name === "process_contract_document")).toBe(
      true
    );
    expect(result.deferredWriteActions.some((a) => a.name === "update_contract_status")).toBe(false);
    expect(written.length).toBeGreaterThanOrEqual(4);
    const catalog = JSON.parse(await readFile(join(outDir, "tools.json"), "utf8"));
    expect(catalog.kind).toBe("GeneratedOntologyTools");
    expect(catalog.writeTools.length).toBeGreaterThan(0);
    const stub = await readFile(join(outDir, "ontology-plugin.stub.ts"), "utf8");
    expect(stub).toContain("ONTOLOGY_READ_TOOLS");
    expect(stub).toContain("ONTOLOGY_WRITE_TOOLS");
    expect(stub).toContain("update_contract_status");
    expect(stub).toContain("search_contracts");
    const index = await readFile(join(outDir, "index.md"), "utf8");
    expect(index).toContain("Ontology entity catalog");
    expect(index).toContain("Contract");
    const onyx = JSON.parse(await readFile(join(outDir, "onyx-sources.stub.json"), "utf8"));
    expect(onyx.kind).toBe("OnyxSourceStubs");
  });
});

describe("examples .cqe dual-accept", () => {
  it("lints Contract.cqe and Organization.cqe", async () => {
    const result = await lintOntology({
      rootDir: REPO_ROOT,
      paths: [
        join(REPO_ROOT, "examples", "ontology", "entities", "Contract.cqe"),
        join(REPO_ROOT, "examples", "ontology", "entities", "Organization.cqe"),
      ],
      schemaPath: join(REPO_ROOT, "schemas", "ontology", "entity.schema.json"),
    });
    expect(result.ok).toBe(true);
    expect(result.entities).toEqual(expect.arrayContaining(["Contract", "Organization"]));
  });
});

describe("scaffold + fixtures + pii", () => {
  it("init / create-entity / import legal pack", async () => {
    const { initOntologyTree, createOntologyEntity, importOntologyPack, listOntologyPacks } =
      await import("./scaffold.js");
    expect(listOntologyPacks()).toContain("legal");
    const dir = await mkdtemp(join(tmpdir(), "clawql-ont-scaffold-"));
    try {
      const written = await initOntologyTree(dir);
      expect(written.some((w) => w.includes("entities"))).toBe(true);
      const entity = await createOntologyEntity(dir, "Matter");
      expect(entity.endsWith("Matter.cqe")).toBe(true);
      const imported = await importOntologyPack(dir, "legal");
      expect(imported.length).toBeGreaterThanOrEqual(3);
      const lint = await lintOntology({
        rootDir: dir,
        paths: [join(dir, ".clawql", "ontology", "entities")],
        schemaPath: join(REPO_ROOT, "schemas", "ontology", "entity.schema.json"),
      });
      expect(lint.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fixture get_contract returns typed enum status and redacts PII", async () => {
    const { getContract, resetOntologyFixtureDbForTests } = await import("./fixture-store.js");
    const { redactOntologyPiiFields } = await import("./pii.js");
    resetOntologyFixtureDbForTests();
    const row = getContract("acc-8821");
    expect(row).toBeTruthy();
    expect(row!.status).toBe("active");
    expect(typeof row!.value?.amount).toBe("number");
    const redacted = await redactOntologyPiiFields(row, [
      "parties.contact_email",
      "parties.contact_phone",
    ]);
    const parties = (redacted as { parties: Array<{ contact_email?: string }> }).parties;
    expect(parties.some((p) => p.contact_email === "[REDACTED]")).toBe(true);
  });
});

describe("LOW Transaction Sandbox (3.3)", () => {
  it("commits update_contract_status when ATR allows", async () => {
    const { resetOntologyFixtureDbForTests, getContract } = await import("./fixture-store.js");
    const { resetKineticAuditForTests, runLowKineticTransaction, listKineticAudit } = await import(
      "./kinetic/index.js"
    );
    resetOntologyFixtureDbForTests();
    resetKineticAuditForTests();
    const result = await runLowKineticTransaction({
      tool: "update_contract_status",
      entity: "Contract",
      recordId: "acc-8821",
      field: "status",
      nextValue: "expired",
      claims: { sub: "tester", role: "agent", scope: ["ontology:write"] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.before).toBe("active");
      expect(result.after).toBe("expired");
      expect(result.audit.action).toBe("KINETIC_COMMITTED");
    }
    expect(getContract("acc-8821")?.status).toBe("expired");
    expect(listKineticAudit().some((e) => e.action === "KINETIC_COMMITTED")).toBe(true);
  });

  it("denies update when ATR scope is insufficient", async () => {
    const { resetOntologyFixtureDbForTests, getContract } = await import("./fixture-store.js");
    const { resetKineticAuditForTests, runLowKineticTransaction } = await import(
      "./kinetic/index.js"
    );
    resetOntologyFixtureDbForTests();
    resetKineticAuditForTests();
    const result = await runLowKineticTransaction({
      tool: "update_contract_status",
      entity: "Contract",
      recordId: "acc-8821",
      field: "status",
      nextValue: "terminated",
      claims: { sub: "reader", role: "agent", scope: ["ontology:read"] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("denied");
      expect(result.audit?.action).toBe("KINETIC_DENIED");
    }
    expect(getContract("acc-8821")?.status).toBe("active");
  });
});
