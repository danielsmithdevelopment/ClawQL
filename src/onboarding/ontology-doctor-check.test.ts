import { describe, expect, it } from "vitest";
import { ontologySchemaLooksRemoteOnly, runOntologyDoctorChecks } from "./ontology-doctor-check.js";

describe("ontology doctor (4.4)", () => {
  it("flags object-storage-only schema env", () => {
    expect(ontologySchemaLooksRemoteOnly({ CLAWQL_ONTOLOGY_SCHEMA_STORE: "r2" })).toBe(true);
    expect(ontologySchemaLooksRemoteOnly({ CLAWQL_ONTOLOGY_SCHEMA_IN_OBJECT_STORAGE: "1" })).toBe(
      true
    );
    expect(ontologySchemaLooksRemoteOnly({})).toBe(false);
  });

  it("warns when remote-only env is set even if examples exist", async () => {
    const checks = await runOntologyDoctorChecks({
      ...process.env,
      CLAWQL_ONTOLOGY_SCHEMA_STORE: "s3",
    });
    expect(checks.some((c) => c.message.includes("object-storage-only"))).toBe(true);
    expect(checks.some((c) => c.level === "warn")).toBe(true);
  });

  it("reports Git schema ok in this repo", async () => {
    const checks = await runOntologyDoctorChecks({
      ...process.env,
      CLAWQL_ONTOLOGY_SCHEMA_STORE: undefined,
      CLAWQL_ONTOLOGY_SCHEMA_IN_OBJECT_STORAGE: undefined,
      CLAWQL_ONTOLOGY_SCHEMA_URI: undefined,
    });
    expect(checks.some((c) => /ontology schema in Git/i.test(c.message) && c.level === "ok")).toBe(
      true
    );
  });
});
