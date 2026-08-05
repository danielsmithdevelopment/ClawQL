/**
 * Bridge org-credits SSO policies → clawql-auth OrgIdpRouter.
 */

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

/** Build an OrgIdpRouter that reads `$CLAWQL_HOME/Payments/org-credits.json`. */
export function createOrgCreditsIdpRouter(
  env: NodeJS.ProcessEnv = process.env
): OrgIdpRouter {
  return {
    async resolveByEmailDomain(domain: string) {
      const needle = domain.trim().toLowerCase().replace(/^@/, "");
      const file = await loadOrgCreditsFile(env);
      for (const org of Object.values(file.orgs)) {
        if ((org.sso?.allowedEmailDomains ?? []).includes(needle)) {
          return routeFromOrg(org);
        }
      }
      return undefined;
    },
    async resolveByIssuer(issuer: string) {
      const file = await loadOrgCreditsFile(env);
      for (const org of Object.values(file.orgs)) {
        if (org.sso?.issuer === issuer) return routeFromOrg(org);
      }
      return undefined;
    },
    async resolveByOrgId(orgId: string) {
      const file = await loadOrgCreditsFile(env);
      const org = file.orgs[orgId.trim().toLowerCase()];
      return org ? routeFromOrg(org) : undefined;
    },
  };
}
