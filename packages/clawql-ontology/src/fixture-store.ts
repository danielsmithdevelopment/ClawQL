/**
 * Demo / fixture ontology store — typed entities for CLAWQL_ENABLE_ONTOLOGY.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type FixtureContract = {
  contract_id: string;
  title: string;
  status: "draft" | "active" | "expired" | "terminated";
  effective_date: string;
  expiry_date?: string;
  value: { amount: number; currency: string };
  parties: Array<{
    organization_id: string;
    name: string;
    type: string;
    contact_email?: string;
    contact_phone?: string;
  }>;
};

export type FixtureOrganization = {
  organization_id: string;
  name: string;
  contact_email?: string;
  contact_phone?: string;
};

export type OntologyFixtureDb = {
  contracts: FixtureContract[];
  organizations: FixtureOrganization[];
};

const DEFAULT_DB: OntologyFixtureDb = {
  contracts: [
    {
      contract_id: "acc-8821",
      title: "Enterprise Software License Agreement — Acme Corp",
      status: "active",
      effective_date: "2026-01-15",
      expiry_date: "2027-01-14",
      value: { amount: 48500.0, currency: "USD" },
      parties: [
        {
          organization_id: "org-4421",
          name: "Acme Corporation",
          type: "customer",
          contact_email: "legal@acme.example",
          contact_phone: "+1-555-0100",
        },
      ],
    },
  ],
  organizations: [
    {
      organization_id: "org-4421",
      name: "Acme Corporation",
      contact_email: "legal@acme.example",
      contact_phone: "+1-555-0100",
    },
  ],
};

let cached: OntologyFixtureDb | null = null;

export function loadOntologyFixtureDb(): OntologyFixtureDb {
  if (cached) return cached;
  const override = process.env.CLAWQL_ONTOLOGY_FIXTURE?.trim();
  if (override) {
    cached = JSON.parse(readFileSync(override, "utf8")) as OntologyFixtureDb;
    return cached;
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const packaged = join(here, "..", "fixtures", "legal-demo.json");
    cached = JSON.parse(readFileSync(packaged, "utf8")) as OntologyFixtureDb;
    return cached;
  } catch {
    cached = DEFAULT_DB;
    return cached;
  }
}

/** Reset cache (tests). */
export function resetOntologyFixtureDbForTests(): void {
  cached = null;
}

export function getContract(id: string): FixtureContract | undefined {
  return loadOntologyFixtureDb().contracts.find((c) => c.contract_id === id);
}

export function searchContracts(query: string, limit = 20): FixtureContract[] {
  const q = query.trim().toLowerCase();
  const all = loadOntologyFixtureDb().contracts;
  if (!q) return all.slice(0, limit);
  return all
    .filter(
      (c) =>
        c.contract_id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.status.includes(q) ||
        c.parties.some((p) => p.name.toLowerCase().includes(q))
    )
    .slice(0, limit);
}

export function listContractsExpiring(days: number): FixtureContract[] {
  const now = Date.now();
  const horizon = now + days * 86400000;
  return loadOntologyFixtureDb().contracts.filter((c) => {
    if (!c.expiry_date) return false;
    const t = Date.parse(c.expiry_date);
    return Number.isFinite(t) && t >= now && t <= horizon;
  });
}

export function getOrganization(id: string): FixtureOrganization | undefined {
  return loadOntologyFixtureDb().organizations.find((o) => o.organization_id === id);
}

export function searchOrganizations(query: string, limit = 20): FixtureOrganization[] {
  const q = query.trim().toLowerCase();
  const all = loadOntologyFixtureDb().organizations;
  if (!q) return all.slice(0, limit);
  return all
    .filter(
      (o) =>
        o.organization_id.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
    )
    .slice(0, limit);
}

export function getContractParties(contractId: string): FixtureContract["parties"] {
  return getContract(contractId)?.parties ?? [];
}

export function getOrganizationContracts(organizationId: string): FixtureContract[] {
  return loadOntologyFixtureDb().contracts.filter((c) =>
    c.parties.some((p) => p.organization_id === organizationId)
  );
}
