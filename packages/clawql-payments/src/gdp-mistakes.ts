/**
 * Compile-fail mistakes for checkout VerifiedCheckoutSessionUser (gdp-ts).
 */
import { name, UserId, type Named, type Proof } from "clawql-gdp";
import type { VerifiedCheckoutSessionUser } from "./proofs/verified-checkout-session-user.js";
import { buildCheckoutSessionMetadataWithVerifiedUser } from "./stripe/stripe-billing-service.js";

interface BogusProof<U> extends Proof<"BogusCheckoutProof", [U]> {
  readonly __proofBrand?: "BogusCheckoutProof";
}

declare function mintCheckoutProof<U>(
  user: Named<U, ReturnType<typeof UserId>>
): VerifiedCheckoutSessionUser<U>;

declare function mintBogus<U>(user: Named<U, ReturnType<typeof UserId>>): BogusProof<U>;

const metaInput = {
  orgName: "Acme",
  plan: "pro" as const,
  ownerEmail: "a@example.com",
};

export function checkoutMistakes(): void {
  return name(UserId("user-a"), UserId("user-b"), (userA, userB) => {
    const proofA = mintCheckoutProof(userA);
    const wrongProof = mintBogus(userA);

    // @ts-expect-error no proof at all
    void buildCheckoutSessionMetadataWithVerifiedUser(userA, metaInput);

    // @ts-expect-error a raw id is not a named value; name it first
    void buildCheckoutSessionMetadataWithVerifiedUser(UserId("raw"), proofA, metaInput);

    // @ts-expect-error the proof is about user A, not user B
    void buildCheckoutSessionMetadataWithVerifiedUser(userB, proofA, metaInput);

    // @ts-expect-error wrong proof kind
    void buildCheckoutSessionMetadataWithVerifiedUser(userA, wrongProof, metaInput);

    void buildCheckoutSessionMetadataWithVerifiedUser(userA, proofA, metaInput);
  });
}
