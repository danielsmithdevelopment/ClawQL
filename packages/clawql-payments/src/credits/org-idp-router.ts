/**
 * Bridge org-credits SSO policies → clawql-auth OrgIdpRouter (Effect-primary).
 */

import { Effect } from "effect";
import type { OrgIdpRoute, OrgIdpRouter } from "clawql-auth";
import { loadOrgCreditsFile, type OrgRecord } from "./org.js";

function routeFromOrg(org: OrgRecord): OrgIdpRoute | undefined {
  const domains = org.sso?.allowedEmailDomains ?? [];
  if (!domains.length && !org.sso?.issuer && !org.sso?.jwksUrl) return undefined;
  return {
    orgId: org.orgId,
    allowedEmailDomains: domains,
    issuer: org.sso?.issuer,
    jwksUrl: org.sso?.jwksUrl,
  };
}

function loadOrgs(env: NodeJS.ProcessEnv) {
  return Effect.tryPromise({
    try: () => loadOrgCreditsFile(env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Build an OrgIdpRouter that reads `$CLAWQL_HOME/Payments/org-credits.json`. */
export function createOrgCreditsIdpRouter(env: NodeJS.ProcessEnv = process.env): OrgIdpRouter {
  return {
    resolveByEmailDomain(domain: string) {
      const needle = domain.trim().toLowerCase().replace(/^@/, "");
      return Effect.gen(function* () {
        const file = yield* loadOrgs(env);
        for (const org of Object.values(file.orgs)) {
          if ((org.sso?.allowedEmailDomains ?? []).includes(needle)) {
            return routeFromOrg(org);
          }
        }
        return undefined;
      });
    },
    resolveByIssuer(issuer: string) {
      return Effect.gen(function* () {
        const file = yield* loadOrgs(env);
        for (const org of Object.values(file.orgs)) {
          if (org.sso?.issuer === issuer) return routeFromOrg(org);
        }
        return undefined;
      });
    },
    resolveByOrgId(orgId: string) {
      return Effect.gen(function* () {
        const file = yield* loadOrgs(env);
        const org = file.orgs[orgId.trim().toLowerCase()];
        return org ? routeFromOrg(org) : undefined;
      });
    },
  };
}
