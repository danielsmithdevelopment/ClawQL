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
        join(REPO_ROOT, "examples", "ontology", "entities", "Organization.yaml"),
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
    expect(result.deferredWriteActions.some((a) => a.name === "update_contract_status")).toBe(true);
    expect(written.length).toBeGreaterThanOrEqual(2);
    const catalog = JSON.parse(await readFile(join(outDir, "tools.json"), "utf8"));
    expect(catalog.kind).toBe("GeneratedReadTools");
    expect(catalog.tools.length).toBeGreaterThan(0);
    const stub = await readFile(join(outDir, "ontology-plugin.stub.ts"), "utf8");
    expect(stub).toContain("ONTOLOGY_READ_TOOLS");
    expect(stub).toContain("search_contracts");
  });
});
