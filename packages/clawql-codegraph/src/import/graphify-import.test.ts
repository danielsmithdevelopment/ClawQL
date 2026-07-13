import { describe, expect, it } from "vitest";
import { importGraphifyJson } from "./graphify-import.js";

describe("importGraphifyJson", () => {
  it("maps Graphify node-link JSON to CodeGraphDocument", () => {
    const doc = importGraphifyJson(
      {
        nodes: [
          { id: "auth", label: "authenticate", file_type: "code", source_file: "auth.py", source_location: "L10" },
          { id: "db", label: "DatabasePool", file_type: "code", source_file: "db.py" },
        ],
        links: [
          {
            source: "auth",
            target: "db",
            relation: "calls",
            confidence: "EXTRACTED",
            source_file: "auth.py",
          },
        ],
      },
      { graphId: "demo-graphify", rootPath: "/tmp/demo" }
    );
    expect(doc.graphId).toBe("demo-graphify");
    expect(doc.nodes.auth?.name).toBe("authenticate");
    expect(doc.edges[0]?.kind).toBe("calls");
    expect(doc.edges[0]?.confidence).toBe("EXTRACTED");
    expect(doc.adjacency.auth).toContain("db");
  });
});
