/**
 * Trusted module: mint EraseAuthorized for memory erase / crypto-shred.
 */

import { defineProof, type Named, type Proof, type PrincipalId, type VaultPath } from "clawql-gdp";
import { Effect } from "effect";

const EraseAuthorizedProver = defineProof("EraseAuthorized");

export interface EraseAuthorized<P, V> extends Proof<"EraseAuthorized", [P, V]> {}

export type EraseAuthorizedEvidence = {
  readonly principalId: string;
  readonly vaultPath: string;
  /** When set, path must be under this scope prefix. */
  readonly memoryScope?: string | null;
  /** Keys enforcement active — principal must be non-empty. */
  readonly keysEnforcementActive?: boolean;
};

export function eraseAuthorizedEffect<P, V>(
  principal: Named<P, PrincipalId>,
  path: Named<V, VaultPath>,
  evidence: EraseAuthorizedEvidence
): Effect.Effect<EraseAuthorized<P, V> | null> {
  return Effect.sync(() => {
    if (principal.value !== evidence.principalId.trim()) return null;
    if (path.value !== evidence.vaultPath.trim()) return null;
    if (evidence.keysEnforcementActive && !principal.value) return null;
    const scope = evidence.memoryScope?.trim();
    if (scope && !path.value.startsWith(scope.replace(/\/?$/, "/")) && path.value !== scope) {
      return null;
    }
    return EraseAuthorizedProver.prove(principal, path) as EraseAuthorized<P, V>;
  });
}
