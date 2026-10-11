/**
 * Compile-fail mistakes for deleteAccount + issueApiKey (gdp-ts).
 */
import { Effect } from "effect";
import { name, OrgId, PrincipalId, UserId, type Named, type Proof } from "clawql-gdp";
import type { RecentSignIn } from "./proofs/recent-sign-in.js";
import type { IssuerAuthorized } from "./proofs/issuer-authorized.js";
import { deleteAccountEffect } from "./team/delete-account.js";
import { issueApiKeyWithProofEffect, type ApiKeyIssueSurface } from "./api-keys/store.js";

interface BogusProof<U> extends Proof<"BogusAuthProof", [U]> {
  readonly __proofBrand?: "BogusAuthProof";
}

declare function mintRecent<U>(user: Named<U, ReturnType<typeof UserId>>): RecentSignIn<U>;
declare function mintIssuer<I, O>(
  issuer: Named<I, ReturnType<typeof PrincipalId>>,
  org: Named<O, ReturnType<typeof OrgId>>
): IssuerAuthorized<I, O>;
declare function mintBogusUser<U>(user: Named<U, ReturnType<typeof UserId>>): BogusProof<U>;
declare function mintBogusPrincipal<I>(
  issuer: Named<I, ReturnType<typeof PrincipalId>>
): BogusProof<I>;
declare const store: ApiKeyIssueSurface;

export function accountDeleteMistakes(): Effect.Effect<void> {
  return name(UserId("user-a"), UserId("user-b"), (userA, userB) => {
    const proofA = mintRecent(userA);
    const wrongProof = mintBogusUser(userA);
    const inputA = { orgId: "org", subjectId: userA.value };
    const inputB = { orgId: "org", subjectId: userB.value };

    // @ts-expect-error no proof at all
    void deleteAccountEffect(userA);

    // @ts-expect-error a raw id is not a named value; name it first
    void deleteAccountEffect(UserId("raw"), proofA, store as never, {
      orgId: "org",
      subjectId: "raw",
    });

    // @ts-expect-error the proof is about user A, not user B
    void deleteAccountEffect(userB, proofA, store as never, inputB);

    // @ts-expect-error wrong proof kind
    void deleteAccountEffect(userA, wrongProof, store as never, inputA);

    void deleteAccountEffect(userA, proofA, store as never, inputA);
    return Effect.void;
  });
}

export function apiKeyIssueMistakes(): Effect.Effect<void> {
  return name(PrincipalId("tenant:admin"), OrgId("org_a"), OrgId("org_b"), (issuer, orgA, orgB) => {
    const proofA = mintIssuer(issuer, orgA);
    const wrongProof = mintBogusPrincipal(issuer);
    const inputA = { orgId: orgA.value, subjectId: issuer.value, label: "k" };
    const inputB = { orgId: orgB.value, subjectId: issuer.value, label: "k" };
    const inputRaw = { orgId: "org_raw", subjectId: issuer.value, label: "k" };

    // @ts-expect-error no proof at all
    void issueApiKeyWithProofEffect(store, issuer, orgA, inputA);

    // @ts-expect-error a raw id is not a named value; name it first
    void issueApiKeyWithProofEffect(store, issuer, OrgId("org_raw"), proofA, inputRaw);

    // @ts-expect-error the proof is about org A, not org B
    void issueApiKeyWithProofEffect(store, issuer, orgB, proofA, inputB);

    // @ts-expect-error wrong proof kind
    void issueApiKeyWithProofEffect(store, issuer, orgA, wrongProof, inputA);

    void issueApiKeyWithProofEffect(store, issuer, orgA, proofA, inputA);
    return Effect.void;
  });
}
